"""Responsive grouped practice layout regression."""
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
    def verify_layout(width,height):
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(100)
        metrics=page.evaluate("""()=>{const r=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right};};return {viewport:innerHeight,controls:r('controls'),feedback:r('answerCard'),answers:r('answerArea'),board:r(session.display==='buttons'?'buttonBoard':'keyboardCard'),paddingTop:parseFloat(getComputedStyle(shell).paddingTop),paddingBottom:parseFloat(getComputedStyle(shell).paddingBottom),parent:document.getElementById('controls').parentElement.id,position:getComputedStyle(document.getElementById('controls')).position};}""")
        c,f,a,b=[metrics[k] for k in ['controls','feedback','answers','board']]
        assert metrics['parent']=='practicePanel' and metrics['position']=='static',metrics
        assert -1<=f['top']-c['bottom']<=12 and -1<=a['top']-f['bottom']<=12,metrics
        assert a['top']<=b['top']+1 and b['bottom']<=a['bottom']+1,metrics
        assert c['left']>=0 and c['right']<=width+1 and b['left']>=0 and b['right']<=width+1,metrics
        available=metrics['viewport']-metrics['paddingTop']-metrics['paddingBottom']
        free=available-(a['bottom']-c['top'])
        if free>10:
            assert abs((c['top']-metrics['paddingTop'])-.6*free)<3,metrics
            assert a['bottom']<=height+1,metrics
        else:assert abs(c['top']-metrics['paddingTop'])<12,metrics
        return c['top'],b['bottom']
    for mode in ['single','interval']:
        page.locator('#modeSelect').select_option(mode)
        for display in ['buttons','instrument']:
            page.set_viewport_size({'width':390,'height':844});page.locator('#displaySelect').select_option(display)
            tap('#playButton');page.wait_for_function("phase==='answer'",timeout=18000)
            for width,height in [(390,844),(360,640),(320,568),(1280,800)]:verify_layout(width,height)
            page.set_viewport_size({'width':390,'height':844})
            if mode=='single':tap('#otherButton')
            elif display=='buttons':tap('#intervalAnswers [data-interval="6"]')
            else:tap('#keyboard [data-midi="66"]')
            page.wait_for_function("phase==='done'");assert page.evaluate('session.reviewPaused&&nextTimer===null')
            for selector in ['#playButton','#nextButton','#replayButton']:assert page.locator(selector).is_visible()
            top,bottom=verify_layout(390,844)
            if mode=='single' and display=='buttons':
                tap('#apNameKeys [data-pc="4"]');page.wait_for_timeout(100)
                newtop,newbottom=verify_layout(390,844);assert abs(top-newtop)<2 and abs(bottom-newbottom)<2
            tap('#replayButton');assert page.evaluate('session.reviewPaused&&nextTimer===null')
            tap('#nextButton');page.wait_for_function("phase==='answer'",timeout=18000);verify_layout(390,844)
            tap('#playButton');assert page.evaluate('!testActive')
            print('PASS',entry,instrument,mode,display,'four viewport sizes; all controls grouped; review/replay/next',flush=True)
    assert not errors,errors
    browser.close()
