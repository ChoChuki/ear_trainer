'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
global.window = global;
for (const file of ['training-core.js','ap-science.js','ap-focus-model.js']) require(path.join(root,file));
const m = APFocusModel;

for (let length = 1; length <= 12; length++) {
    const settings = {...m.defaults(m.order.slice(0,length)),share:.2};
    for (const mode of ['learn','consolidate','cold']) {
        const block = m.plan(settings,mode,'violin',{5:3});
        const count = mode === 'cold' ? 12 : 24;
        assert.equal(block.length,count);
        assert.equal(block.filter(n => !settings.known.includes(n.pc)).length,length === 12 ? 0 : count/4);
        assert.equal(block.filter(n => n.instrument === 'piano').length,mode === 'cold' ? 0 : 5);
        let previous = 65;
        for (const item of block) {
            const midi = m.pickMidi(item.pc,previous);
            assert.notEqual(midi,previous);
            assert.equal(midi % 12,item.pc);
            assert(midi >= 60 && midi <= 95);
            previous = midi;
        }
    }
}
assert(m.plan({...m.defaults(),share:.5},'cold','piano').every(n => n.instrument === 'piano'));
console.log('PASS: course size, pitch selection, outside trials and instrument mix');

const now = Date.now(), settings = m.defaults([5,4]);
const shared = {protocol:m.protocol,sourceVersion:m.sourceVersion,source:'violin',kind:'learn',known:[5,4]};
const sessions = ['a','b'].map(id => ({...shared,id,completed:true,started:now-1000}));
const rows = [];
function add(pitch, guess, extras={}) {
    rows.push({...shared,sessionId:rows.length%2 ? 'a':'b',pitch,guess,result:'answered',replayed:0,timbre:'violin',...extras});
}
for (let i=0;i<8;i++) { add(65,5); add(64,i<4?4:5); } // 100% F, 50% E gives a 75% class mean
for (let i=0;i<12;i++) add(67,i<3?4:'out');
const promote = () => m.promotion(rows,sessions,settings,'violin',now);
assert.equal(promote().hit,.75);
assert.equal(promote().fa,.25);
assert(promote().ready);
add(64,4,{replayed:1});
assert(!promote().ready,'a replay stays in the target denominator');
rows.pop();
add(64,null,{replayed:2,result:'assisted'});
assert(!promote().ready,'asking for help then leaving is not an independent hit');
rows.pop();
for (const extras of [{kind:'cold',sessionId:'cold'},{timbre:'piano'},{protocol:6},{result:'audio-error'},{result:'interrupted'}]) add(64,'unsure',extras);
assert(promote().ready,'independent checks, another timbre, old scores, and playback errors have no effect');
sessions[1].completed=false; assert(!promote().ready); sessions[1].completed=true;
sessions[1].started=now-15*86400000; assert(!promote().ready); sessions[1].started=now;
sessions[1].known=[5]; assert(!promote().ready); sessions[1].known=[5,4];
assert(!m.promotion(rows,sessions,settings,'piano',now).ready);
const out = {...shared,pitch:67,replayed:0,result:'answered',guess:'out'};
assert(m.correct(out)); assert(!m.correct({...out,guess:'unsure'}));
assert.equal(m.counts([out,{...out,guess:5},{...out,replayed:1,guess:5}]).alarms,1);
console.log('PASS: promotion thresholds, replay, cold, old records and separate instruments');

const ctx = {currentTime:1,outputLatency:.1,baseLatency:.05};
assert.deepEqual(m.outputClock(ctx,1.05,1000),{when:1150,method:'context-estimate'});
ctx.getOutputTimestamp=()=>({contextTime:.98,performanceTime:1000});
assert.deepEqual(m.outputClock(ctx,1.05,1020),{when:1070,method:'output-estimate'});

const dir=path.join(root,'ap-audio');
const src=JSON.parse(fs.readFileSync(path.join(dir,'sources.json'),'utf8'));
assert.equal(src.version,m.sourceVersion);
assert.equal(src.samples.length,72);
const ids=new Set();
for(const instrument of ['piano','violin']) {
    for(const octave of [4,5,6]) {
        const name=instrument+'-'+octave+'.bin';
        const bank=fs.readFileSync(path.join(dir,name));
        let offset=0;
        const parts=src.samples.filter(s=>s.bank===name).sort((a,b)=>a.offset-b.offset);
        assert.equal(parts.length,12);
        for(const [pc,s] of parts.entries()) {
            assert.equal(s.midi,12*(octave+1)+pc);
            assert.equal(s.offset,offset); assert(s.bytes>1000);
            assert.equal(s.instrument,instrument);
            assert.equal(s.id,instrument+'-'+s.midi+'-1');
            assert(!ids.has(s.id)); ids.add(s.id);
            const leading=bank.subarray(s.offset,s.offset+3);
            assert(leading.toString()==='ID3' || (leading[0]===255 && (leading[1]&224)===224));
            offset+=s.bytes;
        }
        assert.equal(offset,bank.length);
    }
}
console.log('PASS: output clock and all 72 recorded MP3 boundaries');
