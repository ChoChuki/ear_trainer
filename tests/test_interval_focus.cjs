'use strict';
// Focused interval practice (2.8.2): windows, plans, pairs, scoring and the shared answer clock.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const repo = process.argv[2] || path.join(__dirname, '..');
const context = {console, Intl, Date, Math, Float32Array, setTimeout, clearTimeout, performance,
    localStorage: {getItem: () => null, setItem() {}}, window: null};
context.window = context;
vm.createContext(context);
for (const file of ['training-core.js', 'answer-timer.js', 'interval-focus-model.js'])
    vm.runInContext(fs.readFileSync(path.join(repo, file), 'utf8'), context, {filename: file});
const M = context.IntervalFocusModel, T = context.AnswerTimer;

const scale = k => Math.round(1183 + 845 * (k - 1) / 11 + 150);
for (const k of [1, 2, 4, 12, 25]) { assert.equal(M.answerWindow('fast', k), 1333); assert.equal(T.windowMs('fast', k), 1333); }
assert.equal(M.answerWindow('off', 3), null); assert.equal(T.windowMs('off', 25), null);
assert.equal(T.windowMs('strict', 12), 1333, 'older choices fall back to the fixed window');
console.log('PASS answer windows: fixed', T.windowMs('fast', 12), 'ms for any number of buttons');

assert(M.validSettings(M.defaults(), 'violin') && M.validSettings(M.defaults(), 'piano'));
assert(!M.validSettings({...M.defaults(), known: [0]}, 'violin'));
assert(!M.validSettings({...M.defaults(), octaves: [1]}, 'violin'));
assert(!M.validSettings({...M.defaults(), direction: 'sideways'}, 'violin'));
assert(M.validSettings({...M.defaults(), limit: 'fast'}, 'violin'));

const cases = [
    {known: [7], octaves: [4, 5], direction: 'up'}, {known: [7, 12], octaves: [4, 5], direction: 'down'},
    {known: [7, 12, 4, 3], octaves: [3, 4, 5], direction: 'both'}, {known: M.SIZES, octaves: [5, 6], direction: 'harmonic'},
    {known: [5], octaves: [4], direction: 'up', responseMode: 'set'}, {known: [11], octaves: [4], direction: 'both'}];
let checked = 0;
for (const c of cases) for (const instrument of ['violin', 'piano']) for (const mode of ['learn', 'consolidate', 'cold']) for (const size of [12, 24, 60]) {
    const settings = {...M.defaults(), ...c, size};
    assert(M.validSettings(settings, instrument));
    const pool = M.pitchPool(settings.octaves, instrument);
    let previous = {reference: 60, target: 67};
    for (let block = 0; block < 20; block++) {
        const plan = M.plan(settings, mode, instrument, {}, M.intervalOf(previous));
        assert.equal(plan.length, mode === 'cold' ? 12 : size);
        const known = mode === 'cold' ? M.available(pool) : settings.known;
        for (const d of plan) {
            const q = M.pickQuestion(d, pool, settings.direction, previous, known, false);
            assert(q && pool.includes(q.reference) && pool.includes(q.target) && Math.abs(q.target - q.reference) === q.size);
            assert.notEqual(q.size, M.intervalOf(previous), 'consecutive sizes differ');
            assert.notEqual(q.target % 12, previous.target % 12, 'the second note never repeats the last target name');
            if (settings.direction === 'up' || settings.direction === 'harmonic') assert(q.target > q.reference);
            if (settings.direction === 'down') assert(q.target < q.reference);
            previous = q; checked++;
        }
    }
}
console.log('PASS ' + checked + ' consecutive interval questions: sizes and second-note names never repeat');

let target = 0, total = 0;
for (let i = 0; i < 400; i++) { const p = M.plan({...M.defaults(), size: 24}, 'learn', 'violin', {}, null); target += p.filter(d => d === 7).length; total += p.length; }
assert(target / total > .32 && target / total < .45, 'one learned interval keeps about 34-41% of a block');
const counts = Array(13).fill(0);
for (let i = 0; i < 3000; i++) for (const d of M.plan(M.defaults(), 'cold', 'violin', {}, null)) counts[d]++;
const share = counts.slice(1).map(n => n / 36000);
assert(Math.max(...share) - Math.min(...share) < .02, 'blind check sizes are uniform');
console.log('PASS block mix: learned share ' + (target / total).toFixed(3) + ' · blind shares ' + Math.min(...share).toFixed(3) + '-' + Math.max(...share).toFixed(3));

const row = o => ({protocol: 1, kind: 'learn', known: [7], responseMode: 'name', result: 'answered', replayed: 0, ...o});
assert(M.correct(row({size: 7, guess: 7}))); assert(!M.correct(row({size: 7, guess: 5})));
assert(M.correct(row({size: 5, guess: 'out', responseMode: 'set'}))); assert(!M.correct(row({size: 5, guess: 'out'})));
assert(!M.correct(row({size: 7, guess: 7, result: 'timeout'})));
const now = Date.now(), sessions = [], rows = [];
for (let b = 0; b < 2; b++) {
    const id = 's' + b;
    sessions.push({id, protocol: 1, completed: true, kind: 'learn', known: [7], responseMode: 'name', allowRepeats: false,
        limit: 'fast', direction: 'up', octaves: [4, 5], started: now - 1000 * (b + 1)});
    for (let i = 0; i < 12; i++) rows.push(row({sessionId: id, size: 7, guess: 7}));
    for (let i = 0; i < 6; i++) rows.push(row({sessionId: id, size: i + 1, guess: i + 1}));
}
const promotion = M.promotion(rows, sessions, M.defaults(), now);
assert(promotion.ready && promotion.next === 12, 'the octave follows the fifth');
assert(!M.promotion(rows.slice(0, 20), sessions, M.defaults(), now).ready);
assert(!M.promotion(rows, sessions, {...M.defaults(), direction: 'down'}, now).ready, 'other conditions do not count');
console.log('PASS scoring and the new-interval suggestion');

(async () => {
    const clock = T.createClock(null);
    let expired = null;
    clock.start(performance.now(), 80, at => { expired = at; });
    assert(clock.active && !clock.late(performance.now()));
    clock.press(performance.now() + 60);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(expired, null, 'a finger down before the deadline holds the answer open');
    clock.release();
    await new Promise(r => setTimeout(r, 150));
    assert(Number.isFinite(expired) && !clock.active, 'then the window closes');
    console.log('PASS shared answer clock');
})();
