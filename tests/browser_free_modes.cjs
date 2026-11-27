'use strict';
// Serve this directory over HTTP; run with Playwright and Chromium.
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('/opt/npm-tools/node_modules/playwright'); }
const base = process.argv[2] || 'http://127.0.0.1:8765/';
const expected = ['single','interval','free'];
async function menu(page) {
    assert.deepEqual(await page.locator('#modeSelect option').evaluateAll(options => options.map(o=>o.value)), expected);
    assert.equal(await page.isVisible('#apPicker'), false);
    assert.equal(await page.isVisible('#rpPanel'), false);
}
(async () => {
    const browser = await playwright.chromium.launch({executablePath:process.env.EAR_TRAINER_CHROMIUM || undefined,args:['--autoplay-policy=no-user-gesture-required','--no-sandbox']});
    try {
        for (const entry of ['', 'single-file/index.html']) {
            const context = await browser.newContext({viewport:{width:390,height:844}});
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            for (const instrument of ['violin','piano']) {
                await page.goto(new URL(entry,base).href + '?instrument='+instrument+'&mode=rpCourse');
                await page.waitForFunction(()=>ready && !document.getElementById('playButton').disabled,null,{timeout:20000});
                await page.selectOption('#languageSelect','en');
                await menu(page);
                assert.equal(await page.inputValue('#modeSelect'),'single');
                assert.deepEqual(await page.locator('#modeSelect option').allTextContents(),['One Note','Two Notes','Free Play']);
                assert.equal(await page.textContent('#appVersion'),'2.8.11');
                for (const mode of expected) {
                    await page.selectOption('#modeSelect',mode);
                    await page.waitForFunction(mode=>testMode===mode,mode);
                    assert.equal(await page.isVisible('#intervalPicker'),mode==='interval');
                    await menu(page);
                    await page.click('#playButton');
                    await page.waitForFunction(()=>testActive && legacyAudioReady && !document.getElementById('answerTimer').hidden,null,{timeout:10000});
                    await page.evaluate(()=>pressKey(currentMidi,123));
                    await page.waitForFunction(()=>answered);
                    assert.match(await page.textContent('#status'),/Correct/);
                    if (mode!=='free') await page.click('#playButton');
                    else {
                        assert.equal(await page.evaluate(()=>testActive),false);
                        await page.evaluate(()=>pressKey(minMidi,124));
                        await page.waitForFunction(()=>activeVoices.size>0,null,{timeout:5000});
                        await page.evaluate(()=>releaseAllKeys());
                    }
                }
                for (const [entryId,panel,home] of [['focusEntry','focusPanel','focusHome'],['ivEntry','ivPanel','ivHome']]) {
                    await page.click('#'+entryId);
                    await page.waitForSelector('#'+home+':not([hidden])');
                    assert.equal(await page.isVisible('#modeSelect'),false);
                    await page.click('#'+panel+' .af-head a');
                    await page.waitForSelector('#modeSelect',{state:'visible'});
                    await menu(page);
                }
                for (const lang of ['de','ja','it','el','zh-TW','en']) {
                    await page.selectOption('#languageSelect',lang);
                    await menu(page);
                    assert((await page.locator('#modeSelect option').allTextContents()).every(Boolean));
                }
                console.log('PASS',entry||'modular',instrument, 'three modes, answer + free play, AP/IV navigation, six locales, old URL fallback');
            }
            await page.selectOption('#modeSelect','interval');
            await page.selectOption('#instrumentSelect','violin');
            await page.waitForFunction(()=>instrumentMode==='violin' && ready && testMode==='interval');
            await menu(page);
            assert.equal(await page.inputValue('#modeSelect'),'interval');
            assert.deepEqual(errors,[]);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
