"""Chromium regression: lower answer area, full-duration interference and mandatory review."""
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
    size,height=390,844
    page=browser.new_page(viewport={'width':size,'height':height},is_mobile=True,has_touch=True,service_workers='block')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded');page.wait_for_function('ready',timeout=20000)
    assert page.text_content('#appVersion')=='3.0.6'
    page.evaluate('''()=>{window.queued=[];const queue=queueInstrumentNote;queueInstrumentNote=(sound,midi,at,duration=PLAY_DURATION,volume=.75)=>{queued.push({ordinal:trial?.ordinal,phase,midi,at,duration,volume});return queue(sound,midi,at,duration,volume);};UnifiedModel.drawAP=()=>65;UnifiedModel.drawRP=()=>({reference:60,target:67,size:7,direction:'higher'});}''')
    def tap(s):page.locator(s).first.tap()
    def answer():page.wait_for_function("phase==='answer'",timeout=18000)
    def done():page.wait_for_function("phase==='done'")
    def start():tap('#playButton');answer()
    def stop():tap('#playButton');assert page.evaluate('!testActive')
    def next_question():tap('#nextButton');answer()
    def paused():
        done();assert page.evaluate('session.reviewPaused&&nextTimer===null')
        assert page.locator('#nextButton').is_visible()
    def still_paused(ms=2100):
        ordinal=page.evaluate('trial.ordinal');total=page.evaluate('session.total');page.wait_for_timeout(ms)
        assert page.evaluate(f"phase==='done'&&trial.ordinal==={ordinal}&&session.total==={total}&&nextTimer===null")
    def at_bottom(selector):
        r=page.locator(selector).bounding_box();assert r is not None
        assert height-22 <= r['y']+r['height'] <= height-3,(selector,r)
    def coord(selector):return page.locator(selector).first.bounding_box()['y']
    page.locator('#displaySelect').select_option('buttons')
    page.locator('#answerLimitSelect').fill('0');page.locator('#answerLimitSelect').press('Tab')
    page.evaluate('cfg.auto=true;cfg.mask=true')
    start();at_bottom('#buttonBoard')
    y=coord('#apNameKeys [data-pc="5"]');tap('#otherButton');paused();assert page.evaluate('!trial.correct');still_paused(1500)
    tap('#replayButton');still_paused(1300)
    tap('#apNameKeys [data-pc="4"]');page.wait_for_function("queued.at(-1).midi===64")
    assert abs(coord('#apNameKeys [data-pc="5"]')-y)<2
    page.evaluate('queued=[]');next_question()
    notes=page.evaluate("queued.filter(n=>n.phase==='loading')")
    assert 7<=len(notes)<=9,notes
    assert all(abs(n['duration']-.7)<1e-8 for n in notes),notes
    assert all(b['at']>=a['at']+a['duration']+.089 for a,b in zip(notes,notes[1:])),notes
    tap('#apNameKeys [data-pc="5"]');tap('#apOctaveKeys [data-octave="5"]');paused()
    assert page.evaluate('trial.correct&&trial.octaveCorrect===false');still_paused(1400)
    page.evaluate('session.mask=false');next_question();tap('#apNameKeys [data-pc="5"]');tap('#apOctaveKeys [data-octave="4"]');done()
    assert page.evaluate('!session.reviewPaused&&nextTimer!==null');page.wait_for_function("trial.ordinal===4&&phase==='answer'",timeout=5000);stop()
    page.locator('#displaySelect').select_option('instrument');page.evaluate('cfg.mask=false;cfg.apLimit=500')
    start();at_bottom('#keyboardCard');paused();assert page.evaluate("trial.result==='timeout'");still_paused(1400)
    tap('#keyboard [data-midi="64"]');page.wait_for_function("queued.at(-1).midi===64")
    assert page.evaluate('session.total===1');stop()
    page.locator('#modeSelect').select_option('interval');page.evaluate('cfg.rpLimit=null;cfg.auto=true')
    for display in ['buttons','instrument']:
        page.locator('#displaySelect').select_option(display);start()
        at_bottom('#buttonBoard' if display=='buttons' else '#keyboardCard')
        tap('#intervalAnswers [data-interval="6"]' if display=='buttons' else '#keyboard [data-midi="66"]')
        paused();assert page.evaluate('!trial.correct');still_paused()
        tap('#replayButton');still_paused()
        tap('#intervalAnswers [data-interval="5"]' if display=='buttons' else '#keyboard [data-midi="65"]')
        assert page.evaluate('session.total===1');next_question()
        tap('#intervalAnswers [data-interval="7"]' if display=='buttons' else '#keyboard [data-midi="67"]');done()
        assert page.evaluate('trial.correct&&!session.reviewPaused&&nextTimer!==null')
        page.wait_for_function("trial.ordinal===3&&phase==='answer'",timeout=6000);stop()
    page.locator('#modeSelect').select_option('single');page.locator('#displaySelect').select_option('buttons');page.evaluate('cfg.blind=true;cfg.apLimit=null;cfg.mask=false')
    start();tap('#otherButton');paused();assert page.text_content('#answerText')=='Answer recorded';assert page.locator('#buttonBoard button:not(:disabled)').count()==0
    next_question();tap('#apNameKeys [data-pc="5"]');tap('#apOctaveKeys [data-octave="4"]');paused();assert page.text_content('#answerText')=='Answer recorded';stop()
    assert not errors,errors
    print('PASS',entry,instrument,'bottom alignment; full-duration mask; wrong AP/RP, octave, timeout; manual blind Next; stable audition; correct auto-next',flush=True)
    browser.close()
