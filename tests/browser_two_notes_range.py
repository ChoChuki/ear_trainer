"""Browser regression for the full-register Two Notes entry rule.
Run: python tests/browser_two_notes_range.py (Python Playwright + Chromium).
Both packaged entries run in memory: for the modular entry, inline its actual
JS/CSS/sample files. The fixture supplies URL options and localStorage only.
"""
from pathlib import Path
import json
import re
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
def load_html(entry):
    html = (ROOT / entry).read_text(encoding='utf-8')
    if entry == 'index.html':
        def script(match):
            filename = match[1]
            content = (ROOT / filename).read_text(encoding='utf-8')
            if filename == 'app.js':
                content = '\n'.join((ROOT / 'vendor' / name).read_text(encoding='utf-8') for name in
                    ['0000_JCLive_sf2_file.js', '0400_JCLive_sf2_file.js']) + '\n' + content
            return '<script>\n' + content + '\n</script>'
        html = re.sub(r'<script src="\./([^"]+)"></script>', script, html)
        html = re.sub(r'<link rel="stylesheet" href="\./([^"]+)">',
                      lambda m: '<style>\n' + (ROOT / m[1]).read_text(encoding='utf-8') + '\n</style>', html)
    return html


def fixture(context, entry, instrument, direct=False, saved=None):
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    options = 'instrument=' + instrument + ('&mode=interval' if direct else '')
    seed = json.dumps([] if saved is None else [['ear-relative-range-' + instrument, saved]])
    storage = """<head><script>
    {const entries = new Map(SEED); Object.defineProperty(window,'localStorage',{value:{
        getItem:k=>entries.has(k)?entries.get(k):null,setItem:(k,v)=>entries.set(k,String(v)),
        removeItem:k=>entries.delete(k),clear:()=>entries.clear()}});}
    </script>""".replace('SEED', seed)
    html = load_html(entry).replace('const pageOptions = new URLSearchParams(location.search);',
                'const pageOptions = new URLSearchParams(' + json.dumps(options) + ');',1)
    page.set_content(html.replace('<head>', storage, 1), wait_until='domcontentloaded')
    page.wait_for_function('ready', timeout=20000)
    return page, errors


def assert_range(page, low, high):
    assert page.evaluate('[minMidi,maxMidi]') == [low, high]
    assert page.input_value('#startNote') == str(low)
    assert page.input_value('#endNote') == str(high)


def set_range(page, low, high):
    page.select_option('#startNote', str(low))
    page.select_option('#endNote', str(high))
    page.locator('#applyButton').click()
    assert_range(page, low, high)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('EAR_TRAINER_CHROMIUM', '/usr/bin/chromium'),
        args=['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'])
    for entry in ('index.html', 'single-file/index.html'):
        for instrument, low, high in [('piano', 21, 108), ('violin', 55, 88)]:
            context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True,
                                          has_touch=True, service_workers='block')
            page, errors = fixture(context, entry, instrument, saved='[60,67]')
            assert page.text_content('#appVersion') == '2.8.10'
            assert_range(page, 60, 71)
            set_range(page, 62, 69)
            page.select_option('#modeSelect', 'interval')
            assert_range(page, low, high)
            assert page.locator('#keyboard .out-of-range').count() == 0
            # Verify actual draws use the entire register, including both ends,
            # with the original non-repetition constraint intact. Use an allowed
            # one-semitone interval so deterministic extreme random values reach
            # the endpoints without a statistical/flaky coverage assertion.
            result = page.evaluate('''() => {
                const old = Math.random;
                const distances = [minIntervalSemitones, maxIntervalSemitones];
                try {
                    minIntervalSemitones = maxIntervalSemitones = 1;
                    Math.random = () => 0;
                    const a = pickIntervalQuestion();
                    Math.random = () => 0.9999999999999999;
                    const b = pickIntervalQuestion();
                    return [a.reference, a.target, b.reference, b.target];
                } finally {
                    Math.random = old;
                    [minIntervalSemitones, maxIntervalSemitones] = distances;
                }
            }''')
            assert result == [low, low+1, high, high-1], result
            set_range(page, 60, 71)
            page.select_option('#modeSelect', 'single')
            assert_range(page, 62, 69)
            page.select_option('#modeSelect', 'interval')
            assert_range(page, low, high)
            page.select_option('#modeSelect', 'free')
            assert_range(page, 62, 69)
            # Editing without pressing Apply cannot narrow the entry default.
            page.select_option('#startNote', '63')
            page.select_option('#modeSelect', 'interval')
            assert_range(page, low, high)
            # A direct URL entry must not inherit a saved narrow range.
            set_range(page, 60, 71)
            saved = page.evaluate("localStorage.getItem('ear-relative-range-' + instrumentMode)")
            assert not errors, errors
            page.close()
            page, errors = fixture(context, entry, instrument, direct=True, saved=saved)
            assert page.evaluate('testMode') == 'interval'
            assert_range(page, low, high)
            assert not errors, errors
            print('PASS', entry, instrument, 'default, old settings, explicit range, return, direct entry, actual endpoint draws')
            context.close()
    browser.close()
