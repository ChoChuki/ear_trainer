"""Answer-surface lifecycle regression."""
import re,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
entry=sys.argv[1] if len(sys.argv)>1 else 'index.html'
instrument=sys.argv[2] if len(sys.argv)>2 else 'violin'
html=(ROOT/entry).read_text(encoding='utf-8')
if entry=='index.html':
    def inline(m):
        name=m[1];s=(ROOT/name).read_text(encoding='utf-8')
        if name=='app.js':s='\n'.join((ROOT/'vendor'/x).read_text(encoding='utf-8') for x in ['0000_JCLive_sf2_file.js','0400_JCLive_sf2_file.js'])+'\n'+s
        return '<script>\n'+s+'\n</script>'
    html=re.sub(r'<script src="\./([^\"]+)"></script>',inline,html)
    html=re.sub(r'<link rel="stylesheet" href="\./([^\"]+)">',lambda m:'<style>\n'+(ROOT/m[1]).read_text(encoding='utf-8')+'\n</style>',html)
shim='''<head><script>{const store={};Object.defineProperty(window,'localStorage',{value:new Proxy(store,{get(t,k){if(k==='getItem')return key=>Object.prototype.hasOwnProperty.call(t,key)?t[key]:null;if(k==='setItem')return (key,value)=>{t[key]=String(value)};if(k==='removeItem')return key=>delete t[key];if(k==='clear')return ()=>{for(const k in t)delete t[k];};return t[k];}})});}</script>'''
html=html.replace('<head>',shim,1).replace('const pageOptions = new URLSearchParams(location.search);',f'const pageOptions = new URLSearchParams("instrument={instrument}");',1)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded');page.wait_for_function('ready',timeout=20000)
    assert page.text_content('#appVersion')=='3.0.11'
    page.evaluate("""()=>{UnifiedModel.drawAP=()=>65;UnifiedModel.drawRP=()=>({reference:60,target:67,size:7,direction:'higher'});cfg.known=[4,5];cfg.octaves=[4,5];cfg.mask=false;cfg.auto=false;cfg.apLimit=null;cfg.rpLimit=null;renderSettings();}""")
    def tap(s):page.locator(s).first.tap()
    def idle():
        assert page.evaluate("!testActive&&phase==='idle'")
        for s in ['#answerArea','#buttonBoard','#keyboardCard','#extraAnswers','#answerCard','#nextButton','#replayButton']:
            assert page.locator(s).is_hidden(),s
        assert page.locator('#playButton').is_visible()
        assert page.locator('#keyboard button:enabled').count()==0
        assert page.locator('#buttonBoard button').count()==0
        if page.evaluate("mode==='single'"):
            assert page.locator('#selectionPreviewKeys [data-preview-midi="64"]').is_enabled()
    page.evaluate("""()=>{window.played=[];const q=queueInstrumentNote;
      queueInstrumentNote=(sound,midi,at,duration=PLAY_DURATION,volume=.75)=>{played.push(midi);return q(sound,midi,at,duration,volume)};
      window.freePlayed=[];const f=playFreeVoice;playFreeVoice=(midi,sound)=>{freePlayed.push(midi);return f(midi,sound)};
    }""")
    idle()
    for mode in ['single','interval']:
        page.locator('#modeSelect').select_option(mode)
        for display in ['buttons','instrument']:
            page.locator('#displaySelect').select_option(display);idle()
            tap('#playButton');page.wait_for_function("phase==='answer'",timeout=15000)
            assert page.locator('#answerArea').is_visible()
            assert page.locator('#buttonBoard' if display=='buttons' else '#keyboardCard').is_visible()
            assert page.locator('#buttonBoard' if display=='instrument' else '#keyboardCard').is_hidden()
            if mode=='single':tap('#otherButton')
            elif display=='buttons':tap('#intervalAnswers [data-interval="6"]')
            else:tap('#keyboard [data-midi="66"]')
            page.wait_for_function("phase==='done'")
            assert page.evaluate('!trial.correct&&session.reviewPaused&&session.total===1')
            page.evaluate('played=[]')
            if display=='instrument':tap('#keyboard [data-midi="64"]');expected=[64]
            elif mode=='single':
                tap('#apNameKeys [data-pc="4"]');assert page.evaluate('played.length===0')
                tap('#apOctaveKeys [data-octave="4"]');expected=[64]
            else:tap('#intervalAnswers [data-interval="5"]');expected=[60,65]
            page.wait_for_function(f'played.length==={len(expected)}');assert page.evaluate('played')==expected
            assert page.evaluate("session.total===1&&phase==='done'")
            tap('#playButton');idle();assert page.locator('#sessionSummary').is_visible()
            assert page.evaluate('summarySession.total===1')
            if mode=='single':
                page.evaluate('played=[]');tap('#selectionPreviewKeys [data-preview-midi="64"]')
                page.wait_for_function('played.length===1');assert page.evaluate('played[0]===64')
            idle()
            print('PASS',entry,instrument,mode,display,'setup/answer/review/stop',flush=True)
    page.locator('#modeSelect').select_option('single');page.locator('#displaySelect').select_option('buttons')
    tap('#playButton');page.wait_for_function("phase==='countdown'");tap('#playButton');idle()
    page.locator('#modeSelect').select_option('free');assert page.locator('#keyboardCard').is_visible()
    assert page.locator('#keyboard button:disabled').count()==0
    tap('#keyboard [data-midi="64"]');page.wait_for_function('freePlayed.includes(64)')
    page.locator('#modeSelect').select_option('single');idle()
    assert not errors,errors
    print('PASS',entry,instrument,'stop during countdown and Free Play',flush=True)
    browser.close()
