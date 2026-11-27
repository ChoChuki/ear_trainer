'use strict';
// Browser checks for 2.8.2 (Playwright with Chromium and a local server, as browser_ap_focus.cjs):
//   python3 -m http.server 8765 --bind 127.0.0.1   (in the app folder)
//   node tests/browser_v282.cjs [http://127.0.0.1:8765/]
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('/opt/npm-tools/node_modules/playwright'); }
const base = process.argv[2] || 'http://127.0.0.1:8765/';
const store = (page, name) => page.evaluate(name => new Promise(resolve => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => ['trials', 'sessions'].forEach(s => request.result.createObjectStore(s, {keyPath: 'id'}));
    request.onsuccess = () => {
        const tx = request.result.transaction(['trials', 'sessions'], 'readonly'), out = {};
        tx.objectStore('trials').getAll().onsuccess = e => { out.trials = e.target.result; };
        tx.objectStore('sessions').getAll().onsuccess = e => { out.sessions = e.target.result; };
        tx.oncomplete = () => resolve(out);
    };
}), name);
const ready = (page, selector) => page.waitForFunction(s => {
    const b = document.querySelector(s); return b && !b.disabled && b.offsetParent !== null;
}, selector, {timeout: 20000});

(async () => {
    const browser = await playwright.chromium.launch({executablePath: process.env.EAR_TRAINER_CHROMIUM || undefined, args: ['--autoplay-policy=no-user-gesture-required']});
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // 1. Focused interval practice: a blind check answered at once, then a timeout in learning.
    await page.goto(base + '#iv');
    await page.waitForSelector('#ivModes button[data-mode="cold"]');
    assert.match(await page.textContent('#ivRules'), /1\.3 s/);
    assert.equal(await page.inputValue('#ivLimit'), '1.3');
    assert.equal(await page.isVisible('#focusPanel'), false);
    console.log('iv home:', await page.textContent('#ivRules'), '|', await page.textContent('#ivDaily'));
    await page.click('#ivModes button[data-mode="cold"]');
    for (let i = 0; i < 12; i++) {
        await ready(page, '#ivAnswers button');
        if (i === 0) {
            assert.equal(await page.locator('#ivAnswers button').count(), 14, '12 intervals, Other and Not sure');
            assert.equal(await page.isVisible('#ivTimer'), true);
            assert.equal(await page.isVisible('#ivReplay'), false, 'one listen in the blind check');
        }
        await page.locator('#ivAnswers button').nth((i * 5) % 12).click();
        await page.waitForFunction(() => !document.getElementById('ivNext').hidden);
        await page.click('#ivNext');
    }
    await page.waitForSelector('#ivSummary:not([hidden])');
    console.log('iv blind check:', await page.textContent('#ivScore'));
    let data = await store(page, 'iv-training-data-violin');
    const check = data.trials.filter(r => r.kind === 'cold').sort((a, b) => a.ordinal - b.ordinal);
    assert.equal(check.length, 12);
    for (let i = 1; i < 12; i++) {
        assert.notEqual(check[i].size, check[i - 1].size, 'adjacent intervals differ');
        assert.notEqual(check[i].target % 12, check[i - 1].target % 12, 'adjacent second notes differ in name');
    }
    assert(check.every(r => r.result === 'answered' && Number.isFinite(r.rtMs) && r.limitMs === 1300 && r.direction === 'up' && r.target > r.reference));
    console.log('iv sizes:', check.map(r => r.size).join(' '), '| rt', check.map(r => r.rtMs).join(' '));
    await page.click('#ivContinue button.primary');
    await ready(page, '#ivAnswers button');
    await page.waitForFunction(() => /Too slow/.test(document.getElementById('ivPrompt').textContent), null, {timeout: 6000});
    console.log('iv timeout:', await page.textContent('#ivPrompt'));
    assert.equal(await page.isVisible('#ivAnswerSound'), true);
    assert.equal(await page.isVisible('#ivNext'), true, 'a miss in learning waits for Next');
    await page.click('#ivEnd');
    await page.waitForSelector('#ivSummary:not([hidden])');
    data = await store(page, 'iv-training-data-violin');
    assert(data.trials.some(r => r.kind === 'learn' && r.result === 'timeout' && r.lateGuess === null));
    await page.click('#ivContinue button.primary');  // Finish
    await page.click('#ivSettings summary');
    await page.selectOption('#ivDirection', 'down');
    await page.click('#ivModes button[data-mode="learn"]');
    await ready(page, '#ivAnswers button');
    await page.locator('#ivAnswers button').first().click();
    await page.waitForFunction(() => !document.getElementById('ivNext').hidden);
    data = await store(page, 'iv-training-data-violin');
    const down = data.trials.filter(r => r.direction === 'down');
    assert(down.length >= 1 && down.every(r => r.target < r.reference));
    await page.click('#ivEnd');
    await page.click('#ivContinue button.primary');
    await page.click('#ivPanel .af-head a');
    await page.waitForFunction(() => document.getElementById('ivPanel').hidden && !document.querySelector('.app-shell').classList.contains('focus-open'));

    // 2. Single notes (piano): a timeout, then an answer inside the window.
    await page.goto(base + '?instrument=piano');
    await ready(page, '#playButton');
    console.log('single limits:', await page.inputValue('#answerLimitSelect'));
    assert.equal(await page.inputValue('#answerLimitSelect'), '1.3');
    assert.equal(await page.getAttribute('#answerLimitSelect', 'placeholder'), 'No limit');
    await page.click('#playButton');
    await page.waitForFunction(() => !document.getElementById('answerTimer').hidden && document.getElementById('answerTimer').parentElement.classList.contains('answer-card'), null, {timeout: 8000});
    await page.waitForFunction(() => /Time’s up/.test(document.getElementById('status').textContent), null, {timeout: 6000});
    assert.equal(await page.evaluate(() => answered), true);
    console.log('single timeout:', await page.textContent('#status'), '|', await page.textContent('#answerText'));
    await page.click('#nextButton');
    await page.waitForFunction(() => !document.getElementById('answerTimer').hidden, null, {timeout: 8000});
    const midi = await page.evaluate(() => currentMidi);
    await page.locator(`[data-midi="${midi}"]`).first().dispatchEvent('pointerdown', {pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0});
    await page.waitForFunction(() => answered === true);
    console.log('single answer:', await page.textContent('#status'));
    assert.match(await page.textContent('#status'), /Correct/);
    await page.evaluate(() => stopTest());

    // 3. Relative pitch course: the window starts at the second note; a timeout is recorded.
    await page.selectOption('#modeSelect', 'rpCourse');
    await page.waitForTimeout(300);
    const rpLimit = await page.inputValue('#answerLimitSelect');
    console.log('rp limit:', rpLimit, '| answers', await page.evaluate(() => document.querySelectorAll('#rpAnswers button').length));
    await page.click('#playButton');
    await page.waitForFunction(() => { const b = document.querySelector('#rpAnswers button'); return b && !b.disabled; }, null, {timeout: 10000});
    assert.equal(await page.evaluate(() => document.getElementById('answerTimer').parentElement.id), 'rpPanel');
    await page.waitForFunction(() => /Too slow/.test(document.getElementById('rpMessage').textContent), null, {timeout: 8000});
    console.log('rp timeout:', await page.textContent('#rpMessage'));
    await page.waitForTimeout(400);
    data = await store(page, 'rp-training-data-piano');
    assert(data.trials.some(r => r.result === 'timeout' && r.correct === false && Number.isFinite(r.limitMs)));
    await page.evaluate(() => stopTest());

    // 4. Classic AP check: answers open at the onset, the window is shared, a timeout is recorded.
    await page.selectOption('#modeSelect', 'ap');
    await page.waitForTimeout(300);
    assert.equal(await page.isVisible('#apTimePicker'), false);
    await page.click('#playButton');
    await page.waitForFunction(() => { const b = document.querySelector('#apAnswers button:not([hidden])'); return b && !b.disabled; }, null, {timeout: 10000});
    const openedEarly = await page.evaluate(() => performance.now() - apSoundStart < 700);
    assert(openedEarly, 'answers open before the 0.7 s note has finished');
    assert.equal(await page.evaluate(() => document.getElementById('answerTimer').parentElement.id), 'apAnswerPanel');
    await page.waitForFunction(() => answered === true, null, {timeout: 6000});
    console.log('ap timeout:', await page.textContent('#apMessage'));
    await page.waitForTimeout(300);
    data = await store(page, 'ap-training-data-piano');
    const assessment = data.trials.find(r => r.result === 'timeout' && r.limitMs === 1300);
    assert(assessment);
    assert.deepEqual(assessment.learned, [5], 'a fresh AP assessment uses the same F-only starting set as focused AP');
    await page.evaluate(() => stopTest());

    // 5. Focused AP: a labelled example never shares its name with the next question.
    await page.goto(base + '?instrument=piano#ap');
    await page.waitForSelector('#focusModes button[data-mode="learn"]');
    const firsts = [];
    for (let round = 0; round < 6; round++) {
        await page.evaluate(() => { document.getElementById('focusGuide').open = true; });
        await page.locator('#focusExamples .af-example button').first().click();
        await page.waitForFunction(() => /F\d/.test(document.getElementById('focusNotice').textContent), null, {timeout: 8000});
        await page.click('#focusModes button[data-mode="learn"]');
        await ready(page, '#focusAnswers button');
        firsts.push(await page.evaluate(() => JSON.parse(localStorage.getItem('ear-trainer-last-question-v1')).target));
        await page.click('#focusEnd');
        await page.waitForSelector('#focusSummary:not([hidden])');
        await page.locator('#focusContinue button', {hasText: 'Finish'}).click();
        await page.waitForSelector('#focusHome:not([hidden])');
    }
    console.log('first questions after an F example:', firsts.join(' '));
    assert(firsts.every(m => m % 12 !== 5), 'never F right after the F example');

    assert.deepEqual(errors, []);
    console.log('PASS browser 2.8.2: interval focus, single-note timeout, RP timeout, classic AP window, example spacing');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
