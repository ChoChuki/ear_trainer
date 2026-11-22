'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
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

const legacy = {...shared,sourceVersion:'iowa-prototype-1'};
assert(m.isFocus(legacy)); assert(m.isFocus(shared));
assert(!m.isFocus({...shared,sourceVersion:'unknown'}));
assert.equal(m.sampleId('piano',64,legacy.sourceVersion),'piano-64-1');
assert.equal(m.sampleId('piano',64),'jclive-piano-64');
sessions[0].sourceVersion=legacy.sourceVersion;
rows.filter(row => row.sessionId==='a').forEach(row => {row.sourceVersion=legacy.sourceVersion;});
assert(promote().ready,'completed training still counts after the sound source changes');

const presets = [
    ['piano','0000_JCLive_sf2_file','201b5e975e6dfd30937c2c153f226e2ca5e0c413b778b5a4a22318d24381765a'],
    ['violin','0400_JCLive_sf2_file','923d2f2a05ad6847a662fd3e7fd14599426dfc7d711e064e1d5d54acaa398166'],
];
for (const [instrument,file,hash] of presets) {
    const bytes=fs.readFileSync(path.join(root,'vendor',file+'.js'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,instrument+' must use the original trainer preset');
    const scope={console:{log(){}}};
    vm.runInNewContext(bytes.toString(),scope);
    const zones=scope['_tone_'+file].zones;
    for (let midi=60; midi<=95; midi++) {
        assert(zones.some(z=>midi>=z.keyRangeLow && midi<=z.keyRangeHigh && (z.file||z.sample)),instrument+' '+midi);
    }
}

require(path.join(root,'ap-focus-audio.js'));
async function testFocusedPlayback() {
    global.document={hidden:false};
    const sources=[];
    const context={
        currentTime:2,state:'suspended',sampleRate:44100,destination:{},
        async resume(){this.state='running';},
        createBuffer(channels,length,rate) {
            return {duration:length/rate,getChannelData:()=>new Float32Array(length)};
        },
        createBufferSource() {
            const node={stop(){this.stopped=true;},start(at){this.when=at;},connect(){},disconnect(){}};
            sources.push(node); return node;
        }
    };
    const calls=[], loaded=[];
    function queue(instrument,midi,when) {
        const node=context.createBufferSource();
        calls.push({instrument,midi,when,node});
        return {when,audioBufferSourceNode:node};
    }
    const sound=APFocusAudio.create(context,async name=>{loaded.push(name);},queue);
    for (const instrument of ['piano','violin']) {
        for (let midi=60; midi<=95; midi++) {
            const clock=await sound.play(instrument,midi);
            assert(Number.isFinite(clock.when));
            assert.equal(clock.id,m.sampleId(instrument,midi));
            assert.equal(calls.at(-1).instrument,instrument);
            assert.equal(calls.at(-1).midi,midi);
            assert.equal(calls.at(-1).when,2.04);
        }
    }
    assert.equal(calls.length,72);
    assert.deepEqual(loaded,calls.map(x=>x.instrument));
    await sound.play('piano',65,true);
    assert(Math.abs(calls.at(-1).when-2.35)<1e-8,'the mask precedes the instrument note');
    sound.stop();
    assert(sources.every(node=>node.stopped),'replay and stop release each previous source');

    let finishLoad;
    const pending=APFocusAudio.create(context,()=>new Promise(resolve=>{finishLoad=resolve;}),queue);
    const stale=pending.play('violin',75); pending.stop(); finishLoad();
    await assert.rejects(stale,/interrupted/);
    assert.equal(calls.length,73,'a late decode must not play after cancellation');
    const failed=APFocusAudio.create(context,async()=>{throw Error('unavailable');},queue);
    await assert.rejects(failed.play('piano',65),/unavailable/);
    assert.equal(calls.length,73);
    console.log('PASS original instrument files, all 72 focused pitches, timing, mixed sources, cancellation, and legacy history');
}
testFocusedPlayback().catch(err=>{console.error(err);process.exitCode=1;});
