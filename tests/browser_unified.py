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
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    context=b.new_context(viewport={'width':size,'height':height},is_mobile=True,has_touch=True,service_workers='block')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded');page.wait_for_function('ready',timeout=20000)
    assert page.text_content('#appVersion')=='3.0.2'
    assert page.locator('#focusEntry,#ivEntry,#focusPanel,#ivPanel').count()==0
    assert page.locator('#modeSelect option').count()==3
    assert page.locator('#displaySelect option').count()==2
    page.locator('#learningNotes [data-pc="4"]').tap();assert page.evaluate('cfg.known.includes(4)&&cfg.known.includes(5)')
    # response timing, audio mask and feedback; choose real answer using saved target.
    page.locator('#answerLimitSelect').fill('3');page.locator('#answerLimitSelect').press('Tab')
    page.locator('#commonSettings details summary').tap();page.locator('#autoNextCheck').uncheck()
    page.evaluate('''() => {window.maskCounts=[];const orig=TrainingCore.resetTones;TrainingCore.resetTones=(queue,at,opts)=>{const mask=[];const end=orig((...args)=>{mask.push(args[0]);return queue(...args);},at,opts);maskCounts.push(mask);return end;};}''')
    def start():
        is_ap=page.evaluate("mode==='single'")
        page.locator('#playButton').tap()
        if is_ap:page.wait_for_function("phase==='countdown'",timeout=3000);assert not page.locator('#answerTimer').is_visible()
        wait_answer()
    def wait_answer():
        page.wait_for_function("phase==='answer'",timeout=15000)
        assert page.locator('#answerTimer').is_visible(),page.evaluate('({phase,hidden:document.getElementById("answerTimer").hidden,limit:session.limit})')
    def answer_ap():
        m=page.evaluate('trial.target');known=page.evaluate('session.known');
        if m%12 in known:
            page.locator(f'#apNameKeys [data-pc="{m%12}"]').tap();page.locator(f'#apOctaveKeys [data-octave="{m//12-1}"]').tap()
        else:
            # A different outside-set name counts just like Other.
            guess=next(pc for pc in range(12) if pc not in known and pc!=m%12)
            page.locator(f'#apNameKeys [data-pc="{guess}"]').tap()
        page.wait_for_function("phase==='done'");assert page.evaluate('trial.correct');return m
    start();m=answer_ap();page.locator('#nextButton').tap();page.wait_for_function("phase==='loading'",timeout=3000);assert not page.locator('#answerTimer').is_visible();wait_answer();n=answer_ap();assert m%12!=n%12
    counts=page.evaluate('maskCounts');assert len(counts)==1 and 6<=len(counts[0])<=8 and len({m%12 for m in counts[0]})==len(counts[0])
    page.locator('#playButton').tap();assert page.locator('#sessionSummary').is_visible()
    # AP board; blind mode does not show feedback, score or allow replay.
    page.locator('#displaySelect').select_option('instrument');page.locator('#blindCheck').check();start()
    assert not page.locator('#replayButton').is_visible();m=page.evaluate('trial.target');key=page.locator(f'#keyboard [data-midi="{m}"]').first;key.tap();page.wait_for_function("phase==='done'");assert page.evaluate('trial.correct');assert page.text_content('#answerText')=='Answer recorded';assert page.locator('#keyboard .correct').count()==0
    page.locator('#playButton').tap();assert page.locator('#sessionSummary').is_visible()
    # RP full range on entry and numeric answers, with a known direction.
    page.locator('#modeSelect').select_option('interval');expected=[21,108] if instrument=='piano' else [55,88];assert page.evaluate('[rpLo,rpHi]')==expected
    page.locator('#displaySelect').select_option('buttons');page.locator('#directionSelect').select_option('lower');page.locator('#minIntervalSelect').select_option('5');page.locator('#maxIntervalSelect').select_option('7');page.locator('#answerLimitSelect').fill('3');page.locator('#answerLimitSelect').press('Tab');start()
    q=page.evaluate('trial');assert q['target']<q['reference'];assert 5<=q['size']<=7;assert page.locator('#intervalAnswers button').count()==3
    page.locator(f'#intervalAnswers [data-interval="{q["size"]}"]').tap();page.wait_for_function("phase==='done'");assert page.evaluate('trial.correct');page.locator('#playButton').tap()
    # RP instrument answer, compare physical board size and exact position.
    page.locator('#displaySelect').select_option('instrument');start();q=page.evaluate('trial');assert page.locator(f'#keyboard .reference[data-midi="{q["reference"]}"]').count()>0
    bb=page.locator('#keyboardCard').bounding_box();assert bb['x']>=0 and bb['x']+bb['width']<=size+1,bb
    assert bb['y']+bb['height']<=height+1,(bb,height)
    page.locator(f'#keyboard [data-midi="{q["target"]}"]').first.tap();page.wait_for_function("phase==='done'");assert page.evaluate('trial.correct');page.locator('#playButton').tap()
    # Range reset even after a manual narrowing and leaving RP.
    page.locator('#rangeDetails summary').tap();page.locator('#startNote').select_option(str(expected[0]+1));page.locator('#modeSelect').select_option('single');assert page.evaluate('cfg.known.includes(4)&&cfg.known.includes(5)');page.locator('#modeSelect').select_option('interval');assert page.evaluate('[rpLo,rpHi]')==expected
    # Free play: every key remains available and actual pointer interaction queues sound.
    page.locator('#modeSelect').select_option('free');assert page.locator('#keyboardCard').is_visible();assert page.locator('#keyboard [data-midi]').count()==(88 if instrument=='piano' else 52)
    page.locator(f'#keyboard [data-midi="{expected[0]}"]').first.tap();assert not page.locator('#playButton').is_visible()
    data=page.evaluate('''async()=>{await writeQueue;return {ap:await APPitchScience.allRows(instrumentMode,'trials'),iv:await APPitchScience.allRows(instrumentMode,'trials','iv')};}''')
    assert len(data['ap'])==3 and all(r['correct'] for r in data['ap']),data['ap']
    assert len(data['iv'])==2 and all(r['correct'] for r in data['iv']),data['iv']
    page.locator('#statistics summary').first.tap();page.wait_for_function("document.getElementById('historyBody').textContent.includes('First-listen accuracy')")
    assert not errors,errors
    print('PASS',entry,instrument,f'{size}x{height}','AP buttons/board, mask + clock, blind, RP buttons/board, full range, free play, history',flush=True)
    b.close()
