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
    assert page.text_content('#appVersion')=='3.0.9'
    page.locator('#modeSelect').select_option('interval')
    page.locator('#displaySelect').select_option('instrument')
    page.locator('#answerLimitSelect').fill('5');page.locator('#answerLimitSelect').press('Tab')
    page.evaluate("""() => {
      window.notesQueued=[];window.referenceMarks=[];
      const q=queueInstrumentNote,m=markPitch;
      queueInstrumentNote=(instrument,midi,at,duration=PLAY_DURATION,volume=.75)=>{
        const voice=q(instrument,midi,at,duration,volume);
        notesQueued.push({ordinal:trial?.ordinal,phase,midi,at:voice.when??at,duration,stamp:performance.now(), audible:APFocusModel.outputClock(audioContext,voice.when??at).when});
        return voice;
      };
      markPitch=(midi,cls)=>{if(cls==='reference')referenceMarks.push({ordinal:trial?.ordinal,phase,midi,stamp:performance.now()});m(midi,cls);};
    }""")
    page.locator('#playButton').tap()
    page.wait_for_function("phase==='loading' && !!document.querySelector('#keyboard .reference')",timeout=10000)
    q=page.evaluate('trial')
    assert page.locator(f'#keyboard .reference[data-midi="{q["reference"]}"]').count()>0
    assert page.locator('#keyboard .correct').count()==0 and not page.locator('#answerTimer').is_visible()
    assert page.locator(f'#keyboard [data-midi="{q["target"]}"]').first.is_disabled()
    queued=page.evaluate('notesQueued');marks=page.evaluate('referenceMarks')
    assert [n['midi'] for n in queued]==[q['reference'],q['target']],queued
    assert marks[0]['phase']=='loading' and abs(marks[0]['stamp']-queued[0]['audible'])<200 and marks[0]['stamp']<queued[1]['audible']-200,(marks,queued)
    page.wait_for_function("phase==='answer'",timeout=5000)
    assert page.locator('#answerTimer').is_visible()
    page.locator(f'#keyboard [data-midi="{q["target"]}"]').first.tap()
    page.wait_for_function("phase==='done' && trial.correct")
    feedback=page.evaluate("notesQueued.filter(n=>n.phase==='done'&&n.ordinal===1)")
    assert [n['midi'] for n in feedback]==[q['reference'],q['target']],feedback
    assert abs(feedback[1]['at']-feedback[0]['at']-.8)<.001 and feedback[0]['duration']==.6 and feedback[1]['duration']==.7
    assert page.evaluate('trial.replayed===0 && session.total===1 && session.correct===1')
    page.wait_for_function("notesQueued.some(n=>n.ordinal===2)",timeout=7000)
    nextq=page.evaluate('notesQueued.find(n=>n.ordinal===2)')
    assert nextq['stamp']>=feedback[1]['audible']+feedback[1]['duration']*1000-30,(nextq,feedback)
    page.locator('#playButton').tap()
    page.locator('#displaySelect').select_option('buttons')
    page.evaluate('cfg.auto=false')
    page.locator('#playButton').tap();page.wait_for_function("phase==='answer'",timeout=12000)
    q=page.evaluate('trial');before=page.evaluate('notesQueued.length')
    assert page.locator('#keyboardCard').is_hidden() and page.locator('#keyboard .reference').count()==0
    page.locator(f'#intervalAnswers [data-interval="{q["size"]}"]').tap()
    page.wait_for_function("phase==='done' && trial.correct")
    feedback=page.evaluate(f'notesQueued.slice({before})')
    assert [n['midi'] for n in feedback]==[q['reference'],q['target']],feedback
    page.wait_for_timeout(2200);assert page.evaluate("phase==='done'&&session.total===1&&trial.replayed===0")
    page.locator('#playButton').tap();assert not errors,errors
    print('PASS',entry,instrument,'reference at first audible note; answer clock at second; correct replay; complete before automatic next; numeric answer with manual next',flush=True)
    browser.close()
