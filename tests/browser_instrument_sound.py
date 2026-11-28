"""Browser regression for instrument selector: capture navigation and reload the target.
The browser uses in-memory documents because local URL navigation may be blocked.
Actual selector handlers, storage serialization, audio loading and preview run normally.
"""
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ENTRY = sys.argv[1] if len(sys.argv)>1 else 'index.html'
html=(ROOT/ENTRY).read_text(encoding='utf-8')
if ENTRY=='index.html':
    def inline(m):
        name=m[1]; source=(ROOT/name).read_text(encoding='utf-8')
        if name=='app.js':
            source='\n'.join((ROOT/'vendor'/name).read_text(encoding='utf-8') for name in ['0000_JCLive_sf2_file.js','0400_JCLive_sf2_file.js'])+'\n'+source
        return '<script>\n'+source+'\n</script>'
    html=re.sub(r'<script src="\./([^\"]+)"></script>',inline,html)
    html=re.sub(r'<link rel="stylesheet" href="\./([^\"]+)">',lambda m:'<style>\n'+(ROOT/m[1]).read_text(encoding='utf-8')+'\n</style>',html)
assert html.count('location.replace(url.href);')==1
html=html.replace('location.replace(url.href);','window.nextNavigation=url.href;')
html=html.replace('const url=new URL(location.href);','const url=new URL(window.testURL);')

def document(url,stored):
    shim='''<head><script>window.testURL=URL;{const store=STORED;Object.defineProperty(window,'localStorage',{value:new Proxy(store,{get(t,k){if(k==='getItem')return key=>Object.prototype.hasOwnProperty.call(t,key)?t[key]:null;if(k==='setItem')return (key,value)=>{t[key]=String(value)};if(k==='removeItem')return key=>delete t[key];if(k==='clear')return ()=>{for(const k in t)delete t[k]};return t[k];}})});}</script>'''
    shim=shim.replace('URL;',json.dumps(url)+';',1).replace('STORED',json.dumps(stored).replace('</','<\\/'),1)
    return html.replace('<head>',shim,1).replace('const pageOptions = new URLSearchParams(location.search);','const pageOptions = new URLSearchParams('+json.dumps(urlparse(url).query)+');',1)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('EAR_TRAINER_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
    errors=[]
    page=None
    url='https://ear-trainer.test/'+ENTRY
    def load(target,stored):
        global page,url
        if page is not None: page.close()
        url=target;page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(document(url,stored),wait_until='domcontentloaded')
        page.wait_for_function('ready',timeout=20000)
    def storage():
        return page.evaluate('Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))')
    def expect(sound,instrument):
        page.wait_for_function('ready',timeout=20000)
        assert page.locator('#appVersion').text_content()=='3.0.11'
        assert page.locator('#instrumentSelect').input_value()==instrument
        assert page.locator('#soundSelect').input_value()==sound
        assert page.evaluate('cfg.timbre')==sound
    def select_sound(sound,instrument):
        page.locator('#soundSelect').select_option(sound)
        expect(sound,instrument)
    def switch(instrument):
        oldmode=page.evaluate('mode')
        page.locator('#instrumentSelect').select_option(instrument)
        page.wait_for_function('!!window.nextNavigation')
        target=page.evaluate('nextNavigation')
        stored=storage()
        assert json.loads(stored['ear-unified-timbre-v1'])==instrument
        query=parse_qs(urlparse(target).query)
        assert query.get('instrument',['violin'])[0]==instrument
        assert query['mode']==[oldmode]
        load(target,stored)
        expect(instrument,instrument)
        assert page.evaluate('mode')==oldmode
    def preview_sound(sound):
        page.evaluate('''()=>{window.played=[];if(window.instrumentSoundProbe)return;window.instrumentSoundProbe=true;const original=queueInstrumentNote;queueInstrumentNote=(timbre,midi,...args)=>{played.push({timbre,midi});return original(timbre,midi,...args);};}''')
        page.locator('#selectionPreviewKeys button').first.tap()
        page.wait_for_function('played.length>=1',timeout=8000)
        assert page.evaluate('played.length')==1
        assert page.evaluate('played[0].timbre')==sound
    load(url,{})
    expect('violin','violin')
    switch('piano');preview_sound('piano')
    select_sound('violin','piano');preview_sound('violin')
    page.locator('#modeSelect').select_option('interval');expect('violin','piano')
    load(url,storage());expect('violin','piano')
    select_sound('mixed','piano');switch('violin')
    page.locator('#modeSelect').select_option('single');preview_sound('violin')
    select_sound('mixed','violin');switch('piano');preview_sound('piano')
    switch('violin');select_sound('piano','violin')
    load(url,storage());expect('piano','violin')
    assert not errors,errors
    print('PASS',ENTRY,'instrument switch and stored sound, mixed reset, manual overrides and audio routing',flush=True)
    browser.close()
