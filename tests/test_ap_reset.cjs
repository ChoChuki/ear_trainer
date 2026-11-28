'use strict';
// The pitch-memory reset: what it schedules, how loud it can get, and that it stops cleanly.
const assert = require('node:assert/strict');
const path = require('node:path');
global.window = global;
require(path.join(__dirname, '..', 'training-core.js'));
const T = TrainingCore;

for (const long of [false,true]) {
    for (let previous=55; previous<=85; previous++) {
        const phrase=[];
        const queue=(midi, at, duration, volume)=>{
            const source={stop(){this.stopped=true;}};
            phrase.push({midi,at,duration,volume,source});
            return {audioBufferSourceNode:source};
        };
        const end=T.resetTones(queue,2,{previous,long});
        assert.equal(phrase.length,long?6:4);
        assert.equal(new Set(phrase.map(v=>v.midi%12)).size,phrase.length);
        for(const [i,v] of phrase.entries()){
            assert(Number.isInteger(v.midi) && v.midi>=55 && v.midi<=79);
            assert.notEqual(v.midi%12,previous%12);
            assert(v.duration===.7 && v.volume>0 && v.volume<.75);
            if(i)assert(v.at>=phrase[i-1].at+phrase[i-1].duration+.0899);
        }
        assert.equal(end,phrase.at(-1).at+phrase.at(-1).duration);
        const gap=T.resetGap();assert(gap>=.38 && gap<=.5);
        T.cancelAudio();
        assert(phrase.every(v=>v.source.stopped));
    }
}
console.log('PASS sampled phrases, silence, cancellation and exclusion of the previous note');
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


// Explicit duration follows a caller's target length rather than a fixed short mask.
for (const duration of [.4,.7,1.1]) {
    const lengths=[];
    T.resetTones((_midi,_at,length)=>{lengths.push(length);return {audioBufferSourceNode:{stop(){}}};},0,{duration,count:8});
    assert.deepEqual(lengths,Array(8).fill(duration));
    T.cancelAudio();
}
