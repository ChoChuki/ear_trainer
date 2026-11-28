"""Focused browser regression for manual selected-pitch preview and shorter AP mask."""
import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ENTRY = sys.argv[1] if len(sys.argv) > 1 else "index.html"
INSTRUMENT = sys.argv[2] if len(sys.argv) > 2 else "violin"
OTHER = "piano" if INSTRUMENT == "violin" else "violin"


def document(instrument, stored=None):
    html = (ROOT / ENTRY).read_text(encoding="utf-8")
    if ENTRY == "index.html":
        def inline(match):
            name = match[1]
            source = (ROOT / name).read_text(encoding="utf-8")
            if name == "app.js":
                source = "\n".join(
                    (ROOT / "vendor" / name).read_text(encoding="utf-8")
                    for name in ["0000_JCLive_sf2_file.js", "0400_JCLive_sf2_file.js"]
                ) + "\n" + source
            return "<script>\n" + source + "\n</script>"
        html = re.sub(r'<script src="\./([^\"]+)"></script>', inline, html)
        html = re.sub(
            r'<link rel="stylesheet" href="\./([^\"]+)">',
            lambda match: "<style>\n" + (ROOT / match[1]).read_text(encoding="utf-8") + "\n</style>",
            html,
        )
    # The storage shim supplies an origin-independent store for real data code.
    storage = json.dumps(stored or {}).replace("</", "<\\/")
    shim = """<head><script>{const store=STORED;
    Object.defineProperty(window,'localStorage',{value:new Proxy(store,{get(t,k){
      if(k==='getItem')return key=>Object.prototype.hasOwnProperty.call(t,key)?t[key]:null;
      if(k==='setItem')return (key,value)=>{t[key]=String(value)};
      if(k==='removeItem')return key=>delete t[key];
      if(k==='clear')return ()=>{for(const k in t)delete t[k]};
      return t[k];}})});}</script>""".replace("STORED", storage)
    return html.replace("<head>", shim, 1).replace(
        "const pageOptions = new URLSearchParams(location.search);",
        f'const pageOptions = new URLSearchParams("instrument={instrument}");',
        1,
    )


with sync_playwright() as playwright:
    browser=playwright.chromium.launch(executable_path=os.environ.get('EAR_TRAINER_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(document(INSTRUMENT),wait_until='domcontentloaded');page.wait_for_function('ready',timeout=20000)
    assert page.text_content('#appVersion')=='3.0.7'
    page.evaluate("""()=>{window.queued=[];const q=queueInstrumentNote;queueInstrumentNote=(sound,midi,at,duration=PLAY_DURATION,volume=.75)=>{queued.push({sound,midi,at,duration});return q(sound,midi,at,duration,volume);};UnifiedModel.drawAP=()=>65;}""")
    page.locator('#learningNotes [data-pc="4"]').tap()
    for display in ['buttons','instrument']:
        page.locator('#displaySelect').select_option(display)
        assert page.locator('#selectionPreviewKeys button').evaluate_all('b=>b.map(x=>Number(x.dataset.previewMidi))')==[64,65,76,77]
        page.evaluate('queued=[]')
        for i,m in enumerate([77,64,77]):
            page.locator(f'#selectionPreviewKeys [data-preview-midi="{m}"]').tap()
            page.wait_for_function('n=>queued.length===n',arg=i+1)
        page.wait_for_timeout(1000)
        assert page.evaluate('queued.map(x=>x.midi)')==[77,64,77]
        assert page.evaluate('queued.every(x=>x.duration===PLAY_DURATION)&&!testActive&&session===null')
    page.locator('#displaySelect').select_option('buttons')
    page.evaluate('cfg.mask=true;cfg.auto=false;cfg.apLimit=null;queued=[]')
    page.locator('#playButton').tap();page.wait_for_function("phase==='answer'",timeout=15000)
    assert page.evaluate('trial.resetNoteCount>=3&&trial.resetNoteCount<=4')
    notes=page.evaluate('queued')
    assert len(notes)==page.evaluate('trial.resetNoteCount+1')
    assert all(abs(n['duration']-.7)<1e-8 for n in notes),notes
    assert len({n['midi']%12 for n in notes[:-1]})==len(notes)-1
    assert all(b['at']>=a['at']+a['duration']+.089 for a,b in zip(notes,notes[1:]))
    page.locator('#otherButton').tap();page.wait_for_function("phase==='done'");assert page.evaluate('!trial.correct&&session.reviewPaused&&nextTimer===null')
    assert not errors,errors
    print('PASS',ENTRY,INSTRUMENT,'manual preview, repeated taps, both answer surfaces, no autoplay, 3-4 full-length maskers, wrong-answer pause',flush=True)
    browser.close()
