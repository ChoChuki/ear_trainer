"""Real Chromium regression for Active Learning, with package resources loaded in memory.
Run: python tests/browser_ap_active.py (Python Playwright and Chromium).
"""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('EAR_TRAINER_CHROMIUM','/usr/bin/chromium'),
        args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    for entry in ('index.html','single-file/index.html'):
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
        page=context.new_page(); errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        html=(ROOT/entry).read_text(encoding='utf-8')
        if entry=='index.html':
            def inline(match):
                filename=match[1]; content=(ROOT/filename).read_text(encoding='utf-8')
                if filename=='app.js':
                    content='\n'.join((ROOT/'vendor'/name).read_text(encoding='utf-8') for name in ['0000_JCLive_sf2_file.js','0400_JCLive_sf2_file.js'])+'\n'+content
                return '<script>\n'+content+'\n</script>'
            html=re.sub(r'<script src="\./([^"]+)"></script>',inline,html)
            html=re.sub(r'<link rel="stylesheet" href="\./([^"]+)">',lambda m:'<style>\n'+(ROOT/m[1]).read_text(encoding='utf-8')+'\n</style>',html)
        storage="""<head><script>{const entries=new Map(); Object.defineProperty(window,'localStorage',{value:{getItem:k=>entries.has(k)?entries.get(k):null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k),clear:()=>entries.clear()}});}</script>"""
        html=html.replace('<head>',storage,1).replace('const pageOptions = new URLSearchParams(location.search);','const pageOptions = new URLSearchParams("instrument=piano");',1)
        page.set_content(html,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_function('ready',timeout=20000)
        page.evaluate("location.hash='ap'")
        page.wait_for_selector('#focusModes button[data-mode="learn"]',timeout=20000)
        assert page.text_content('#appVersion')=='2.8.11'
        # E and F, precisely octaves 4/5; configure using the actual UI.
        page.locator('#focusSettings summary').first.click()
        if page.locator('#focusPicker button').nth(4).get_attribute('aria-pressed')=='false':
            page.locator('#focusPicker button').nth(4).click()
        if page.locator('#focusOctaves button[data-octave="6"]').get_attribute('aria-pressed')=='true':
            page.locator('#focusOctaves button[data-octave="6"]').click()
        assert page.text_content('#focusCurrent') in ('E · F','F · E')
        assert page.locator('#focusOctaves [aria-pressed="true"]').count()==2
        page.locator('#focusAuto').uncheck()
        page.locator('#focusMask').check()
        # Observe the real calls into the shared audio engine, leaving WebAudio intact.
        page.evaluate('''() => { const original=TrainingCore.resetTones;window.maskCounts=[];
            TrainingCore.resetTones=(queue,at,opts)=>{const mask=[];const end=original((...args)=>{mask.push(args[0]);return queue(...args);},at,opts);maskCounts.push(mask);return end;}; }''')
        page.locator('#focusModes button[data-mode="learn"]').tap()
        def answer_phase():
            page.wait_for_function('''() => { const b=document.querySelector('#focusAnswers button');return b&&!b.disabled&&!document.getElementById('focusAnswers').hidden; }''',timeout=20000)
        def answer():
            midi=page.evaluate("JSON.parse(localStorage.getItem('ear-trainer-last-question-v1')).target")
            assert 60<=midi<=83
            if midi%12 in [4,5]:
                page.locator(f'#focusAnswers button[data-octave="{midi//12-1}"]').tap()
                page.locator(f'#focusAnswers .af-keys button[data-answer="{midi%12}"]').tap()
            else: page.locator('#focusAnswers button[data-answer="out"]').tap()
            assert page.locator('#focusNext').is_visible()
            assert page.text_content('#focusPrompt').startswith('Correct'),page.text_content('#focusPrompt')
            return midi
        answer_phase(); prev=answer()
        for _ in range(2):
            page.locator('#focusNext').tap()
            page.wait_for_function("document.getElementById('focusPrompt').textContent.includes('6–8 intervening notes')",timeout=3000)
            assert not page.locator('#focusTimer').is_visible(),'timer must not run during interference'
            answer_phase(); assert page.locator('#focusTimer').is_visible()
            midi=answer(); assert midi%12!=prev%12;prev=midi
        masks=page.evaluate('maskCounts')
        assert len(masks)==2 and all(6<=len(m)<=8 and len({n%12 for n in m})==len(m) for m in masks),masks
        page.locator('#focusEnd').tap()
        page.wait_for_selector('#focusSummary:not([hidden])')
        rows=page.evaluate("async () => {await APPitchScience.flushWrites();return APPitchScience.allRows('piano','trials');}")
        rows=sorted([r for r in rows if r.get('kind')=='learn'],key=lambda r:r['ordinal'])
        assert len(rows)==3 and all(r['correct'] and r['limitMs']==1300 for r in rows),rows
        assert [r['resetNoteCount'] for r in rows]==[0,*map(len,masks)]
        assert not errors,errors
        print('PASS',entry,'real focused UI, E/F 4–5, mask counts',list(map(len,masks)),'answer timers, grading and in-memory history',flush=True)
        context.close()
    browser.close()
