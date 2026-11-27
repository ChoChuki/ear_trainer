'use strict';
// Classic AP modes: note names are independent of the previous question and only the
// register follows it (more than an octave apart whenever the range allows).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const repo = process.argv[2] || path.join(__dirname, '..');
const context = {console, Intl, Date, Math, Float32Array, localStorage:{getItem:()=>null}, window:null};
context.window = context;
vm.createContext(context);
for (const file of ['training-core.js', 'ap-science.js']) vm.runInContext(fs.readFileSync(path.join(repo,file),'utf8'),context,{filename:file});
const S = context.APPitchScience;

// Candidates of one note name, as makeSequence sees them: octaves shared by every class.
function candidates(from, to, pc) {
    const all = Array.from({length:to-from+1},(_,i)=>from+i);
    const classes = [...new Set(all.map(m=>m%12))];
    const octaves = classes.map(c=>new Set(all.filter(m=>m%12===c).map(m=>Math.floor(m/12))));
    const common = [...octaves[0]].filter(o=>octaves.every(set=>set.has(o)));
    return common.map(o=>12*o+pc);
}
function checkRegister(p, prior, from, to) {
    if (!Number.isInteger(prior)) return;
    const options = candidates(from, to, p % 12), gap = Math.abs(p - prior);
    if (options.some(c => Math.abs(c - prior) >= 13)) assert(gap >= 13, `more than an octave: ${prior} -> ${p}`);
    else assert.equal(gap, Math.max(...options.map(c => Math.abs(c - prior))), `farthest available: ${prior} -> ${p}`);
}

const runCases = [
    {from:60,to:71,known:[5],total:20000},
    {from:60,to:71,known:[5,4,6],total:20000},
    {from:60,to:95,known:[5,4,6],total:20000},
    {from:55,to:88,known:[5,4,6],total:20000},
    {from:60,to:71,known:null,total:20000},
    {from:60,to:95,known:null,total:20000},
    {from:48,to:95,known:[5,4],total:20000},
    {from:60,to:71,known:[5],total:20000,knownWeights:{5:4}},
];
for (const c of runCases) {
    const hard = S.makeSequence({...c,previousMidi:64});
    assert.equal(hard.length,c.total);
    hard.forEach((m,i) => {
        const prev = i ? hard[i-1] : 64;
        assert.notEqual(m%12,prev%12);
        checkRegister(m,prev,c.from,c.to);
    });
    const a = Array.from(S.makeSequence({...c,previousMidi:64,allowRepeats:true}));
    assert.equal(a.length,c.total);
    let last = 64;
    for (const p of a) {
        assert(Number.isInteger(p) && p >= c.from && p <= c.to);
        assert.notEqual(p % 12,last % 12,'old repeat setting must also exclude matching classes');
        checkRegister(p,last,c.from,c.to);
        last=p;
    }
}
console.log('PASS 320,000 AP draws including legacy repeat settings, all cross-octave checks');
for (const to of [71,95]) {
    assert.deepEqual(Array.from(S.makeSequence({from:60,to,total:1,known:[5],previousMidi:65,forcedPC:5,allowRepeats:true})),[]);
}
let prior = 64;
for (let i = 0; i < 6000; i++) {
    const forced = i % 2 === 0 ? 5 : 4;
    const arr = S.makeSequence({from:60,to:95,total:1,known:[5,4,6],previousMidi:prior,forcedPC:forced});
    assert.equal(arr.length,1); assert.equal(arr[0]%12,forced);
    checkRegister(arr[0], prior, 60, 95);
    prior = arr[0];
}
assert.deepEqual(Array.from(S.makeSequence({from:60,to:71,total:1,known:[5],forcedPC:11})).map(x=>x%12),[11],'a forced outside name is allowed');
assert.deepEqual(Array.from(S.makeSequence({from:60,to:71,total:3,known:[5],forcedPC:13})),[],'an impossible name gives nothing');
console.log('PASS forced reviews and register placement');
