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
    assert page.text_content('#appVersion')=='3.0.3'
    page.locator('#modeSelect').select_option('interval')
    page.locator('#displaySelect').select_option('instrument')
    low,high=page.evaluate('[low,high]')
    page.locator('#rangeDetails summary').tap()
    page.locator('#startNote').select_option(str(low+2))
    page.locator('#answerLimitSelect').fill('5');page.locator('#answerLimitSelect').press('Tab')
    page.evaluate("""() => {
        window.queued=[];window.freeVoices=[];window.messages=[];
        const q=queueInstrumentNote,f=playFreeVoice,m=msg;
        queueInstrumentNote=(instrument,midi,at,duration=PLAY_DURATION,volume=.75)=>{
            queued.push({midi,phase,ordinal:trial?.ordinal,stamp:performance.now()});return q(instrument,midi,at,duration,volume);
        };
        playFreeVoice=midi=>{freeVoices.push(midi);f(midi);};
        msg=(text,cls)=>{messages.push({text,phase,stamp:performance.now()});m(text,cls);};
        document.getElementById('playButton').addEventListener('click',()=>{window.startAt=performance.now();},true);
    }""")
    page.locator('#playButton').tap();page.wait_for_function("phase==='answer'",timeout=5000)
    assert page.evaluate("queued[0].stamp-startAt<1000 && !messages.some(m=>m.phase==='countdown')")
    q=page.evaluate('trial')
    assert page.locator(f'#keyboard [data-midi="{low}"]').first.is_disabled()
    assert page.locator('#answerTimer').is_visible()
    page.locator(f'#keyboard [data-midi="{q["target"]}"]').first.tap()
    page.wait_for_function("phase==='done'&&trial.correct")
    assert page.locator('#keyboard [data-midi]:disabled').count()==0
    assert page.locator(f'#keyboard .reference[data-midi="{q["reference"]}"]').count()>0
    assert page.locator(f'#keyboard .correct[data-midi="{q["target"]}"]').count()>0
    page.locator(f'#keyboard [data-midi="{low}"]').first.tap()
    page.wait_for_function(f"queued.at(-1).midi==={low}&&session.reviewPaused")
    page.locator(f'#keyboard [data-midi="{q["reference"]}"]').first.tap()
    page.wait_for_function(f"queued.at(-1).midi==={q['reference']}")
    assert page.evaluate('session.total===1 && session.correct===1 && trial.replayed===0')
    assert page.locator(f'#keyboard .reference[data-midi="{q["reference"]}"]').count()>0
    assert page.locator(f'#keyboard .correct[data-midi="{q["target"]}"]').count()>0
    page.wait_for_timeout(2300);assert page.evaluate("phase==='done'&&trial.ordinal===1")
    before=page.evaluate('queued.length');page.locator('#replayButton').tap()
    page.wait_for_function(f'queued.length==={before+2}')
    assert page.evaluate(f'queued.slice({before}).map(n=>n.midi)')==[q['reference'],q['target']]
    page.wait_for_timeout(2000);assert page.evaluate("phase==='done'&&trial.ordinal===1")
    page.locator('#nextButton').tap();page.wait_for_function("phase==='answer'&&trial.ordinal===2")
    assert page.evaluate('!session.reviewPaused && session.total===1')
    assert page.locator(f'#keyboard [data-midi="{low}"]').first.is_disabled()
    q=page.evaluate('trial');wrong=next(x for x in range(low+2,high+1) if x not in (q['target'],q['reference']))
    page.locator(f'#keyboard [data-midi="{wrong}"]').first.tap();page.wait_for_function("phase==='done'&&!trial.correct")
    page.locator(f'#keyboard [data-midi="{low}"]').first.tap();page.wait_for_function(f'queued.at(-1).midi==={low}&&session.reviewPaused')
    assert page.evaluate('session.total===2 && session.correct===1 && trial.replayed===0')
    page.locator('#playButton').tap();assert page.locator('#keyboardCard').is_visible() and page.locator('#sessionSummary').is_visible()
    assert page.locator('#keyboard [data-midi]:disabled').count()==0
    page.locator(f'#keyboard [data-midi="{low}"]').first.evaluate('(b)=>b.click()')
    page.wait_for_function(f'freeVoices.includes({low})')
    page.wait_for_function('activePointers.size===0 && activeVoices.size===0')
    assert page.evaluate('!testActive && phase==="idle"')
    page.locator('#displaySelect').select_option('buttons')
    assert page.locator('#keyboardCard').is_hidden()
    page.locator('#playButton').tap();page.wait_for_function("phase==='answer'")
    assert not page.evaluate("messages.some(m=>m.phase==='countdown')")
    page.locator('#playButton').tap()
    page.locator('#modeSelect').select_option('single');page.locator('#playButton').tap()
    page.wait_for_function("phase==='countdown'");assert not page.locator('#answerTimer').is_visible()
    page.locator('#playButton').tap()
    assert not errors,errors
    print('PASS',entry,instrument,'immediate RP start, post-answer all-key audition, no rescoring, paused auto-next/replay, manual next, stopped free play, AP countdown retained',flush=True)
    browser.close()
