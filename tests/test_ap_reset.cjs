'use strict';
// The pitch-memory reset: what it schedules, how loud it can get, and that it stops cleanly.
const assert = require('node:assert/strict');
const path = require('node:path');
global.window = global;
require(path.join(__dirname, '..', 'training-core.js'));
const T = TrainingCore;

function recorder() {
    const voices = [];
    const param = () => ({events:[], setValueAtTime(v,t){this.events.push(['set',v,t]);},
        linearRampToValueAtTime(v,t){this.events.push(['lin',v,t]);},
        exponentialRampToValueAtTime(v,t){assert(v > 0); this.events.push(['exp',v,t]);},
        setValueCurveAtTime(c,t,d){assert(c.length >= 2 && d > 0); this.events.push(['curve',c,t,d]);}});
    const node = () => ({connect(){}, disconnect(){}});
    return {voices, currentTime:0, destination:{},
        createOscillator() {
            const v = {...node(), frequency:param(), type:'sine', start(t){this.on=t;}, stop(t){if (this.off === undefined) this.off=t; this.stopped=true;}};
            voices.push(v); return v;
        },
        createGain() {const g = {...node(), gain:param()}; voices.at(-1).gain = g.gain; return g;},
        createBiquadFilter() {return {...node(), type:'', frequency:param()};}};
}
const hz = m => 440 * 2 ** ((m - 69) / 12);

// Short reset: blips over the practice band, about 40% near the previous note, then a glide.
let near = 0, blips = 0;
for (let run = 0; run < 300; run++) {
    const ctx = recorder();
    const end = T.resetTones(ctx, 1, {previous:65, low:60, high:95});
    assert.equal(end, 3.4);
    for (const v of ctx.voices) {
        assert(v.on >= 1 && v.off <= 3.4 + 1e-9, 'inside the reset');
        const f = v.frequency.events[0][1];
        if (v.gain.events[0][0] === 'curve') continue;  // glide partial
        blips++;
        assert(v.off <= 1 + 2.4 - .9 + .1 + 1e-9, 'blips end before the glide is over');
        assert(f >= 100 && f <= 3200, 'audible band ' + f);
        const cents = Math.abs(1200 * Math.log2(f / hz(65)));
        if (cents >= 29 && cents <= 121) near++;
        const chroma = cents % 1200;
        assert(Math.min(chroma, 1200 - chroma) >= 29.9, 'never the previous note again, in any octave');
    }
}
const share = near / blips;
// Random band tones can also land near F4, so the measured share sits a little above 40%.
assert(share > .38 && share < .5, 'share near the previous note ' + share);
console.log('PASS short reset: ' + (blips / 300).toFixed(1) + ' tones per reset, ' + (share * 100).toFixed(0) + '% within 0.3-1.2 semitones of the previous note');

// No previous note (or one outside the audible band): only band tones.
for (const previous of [null, 21, 108]) {
    const ctx = recorder();
    T.resetTones(ctx, 0, {previous, low:21, high:108});
    for (const v of ctx.voices) if (v.gain.events[0][0] !== 'curve') {
        const f = v.frequency.events[0][1];
        assert(f >= 100 && f <= 3200);
    }
}
// A one-note-wide pool still gets an octave-wide band, also at the edges of the piano.
for (const [low, high] of [[108,108],[21,23],[60,60]]) {
    const ctx = recorder();
    T.resetTones(ctx, 0, {low, high});
    const fs = ctx.voices.filter(v => v.gain.events[0][0] !== 'curve').map(v => v.frequency.events[0][1]);
    assert(Math.max(...fs) / Math.min(...fs) <= 2.0001 && Math.min(...fs) >= 100);
}
console.log('PASS band limits for narrow and extreme ranges');

// Shepard glide: partials stay in range, re-enter only while silent, and their sum stays bounded.
for (const [seconds, speed, direction] of [[20,.3,-1],[20,.3,1],[.9,1.3,-1],[.9,1.3,1]]) {
    const ctx = recorder();
    assert.equal(T.shepardGlide(ctx, 5, seconds, {octavesPerSecond:speed, direction}), 5 + seconds);
    const segments = ctx.voices.map(v => {
        const [, f0, t0] = v.frequency.events[0], [, f1, t1] = v.frequency.events[1];
        const [, curve, start, duration] = v.gain.events[0];
        assert(f0 >= 27.5 - 1e-6 && f0 <= 7040 + 1e-6 && f1 >= 27.5 - 1e-6 && f1 <= 7040 + 1e-6);
        assert(Math.abs(start - t0) < 1e-9 && Math.abs(start + duration - t1) < 1e-9);
        assert(direction < 0 ? f1 < f0 : f1 > f0, 'glide direction');
        // A partial that starts or ends inside the glide does so at the silent edge of the envelope.
        if (t0 > 5 + 1e-6) assert(curve[0] < .001, 're-entry is silent');
        if (t1 < 5 + seconds - 1e-6) assert(curve.at(-1) < .001, 'exit is silent');
        return {t0, t1, curve};
    });
    let peak = 0;
    for (let t = 5; t <= 5 + seconds; t += seconds / 400) {
        let sum = 0;
        for (const s of segments) if (t >= s.t0 && t <= s.t1) {
            const x = (t - s.t0) / (s.t1 - s.t0) * (s.curve.length - 1), i = Math.min(s.curve.length - 2, Math.floor(x));
            sum += s.curve[i] + (s.curve[i + 1] - s.curve[i]) * (x - i);
        }
        peak = Math.max(peak, sum);
    }
    assert(peak > .1 && peak < .22, 'summed amplitude ' + peak);
    console.log(`PASS Shepard glide ${seconds}s ${direction < 0 ? 'down' : 'up'}: ${segments.length} partials, peak sum ${peak.toFixed(3)}`);
}

// Register choice.
for (let i = 0; i < 2000; i++) {
    const pick = T.farPitch([60,72,84], 70);
    assert([84].includes(pick));
    assert([60,84].includes(T.farPitch([60,72,84], 72)), 'two equally far candidates');
    assert.equal(T.farPitch([65], 65), 65, 'a single candidate is kept');
}
assert.equal(T.farPitch([], 60), undefined);
assert([60,72].includes(T.farPitch([60,72], null)));
console.log('PASS register choice');

// cancelAudio stops everything a reset scheduled.
const ctx = recorder();
T.resetTones(ctx, 0, {previous:70});
T.shepardGlide(ctx, 0, 20);
T.cancelAudio();
assert(ctx.voices.every(v => v.stopped));
console.log('PASS cancellation');
