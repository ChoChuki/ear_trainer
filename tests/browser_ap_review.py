"""In-memory Chromium UI regression for ordinary + standalone entries.
Local file / HTTP navigation can be blocked by managed browsers, so assets are
inlined for the ordinary entry and original audio samples are still decoded.
"""
import re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
entry=sys.argv[1] if len(sys.argv)>1 else 'index.html'
instrument=sys.argv[2] if len(sys.argv)>2 else 'piano'
size=320 if instrument=='piano' else 390
height=568 if size==320 else 844
html=(ROOT/entry).read_text(encoding='utf-8')
if entry=='index.html':
    def inline(m):
        name=m[1];s=(ROOT/name).read_text(encoding='utf-8')
        if name=='app.js':s='\n'.join((ROOT/'vendor'/x).read_text(encoding='utf-8') for x in ['0000_JCLive_sf2_file.js','0400_JCLive_sf2_file.js'])+'\n'+s
        return '<script>\n'+s+'\n</script>'
    html=re.sub(r'<script src="\./([^\"]+)"></script>',inline,html)
    html=re.sub(r'<link rel="stylesheet" href="\./([^\"]+)">',lambda m:'<style>\n'+(ROOT/m[1]).read_text(encoding='utf-8')+'\n</style>',html)
# localStorage fallback permits genuine persisted row reads inside a memory page.
shim='''<head><script>{const store={};Object.defineProperty(window,'localStorage',{value:new Proxy(store,{get(t,k){if(k==='getItem')return key=>Object.prototype.hasOwnProperty.call(t,key)?t[key]:null;if(k==='setItem')return (key,value)=>{t[key]=String(value)};if(k==='removeItem')return key=>delete t[key];if(k==='clear')return ()=>{for(const k in t)delete t[k]};return t[k];}})});}</script>'''
html=html.replace('<head>',shim,1).replace('const pageOptions = new URLSearchParams(location.search);',f'const pageOptions = new URLSearchParams("instrument={instrument}");',1)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':size,'height':height},is_mobile=True,has_touch=True,service_workers='block')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded');page.wait_for_function('ready',timeout=20000)
    assert page.text_content('#appVersion')=='3.0.10'
    page.locator('#displaySelect').select_option('instrument')
    page.locator('#answerLimitSelect').fill('5');page.locator('#answerLimitSelect').press('Tab')
    low,high=page.evaluate('[low,high]')
    page.evaluate("""() => {
        window.queued=[];window.freeVoices=[];
        const q=queueInstrumentNote,f=playFreeVoice;
        queueInstrumentNote=(instrument,midi,at,duration=PLAY_DURATION,volume=.75)=>{queued.push({midi,phase,ordinal:trial?.ordinal});return q(instrument,midi,at,duration,volume);};
        playFreeVoice=midi=>{freeVoices.push(midi);f(midi);};
        const choices=[67,65,67,65];UnifiedModel.drawAP=()=>choices.shift()??65;
    }""")
    assert page.locator('#otherHint').is_visible()
    assert page.locator('#keyboardCard').is_hidden()
    def start():
        page.locator('#playButton').tap();page.wait_for_function("phase==='countdown'")
        assert page.locator('#keyboard [data-midi]:not(:disabled)').count()==0
        page.wait_for_function("phase==='answer'",timeout=15000)
        assert page.locator('#otherButton').is_visible() and page.locator('#otherButton').is_enabled()
    def other():
        page.locator('#otherButton').tap();page.wait_for_function("phase==='done'")
    start();assert page.evaluate('trial.target===67');assert page.locator(f'#keyboard [data-midi="{low}"]').first.is_disabled()
    other();assert page.evaluate("trial.correct && trial.guess==='out' && trial.guessOctave===null && session.total===1")
    assert page.locator('#keyboard [data-midi]:disabled').count()==0
    assert page.locator('#keyboard .correct[data-midi="67"]').count()>0
    page.locator(f'#keyboard [data-midi="{low}"]').first.tap();page.wait_for_function(f'queued.at(-1).midi==={low}&&session.reviewPaused')
    page.locator(f'#keyboard [data-midi="{high}"]').first.tap();page.wait_for_function(f'queued.at(-1).midi==={high}')
    assert page.locator('#keyboard .correct[data-midi="67"]').count()>0
    page.wait_for_timeout(1400);assert page.evaluate("phase==='done'&&session.total===1&&session.correct===1&&trial.replayed===0")
    page.locator('#nextButton').tap();page.wait_for_function("phase==='answer'&&trial.ordinal===2",timeout=15000)
    assert page.locator(f'#keyboard [data-midi="{low}"]').first.is_disabled()
    other();assert page.evaluate("!trial.correct&&trial.target===65&&session.total===2")
    page.locator(f'#keyboard [data-midi="{low}"]').first.tap();page.wait_for_function(f'queued.at(-1).midi==={low}&&session.reviewPaused')
    page.wait_for_timeout(1400);assert page.evaluate("phase==='done'&&session.total===2&&session.correct===1")
    page.locator('#playButton').tap();assert page.locator('#answerArea').is_hidden() and page.locator('#sessionSummary').is_visible()
    page.locator('#modeSelect').select_option('free');assert page.locator('#keyboardCard').is_visible()
    assert page.locator('#keyboard [data-midi]:disabled').count()==0
    page.locator(f'#keyboard [data-midi="{low}"]').first.evaluate('(b)=>b.click()');page.wait_for_function(f'freeVoices.includes({low})')
    page.wait_for_function('activePointers.size===0 && activeVoices.size===0')
    page.locator('#modeSelect').select_option('single');page.locator('#displaySelect').select_option('buttons');start();other();assert page.evaluate('trial.correct&&session.total===1');page.locator('#playButton').tap()
    page.locator('#displaySelect').select_option('instrument');page.locator('#blindCheck').check()
    page.locator('#commonSettings details summary').tap();page.locator('#autoNextCheck').uncheck()
    start();other();assert page.locator('#keyboard [data-midi]:not(:disabled)').count()==0
    assert page.locator('#keyboard .correct').count()==0 and page.locator('#replayButton').is_hidden()
    page.locator('#playButton').tap();assert page.locator('#answerArea').is_hidden()
    assert not errors,errors
    print('PASS',entry,instrument,'Other in both displays, correct and incorrect AP review, all pitches, pause auto-next, no rescoring, Stop hides answer area; explicit Free Play, blind isolation',flush=True)
    browser.close()
