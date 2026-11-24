'use strict';
// Browser check of focused AP practice (needs Playwright with Chromium and a local server):
//   python3 -m http.server 8765 --bind 127.0.0.1   (in the app folder)
//   node tests/browser_ap_focus.cjs [http://127.0.0.1:8765/]
// It runs a learning block (silence until the window closes, then a fast answer), the
// consolidation that follows it (20 s glide first) and one classic AP question.
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('/opt/npm-tools/node_modules/playwright'); }
const base = process.argv[2] || 'http://127.0.0.1:8765/';

async function target(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('ear-trainer-last-question-v1')).target);
}
async function answerPhase(page, timeout = 30000) {
    await page.waitForFunction(() => {
        const b = document.querySelector('#focusAnswers button');
        return b && !b.disabled && !document.getElementById('focusAnswers').hidden;
    }, null, {timeout});
}
async function rows(page, site) {
    return page.evaluate(site => new Promise(resolve => {
        const request = indexedDB.open('ap-training-data-' + site, 1);
        request.onsuccess = () => {
            const tx = request.result.transaction(['trials','sessions'], 'readonly');
            const out = {};
            tx.objectStore('trials').getAll().onsuccess = e => {out.trials = e.target.result;};
            tx.objectStore('sessions').getAll().onsuccess = e => {out.sessions = e.target.result;};
            tx.oncomplete = () => resolve(out);
        };
    }), site);
}

(async () => {
    const browser = await playwright.chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
    const page = await browser.newPage({viewport:{width:390, height:844}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
    await page.goto(base + '#ap');
    await page.waitForSelector('#focusModes button[data-mode="learn"]');
    assert.match(await page.textContent('#focusRules'), /1\.3 s/);
    const options = await page.$$eval('#focusLimit option', o => o.map(x => x.textContent));
    assert.deepEqual(options.slice(0, 2), ['Strict · 1.3 s', 'Relaxed · 2.0 s']);
    console.log('home:', await page.textContent('#focusRules'), '|', options.join(' | '));

    // 1. Learning block, first question: no reset (first sound of the day); let the window pass.
    await page.click('#focusModes button[data-mode="learn"]');
    await answerPhase(page);
    assert.equal(await page.isVisible('#focusTimer'), true, 'countdown bar shown');
    assert.match(await page.$eval('#focusTimer span', s => s.style.transition), /transform \d+ms linear/);
    await page.waitForFunction(() => /Too slow/.test(document.getElementById('focusPrompt').textContent), null, {timeout:4000});
    console.log('timeout feedback:', await page.textContent('#focusPrompt'));
    assert.equal(await page.isVisible('#focusNext'), true, 'a late answer waits for Next');
    assert.equal(await page.isVisible('#focusAnswerSound'), true);

    // 2. Second question: the short reset plays first, then answer at once.
    await page.click('#focusNext');
    await page.waitForFunction(() => /Reset tones/.test(document.getElementById('focusPrompt').textContent), null, {timeout:3000});
    const resetStart = Date.now();
    await answerPhase(page);
    const resetMs = Date.now() - resetStart;
    const pitch = await target(page);
    await page.click(`#focusAnswers button[data-answer="${pitch % 12 === 5 ? 5 : 'out'}"]`);
    const prompt = await page.textContent('#focusPrompt');
    console.log('reset + gap ≈', resetMs, 'ms; fast answer:', prompt);
    assert(resetMs > 2900 && resetMs < 5000, 'reset 2.4 s + 0.7–1.2 s gap');
    assert.match(prompt, /^Correct · .* · \d\.\d s$/);

    // 3. End the block: the summary counts the late answer.
    await page.click('#focusEnd');
    await page.waitForSelector('#focusSummary:not([hidden])');
    const score = await page.textContent('#focusScore');
    console.log('summary:', score);
    assert.match(score, /too slow 1/);
    assert.match(score, /median time \d\.\d s/);

    // 4. Consolidation right after labelled feedback starts with the 20 s glide.
    const consolidate = page.locator('#focusContinue button', {hasText:'Consolidate'});
    await consolidate.click();
    await page.waitForFunction(() => /Clearing labelled notes/.test(document.getElementById('focusPrompt').textContent), null, {timeout:3000});
    const glideStart = Date.now();
    await answerPhase(page, 40000);
    const glideMs = Date.now() - glideStart;
    console.log('long reset ≈', glideMs, 'ms');
    assert(glideMs > 20500 && glideMs < 23500);
    await page.click('#focusAnswers button[data-answer="unsure"]');
    assert.equal(await page.textContent('#focusPrompt'), 'Answer saved');
    await page.click('#focusEnd');
    await page.waitForSelector('#focusSummary:not([hidden])');

    const data = await rows(page, 'violin');
    const trials = data.trials.filter(r => r.protocol === 8).sort((a, b) => a.playedAt - b.playedAt);
    assert.equal(trials.length, 3);
    assert.equal(trials[0].result, 'timeout'); assert.equal(trials[0].limitMs, 1333); assert.equal(trials[0].reset, null);
    assert.equal(trials[0].rtMs, null);
    assert.equal(trials[1].result, 'answered'); assert.equal(trials[1].correct, true); assert.equal(trials[1].reset, 'short');
    assert(trials[1].rtMs < 1333);
    assert(trials[1].jump >= 12, 'register jump ' + trials[1].jump);
    assert.equal(trials[2].reset, 'long'); assert.equal(trials[2].kind, 'consolidate');
    const blocks = data.sessions.filter(s => s.protocol === 8);
    assert(blocks.some(s => s.kind === 'learn' && s.late === 1 && s.limit === 'strict' && s.limitMs === 1333 && s.resetOn === true));
    console.log('records:', trials.map(t => `${t.kind}:${t.result}:${t.reset}:jump=${t.jump}:rt=${t.rtMs}`).join(' | '));

    // 5. Classic AP learning: one question with the shared reset.
    await page.goto(base + '#tools');
    await page.selectOption('#modeSelect', 'apLearn');
    await page.click('#playButton');
    await page.waitForFunction(() => [...document.querySelectorAll('#apAnswers button')].some(b => !b.hidden && !b.disabled), null, {timeout:20000});
    const classic = await target(page);
    await page.click(`#apAnswers button[data-pitch-class="${classic % 12}"]:not([hidden])`).catch(() =>
        page.click('#apAnswers button[data-pitch-class="out"]'));
    await page.waitForTimeout(300);
    console.log('classic:', await page.textContent('#apMessage'));

    // 6. Piano site and other languages render the focused home without errors.
    await page.goto(base + '?instrument=piano#ap');
    await page.waitForSelector('#focusModes button[data-mode="learn"]');
    const seen = new Set();
    for (const lang of ['zh-TW','ja','de','it','el']) {
        await page.selectOption('#languageSelect', lang);
        await page.waitForFunction(lang => document.documentElement.lang === lang ||
            document.getElementById('languageSelect').value === lang, lang);
        const rules = await page.textContent('#focusRules');
        seen.add(rules);
        console.log(lang + ':', rules, '|', await page.$eval('#focusLimit option', o => o.textContent),
            '|', await page.textContent('#focusInstrument'));
    }
    assert.equal(seen.size, 5, 'each language has its own text');
    assert.deepEqual(errors, [], errors.join('\n'));
    console.log('PASS browser: focused learning, timeout, reset, fast answer, summary, 20 s glide, records, classic mode, six languages');
    await browser.close();
})().catch(err => {console.error(err); process.exit(1);});
