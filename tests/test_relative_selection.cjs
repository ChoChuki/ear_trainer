'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = new Map();
const storage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};
function openApp() {
    const ctx = vm.createContext({localStorage:storage, console});
    for (const name of ['training-core.js','relative-course.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),ctx);
    }
    return ctx;
}
const app = openApp(), C = app.RelativePitchCourse;
for (const [site,low,high] of [['violin',55,88], ['piano',36,95]]) {
    assert.equal(C.load(site).level,C.ALL_LEVEL);
    for (const activity of ['test','practice','review','melody','locate','produce']) {
        const references=new Set(), targets=new Set(), intervals=new Set();
        let previous=app.TrainingCore.lastQuestion(site);
        for(let block=0; block<20; block++) {
            const round=C.createRound({low,high,activity,total:100,previous});
            assert(!round.error);
            for (const q of round.questions) {
                assert(!app.TrainingCore.sameNoteName(q.target,previous?.target));
                if(previous?.reference!=null) assert.notEqual(q.distance,Math.abs(previous.target-previous.reference));
                references.add(q.reference); targets.add(q.target); intervals.add(q.distance); previous=q;
            }
        }
        assert.equal(references.size,high-low+1); assert.equal(targets.size,high-low+1); assert.equal(intervals.size,25);
        app.TrainingCore.rememberQuestion(site,previous.reference,previous.target);
    }
}
const pcs=[0,4,7];
for(const activity of ['test','practice','melody','review']) {
    const before=openApp().TrainingCore.lastQuestion('piano');
    const block=C.createRound({low:60,high:72,pitchClasses:pcs,activity,total:80,previous:before});
    let previous=before;
    for(const q of block.questions){
        for(const note of [q.reference,q.target,q.prelude].filter(n=>n!=null)) assert(note>=60&&note<=72&&pcs.includes(note%12));
        assert.notEqual(q.target%12,previous.target%12); previous=q;
    }
}
const prior={reference:60,target:62};
for(let n=0;n<100;n++) {
    const q=C.question({level:1,low:60,high:72,activity:'review',repair:'higher:2',previous:prior});
    assert.notEqual(q.target,62);assert.equal(q.distance,1);assert(!q.repair);
}
assert.equal(C.drawPair({low:60,high:61,distances:[1],direction:'higher',previous:{reference:60,target:61}}),null);
assert.equal(C.drawPair({low:48,high:84,distances:[12],pitchClasses:[0],previous:{target:72}}),null);
let previous=prior;
for(let n=0;n<300;n++){
    const q=C.drawPair({low:60,high:72,distances:[2],previous});assert(q);assert.equal(q.distance,2);assert.notEqual(q.target,previous.target);previous=q;
}
const notes=new Set(); previous=null;
for(let n=0;n<5000;n++) {
    const q=C.drawPair({low:36,high:95,distances:Array.from({length:59},(_,i)=>i+1),previous});
    assert.notEqual(q.target,previous?.target);assert.notEqual(q.distance,previous?.distance);notes.add(q.target);previous=q;
}
assert.equal(notes.size,60);
app.TrainingCore.rememberQuestion('violin',previous.reference,previous.target);
assert.equal(openApp().TrainingCore.lastQuestion('piano').target,previous.target);
const old={level:1,records:[],sessions:[],memory:{}};
storage.setItem('rp-course-v2-piano',JSON.stringify(old));assert.equal(C.load('piano').level,C.ALL_LEVEL);
storage.setItem('rp-course-v2-piano',JSON.stringify({...old,level:4}));assert.equal(C.load('piano').level,4);
storage.setItem('rp-course-v2-piano',JSON.stringify({...old,levelChosen:true}));assert.equal(C.load('piano').level,1);
console.log('PASS full-register defaults, all intervals, pitch filters, scheduled repairs, narrow ranges, and no repeats across blocks, instruments and reloads');
