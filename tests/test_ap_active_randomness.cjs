'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
// Deterministic RNG for reproducible statistical regression tests.
let seed = 0x776d5ee0;
const math = Object.create(Math);
math.random = () => {seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296;};
const scope = {Math:math, Date, Intl, console};
scope.window = scope; vm.createContext(scope);
for (const file of ['training-core.js','ap-science.js','ap-focus-model.js'])
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),scope,{filename:file});
const m = scope.APFocusModel, T = scope.TrainingCore;
function simulate(known, octaves, instrument, share, rounds, weights = {}) {
    const settings = {...m.defaults(known),octaves,share,size:24};
    const pool = m.pitchPool(octaves,instrument,share>0);
    let prev = null, total = 0, targets = 0, lag2 = 0, lag2Name = 0, alternating4 = 0, alternating6 = 0;
    const all = [], counts = new Map();
    for (let round=0;round<rounds;round++) {
        const recent = [];
        const plan = m.plan(settings,'learn',instrument,weights,prev);
        assert.equal(plan.length,24);
        for (const q of plan) {
            const midi = m.pickMidi(q.pc,pool,prev,known,null,{active:true,recent});
            assert.equal(midi%12,q.pc);
            assert(pool.includes(midi) && m.supports(q.instrument,midi));
            assert(!T.sameNoteName(midi,prev));
            prev=midi; recent.push(midi); if(recent.length>4)recent.shift();
            total++; if(known.includes(midi%12))targets++;
            counts.set(midi,(counts.get(midi)||0)+1);
            all.push(midi); const k=all.length-1;
            if(k>=2){if(midi===all[k-2])lag2++;if(midi%12===all[k-2]%12)lag2Name++;}
            if(k>=3&&midi===all[k-2]&&all[k-1]===all[k-3])alternating4++;
            if(k>=5&&midi===all[k-2]&&all[k-1]===all[k-3]&&all[k-2]===all[k-4]&&all[k-3]===all[k-5])alternating6++;
        }
    }
    assert(pool.every(p=>counts.has(p)), 'every available note remains possible');
    return {total, targets, lag2,lag2Name,alternating4,alternating6,counts};
}
const narrow = simulate([4,5],[4,5],'piano',0,5000);
assert.equal(narrow.targets,5000*14);
assert(narrow.lag2/narrow.total > .02 && narrow.lag2/narrow.total < .10,'suppress but do not forbid two-back repetitions');
assert(narrow.lag2Name/narrow.total < .30);
assert(narrow.alternating4/narrow.total < .02);
assert(narrow.alternating6/narrow.total < .002);
for (const pc of [4,5]) {
    const low=narrow.counts.get(60+pc),high=narrow.counts.get(72+pc);
    assert(low/(low+high)>.35&&low/(low+high)<.65,'both octaves get practice');
}
console.log('PASS E/F, octaves 4–5, '+narrow.total+' draws; exact lag-2 '+(100*narrow.lag2/narrow.total).toFixed(2)+'%, 6-note cycles '+(100*narrow.alternating6/narrow.total).toFixed(3)+'%');
for (const [known,octaves,instrument,share] of [
    [[4,5],[4],'piano',0], [[4,5],[4,5,6],'violin',.5], [[5],[4,5],'piano',0],
    [[4,5,6],[4,5],'violin',0], [m.order,[4,6],'violin',.2], [[9,11],[0],'piano',0]
]) simulate(known,octaves,instrument,share,1000,{4:3,5:2});
// Minimal available pitch-class pool: no impossible requirement to avoid the second-last name.
const tiny = m.pitchPool([0,8],'piano');
assert.equal(m.pickMidi(0,tiny,21,[0,9],null,{active:true,recent:[108,21]}),108);
// Optional count extends only callers who opt in; the original count defaults stay unchanged.
for (const count of [4,6,7,8]) for(let previous=55;previous<67;previous++) {
    const phrase=[];
    const end=T.resetTones((midi,at,duration,volume)=>{
        const source={stop(){this.stopped=true;}}; phrase.push({midi,at,duration,volume,source});
        return {audioBufferSourceNode:source};
    },2,{count,previous});
    assert.equal(phrase.length,count); assert.equal(new Set(phrase.map(v=>v.midi%12)).size,count);
    assert(phrase.every(v=>v.midi%12!==previous%12));
    assert(phrase.every(v=>v.midi>=55&&v.midi<=79));
    assert.equal(end,phrase.at(-1).at+phrase.at(-1).duration);
    T.cancelAudio(); assert(phrase.every(v=>v.source.stopped));
}
console.log('PASS expanded/limited ranges, adaptive weights, mixed instruments, and 6–8-note mask scheduling/cancellation');
