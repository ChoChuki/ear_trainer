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
    assert page.text_content('#appVersion')=='3.0.4'
    page.locator('#displaySelect').select_option('buttons')
    page.locator('#answerLimitSelect').fill('5');page.locator('#answerLimitSelect').press('Tab')
    page.locator('#commonSettings details summary').tap();page.locator('#maskCheck').uncheck()
    page.evaluate("""() => {
      window.queued=[];const q=queueInstrumentNote;
      queueInstrumentNote=(instrument,midi,at,duration=PLAY_DURATION,volume=.75)=>{queued.push({midi,at,phase});return q(instrument,midi,at,duration,volume);};
      const choices=[65,67,65,67,65,67];UnifiedModel.drawAP=()=>choices.shift()??65;
    }""")
    def tap(selector):page.locator(selector).tap()
    def answer():page.wait_for_function("phase==='answer'",timeout=15000)
    def done():page.wait_for_function("phase==='done'")
    def queued():return page.evaluate('queued.map(q=>q.midi)')
    def preview(selector,notes):
        page.evaluate('queued=[]');tap(selector)
        page.wait_for_function(f'queued.length==={len(notes)}');assert queued()==notes,(selector,queued(),notes)
        assert page.text_content('#previewLabel')
    tap('#playButton');answer()
    assert page.locator('#apOctaveKeys [data-octave="3"]').is_disabled()
    tap('#apNameKeys [data-pc="5"]');tap('#apOctaveKeys [data-octave="4"]');done()
    assert page.evaluate('trial.correct&&session.total===1')
    assert page.locator('#apNameKeys button:disabled').count()==0
    assert page.locator('#apOctaveKeys [data-octave="3"]').is_enabled()
    preview('#apNameKeys [data-pc="7"]',[67])
    preview('#apOctaveKeys [data-octave="3"]',[55])
    preview('#apNameKeys [data-pc="9"]',[57])
    assert page.locator('#apNameKeys [data-pc="5"].correct').count()==1
    page.wait_for_timeout(1000);assert page.evaluate("phase==='done'&&session.reviewPaused&&session.total===1&&session.correct===1&&trial.replayed===0")
    tap('#nextButton');answer();assert page.locator('#apOctaveKeys [data-octave="3"]').is_disabled()
    tap('#apNameKeys [data-pc="5"]');tap('#apOctaveKeys [data-octave="4"]');done();assert page.evaluate('!trial.correct&&session.total===2')
    preview('#apNameKeys [data-pc="0"]',[60]);assert page.locator('#apNameKeys [data-pc="5"].wrong').count()==1
    tap('#playButton');assert page.locator('#buttonBoard').is_visible();preview('#apNameKeys [data-pc="9"]',[69]);assert page.evaluate('summarySession.total===2')
    page.locator('#answerLimitSelect').fill('0.5');page.locator('#answerLimitSelect').press('Tab');tap('#playButton');answer();done();assert page.evaluate("trial.result==='timeout'")
    preview('#apNameKeys [data-pc="2"]',[62]);tap('#playButton')
    page.locator('#blindCheck').check();page.locator('#autoNextCheck').uncheck();page.locator('#answerLimitSelect').fill('5');page.locator('#answerLimitSelect').press('Tab');tap('#playButton');answer();tap('#otherButton');done()
    assert page.locator('#buttonBoard button:not(:disabled)').count()==0
    assert page.locator('#buttonBoard .correct').count()==0
    tap('#playButton');preview('#apNameKeys [data-pc="2"]',[62])
    page.locator('#modeSelect').select_option('interval');page.locator('#displaySelect').select_option('buttons');page.locator('#autoNextCheck').check()
    page.locator('#minIntervalSelect').select_option('5');page.locator('#maxIntervalSelect').select_option('7')
    page.locator('#answerLimitSelect').fill('5');page.locator('#answerLimitSelect').press('Tab')
    page.evaluate("""() => {UnifiedModel.drawRP=()=>({reference:high-5,target:high,size:5,direction:'higher'})}""")
    hi=page.evaluate('high');tap('#playButton');answer();tap('#intervalAnswers [data-interval="5"]');done();assert page.evaluate('trial.correct&&session.total===1')
    preview('#intervalAnswers [data-interval="7"]',[hi-7,hi]);preview('#intervalAnswers [data-interval="5"]',[hi-5,hi]);preview('#intervalAnswers [data-interval="6"]',[hi-6,hi]);
    assert page.locator('#intervalAnswers [data-interval="5"].correct').count()==1
    page.wait_for_timeout(2200);assert page.evaluate("phase==='done'&&session.reviewPaused&&session.total===1&&session.correct===1&&trial.replayed===0")
    tap('#nextButton');answer();tap('#intervalAnswers [data-interval="6"]');done();assert page.evaluate('!trial.correct&&session.total===2')
    preview('#intervalAnswers [data-interval="7"]',[hi-7,hi]);tap('#playButton');preview('#intervalAnswers [data-interval="5"]',[hi-5,hi])
    assert page.evaluate('summarySession.total===2&&summarySession.correct===1')
    assert not errors,errors
    print('PASS',entry,instrument,'AP name/octave, wrong/timeout, RP interval previews, boundary transposition, auto-next pause, no rescoring, stopped preview, blind isolation',flush=True)
    browser.close()
