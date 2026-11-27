"""In-memory Chromium regression: no web server needed.
Run: python tests/browser_piano_layout.py (Python Playwright + Chromium).
Only the test fixture replaces URL options and storage. The real bundled code,
styles, sampled Web Audio player and pointer listeners are exercised.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'single-file/index.html').read_text(encoding='utf-8')
STORAGE = """<head><script>
{const entries=new Map(); Object.defineProperty(window,'localStorage',{value:{getItem:k=>entries.has(k)?entries.get(k):null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k),clear:()=>entries.clear()}});}
</script>"""


def fixture(page, instrument):
    html = HTML.replace('const pageOptions = new URLSearchParams(location.search);',
                        f'const pageOptions = new URLSearchParams("instrument={instrument}");', 1)
    page.set_content(html.replace('<head>', STORAGE, 1), wait_until='domcontentloaded')
    page.wait_for_function('ready', timeout=20000)
    page.select_option('#languageSelect', 'en')


def key(page, midi):
    return page.locator(f'#keyboard [data-midi="{midi}"]')


def check_layout(page):
    assert page.evaluate('''() => {
        const keys=[...document.querySelectorAll('#keyboard .piano-key')];
        return keys.length===88 && keys.every((k,i)=>Number(k.dataset.midi)===21+i)
            && document.querySelectorAll('.piano-row').length===7
            && document.querySelectorAll('.white-key').length===52
            && document.querySelectorAll('.black-key').length===36
            && !document.querySelector('#octaveNav')
            && keyboardScroller.scrollWidth===keyboardScroller.clientWidth
            && document.documentElement.scrollWidth===innerWidth;
    }''')


def visible_keys(page):
    assert page.evaluate('''() => {
        const keys=[...document.querySelectorAll('#keyboard .piano-key')];
        return keys.every(k=>{
            const r=k.getBoundingClientRect(), black=k.classList.contains('black-key');
            const x=(r.left+r.right)/2, y=black?(r.top+r.bottom)/2:r.bottom-6;
            return r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth
                && document.elementFromPoint(x,y)?.closest('button')===k;
        });
    }'''), 'every piano key has an unobstructed touch point on screen'


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('EAR_TRAINER_CHROMIUM','/usr/bin/chromium'),
                                args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'])
    context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True,
                                  device_scale_factor=1, service_workers='block')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    fixture(page,'piano')
    check_layout(page)
    assert page.locator('#startNote option').count()==88
    assert page.locator('#endNote option').count()==88
    assert page.evaluate('[minMidi,maxMidi]')==[60,71]
    assert page.locator('#modeSelect option').all_text_contents()==['One Note','Two Notes','Free Play']
    # Use an unlimited answer window for deterministic touch/geometry checks.
    page.evaluate('answerLimit=null')
    page.locator('#playButton').tap()
    page.wait_for_function('testActive && legacyAudioReady')
    visible_keys(page)
    key(page,21).tap()
    assert not page.evaluate('answered'), 'outside the selected question range is not an answer'
    midi=page.evaluate('currentMidi')
    key(page,midi).tap(position={'x':key(page,midi).bounding_box()['width']/2,'y':key(page,midi).bounding_box()['height']-5})
    assert page.evaluate('answered')
    assert 'correct' in key(page,midi).get_attribute('class').split()
    page.set_viewport_size({'width':375,'height':667})
    assert 'correct' in key(page,midi).get_attribute('class').split()
    page.locator('#playButton').tap()
    page.select_option('#modeSelect','interval')
    assert page.evaluate('[minMidi,maxMidi]')==[36,95]
    page.select_option('#startNote','21'); page.select_option('#endNote','108'); page.locator('#applyButton').tap()
    page.locator('#playButton').tap()
    page.wait_for_function('testActive && legacyAudioReady')
    assert page.evaluate('[minMidi,maxMidi]')==[21,108]
    assert page.locator('#keyboard .reference').count()==1
    ref=page.evaluate('currentReferenceMidi')
    assert 'reference' in key(page,ref).get_attribute('class').split()
    # Geometry for narrow portrait, standard portrait and a short landscape.
    for width,height in [(320,568),(360,640),(375,667),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        check_layout(page); visible_keys(page)
    page.set_viewport_size({'width':844,'height':390}); check_layout(page)
    page.set_viewport_size({'width':390,'height':844}); visible_keys(page)
    midi=page.evaluate('currentMidi'); rect=key(page,midi).bounding_box()
    page.touchscreen.tap(rect['x']+rect['width']/2,rect['y']+rect['height']-5)
    assert page.evaluate('answered') and 'correct' in key(page,midi).get_attribute('class').split()
    page.locator('#playButton').tap()
    page.select_option('#modeSelect','free')
    # Every key, including A0 and C8, can play even with a narrow saved range.
    assert page.evaluate('[minMidi,maxMidi]')==[60,71]
    for midi in (21,22,60,106,108):
        k=key(page,midi); k.scroll_into_view_if_needed(); rect=k.bounding_box()
        page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']-5)
        page.mouse.down()
        page.wait_for_function('(m)=>activeVoices.has(m)',arg=midi,timeout=3000)
        assert 'active' in k.get_attribute('class').split()
        page.mouse.up()
        page.wait_for_function('(m)=>!activeVoices.has(m)',arg=midi,timeout=3000)
    page.locator('#playButton').tap(); page.wait_for_function('testActive && legacyAudioReady')
    midi=page.evaluate('currentMidi'); rect=key(page,midi).bounding_box()
    page.touchscreen.tap(rect['x']+rect['width']/2,rect['y']+rect['height']-5)
    assert page.evaluate('answered && !testActive')
    assert not errors, errors
    print('PASS piano: 88 keys, exact touch targets, 4 portrait sizes, landscape, range, three modes, sample playback and resize feedback')
    context.close()
    context=browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, service_workers='block')
    page=context.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    fixture(page,'violin')
    assert page.locator('#keyboard .violin-note').count()==52
    assert page.locator('#keyboard .piano-key').count()==0
    assert page.locator('#modeSelect option').all_text_contents()==['One Note','Two Notes','Free Play']
    assert not errors, errors
    print('PASS violin: unchanged four-string 52-position board and three modes')
    browser.close()
