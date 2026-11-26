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
// The octave follows the most recent note: more than an octave away whenever the pool allows.
function checkRegister(midi, pool, previous) {
    if (!Number.isInteger(previous)) return;
    const options = pool.filter(p => p % 12 === midi % 12), gap = Math.abs(midi - previous);
    if (options.some(p => Math.abs(p - previous) >= 13)) assert(gap >= 13, `more than an octave: ${previous} -> ${midi}`);
    else assert.equal(gap, Math.max(...options.map(p => Math.abs(p - previous))));
}

for (let length = 1; length <= 12; length++) {
    const settings = {...m.defaults(m.order.slice(0,length)),share:.2};
    for (const mode of ['learn','consolidate','cold']) {
        const block = m.plan(settings,mode,'violin',{5:3},65);
        const count = mode === 'cold' ? 12 : 24;
        assert.equal(block.length,count);
        const targets = block.filter(n => settings.known.includes(n.pc)).length;
        if (mode === 'cold') assert(block.every(q => q.pc >= 0 && q.pc < 12));
        else if (length === 1) {
            assert(targets >= Math.round(count * .34) && targets <= Math.round(count * .41));
            assert(block.some((x,i) => i && x.pc !== 5 && block[i-1].pc !== 5));
        } else assert.equal(count-targets,length === 12 ? 0 : count/4);
        assert.equal(block.filter(n => n.instrument === 'piano').length,mode === 'cold' ? 0 : 5);
        let previous = 65;
        for (const item of block) {
            const pool = m.pitchPool(settings.octaves,'violin');
            const midi = m.pickMidi(item.pc,pool,previous,settings.known);
            assert.equal(midi % 12,item.pc);
            assert(!TrainingCore.sameNoteName(midi,previous));
            assert(midi >= 60 && midi <= 95);
            checkRegister(midi,pool,previous);
            previous = midi;
        }
    }
}
assert(m.plan({...m.defaults(),share:.5},'cold','piano').every(n => n.instrument === 'piano'));
assert.deepEqual(m.pitchPool([3],'violin'),[55,56,57,58,59]);
assert.deepEqual(m.pitchPool([0,8],'piano'),[21,22,23,108]);
assert.equal(m.rangeText(m.pitchPool([4,6],'violin')),'C4–B4 · C6–B6');
assert.equal(m.rangeText(m.pitchPool([3,4,5,6,7,8],'violin')),'G3–C8');
assert.deepEqual(m.plan({...m.defaults(),octaves:[8]},'learn','piano'),[]);
assert.deepEqual(m.plan({...m.defaults([9]),octaves:[0],share:.5},'learn','piano'),[]);
assert.equal(m.plan({...m.defaults([9]),octaves:[0],share:.5},'cold','piano').length,12);
assert(m.validSettings({...m.defaults(),octaves:undefined},'violin'),'older preferences accepted');
assert(!m.validSettings({...m.defaults(),octaves:[2]},'violin'));
assert(!m.validSettings({...m.defaults(),octaves:[]},'piano'));
assert(!m.supports('violin',54)); assert(m.supports('violin',55)); assert(m.supports('piano',21));
assert(!m.supports('violin',55,'iowa-prototype-1'));
let prior = 65, checked = 0;
for (const inst of ['violin','piano']) {
    const setups = [[[4],[5]], [[3,7],[7,9]], [[4,6],m.order], [[7,8],[0,2,7]]];
    if (inst === 'piano') setups.push([[0],[9]],[[0,2,8],[9,0]],[[1,7],m.order.slice(0,11)]);
    for (const [octaves,known] of setups) {
        for (const mode of ['cold','learn','consolidate']) for (const size of [12,24,36,48,60]) {
            const s = {...m.defaults(known),octaves,size,share:octaves.includes(0) || octaves.includes(1) ? 0 : .5};
            const pool = m.pitchPool(octaves,inst,mode !== 'cold' && s.share > 0);
            for (let n=0; n<25; n++) {
                const plan = m.plan(s,mode,inst,{},prior);
                assert.equal(plan.length,mode === 'cold' ? 12 : size);
                for (const q of plan) {
                    const midi = m.pickMidi(q.pc,pool,prior,known);
                    assert.equal(midi%12,q.pc);
                    assert(!TrainingCore.sameNoteName(midi,prior));
                    assert(octaves.includes(m.octaveOf(midi)) && m.supports(q.instrument,midi));
                    checkRegister(midi,pool,prior);
                    prior = midi; checked++;
                }
            }
        }
    }
}
// The planned name is never replaced; the most recent sound (here an example, D4) only moves the octave.
for(let i=0;i<100;i++){
    assert.equal(m.pickMidi(5,m.pitchPool([3,4,6],'violin'),77,[5],62,{allowRepeats:true}),89);
    assert.notEqual(m.pickMidi(5,m.pitchPool([3,4,6],'violin'),77,[5],62) % 12,5);
    assert([65,89].includes(m.pickMidi(5,m.pitchPool([3,4,6],'violin'),77,[5],null,{allowRepeats:true})),'both F are an octave from F5');
}
// A name may follow itself, so the previous answer predicts nothing about the next one.
let ff = 0, fAny = 0, of = 0, oAny = 0;
for (let n = 0; n < 4000; n++) {
    const block = m.plan({...m.defaults([5]),allowRepeats:true},'learn','violin');
    for (let i = 1; i < block.length; i++) {
        if (block[i-1].pc === 5) {fAny++; if (block[i].pc === 5) ff++;}
        else {oAny++; if (block[i].pc === 5) of++;}
    }
}
// Within a shuffled block a repeat is only slightly rarer than chance ((k-1)/(n-1) against k/(n-1)).
assert(ff / fAny > .28 && Math.abs(ff / fAny - of / oAny) < .06, `P(F|F)=${ff/fAny} P(F|Other)=${of/oAny}`);
console.log('PASS independent names in a block: P(F|F)=' + (ff/fAny).toFixed(3) + ' P(F|Other)=' + (of/oAny).toFixed(3));
console.log('PASS '+checked+' consecutive focused targets, mixed instruments, selectable octaves and block boundaries');
console.log('PASS: course size, pitch selection, outside trials and instrument mix');

// Wong et al. (2025): 1,183 ms for one name to 2,028 ms for twelve, plus 150 ms for touch input.
assert.equal(m.answerWindow('fast'),1333);
assert.equal(m.answerWindow('strict'),1333,'2.8.3: no scaling by the number of buttons');
assert.equal(m.answerWindow('relaxed'),1333);
assert.equal(m.answerWindow('off',5),null);
assert.equal(m.defaults().limit,'fast');
assert(m.validSettings({...m.defaults(),limit:'relaxed'},'violin'));
assert(m.validSettings({...m.defaults(),limit:'fast'},'violin'), '2.8.2: fixed 1.3 s window');
assert(!m.validSettings({...m.defaults(),limit:'rapid'},'violin'));
assert.equal(m.answerWindow('fast',12),1333);
console.log('PASS answer windows');

const now = Date.now(), settings = m.defaults([5,4]);
const shared = {protocol:m.protocol,sourceVersion:m.sourceVersion,source:'violin',kind:'learn',known:[5,4],
    responseMode:settings.responseMode,limit:settings.limit,allowRepeats:settings.allowRepeats,octaves:settings.octaves};
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
assert(!m.correct(out)); assert(m.correct({...out,guess:7}));
assert(m.correct({...out,responseMode:'set'})); assert(!m.correct({...out,guess:'unsure'}));
assert.equal(m.counts([out,{...out,guess:5},{...out,replayed:1,guess:5}]).alarms,1);
const relativeTarget = {...out,sessionId:'a',timbre:'violin',pitch:65,result:'relative',guess:null};
const relativeStats = m.counts([relativeTarget]);
assert.equal(relativeStats.targets,1);assert.equal(relativeStats.hits,0);
rows.push(relativeTarget);assert(!promote().ready,'relative answers must not inflate independent target accuracy');rows.pop();
assert(!m.first({...out,result:'relative'}));
// A late answer is a target attempt without a hit; for an outside note it is neither a hit nor a false alarm.
const lateTarget = {...out,pitch:65,result:'timeout',guess:null};
const lateStats = m.counts([lateTarget,{...out,result:'timeout',guess:null}]);
assert.equal(lateStats.targets,1); assert.equal(lateStats.hits,0); assert.equal(lateStats.outside,0); assert.equal(lateStats.late,2);
rows.push({...lateTarget,sessionId:'a',timbre:'violin'});assert(!promote().ready,'late answers lower the hit rate');rows.pop();
assert(promote().ready);
// Blocks recorded before protocol 9 stay readable but no longer support a new-note suggestion.
assert(m.isFocus({...shared,protocol:7})); assert(m.isFocus({...shared,protocol:8}));
sessions[1].protocol=7; assert(!promote().ready,'protocol 7 blocks do not count'); sessions[1].protocol=m.protocol;
assert(promote().ready);
console.log('PASS: promotion thresholds, replay, cold, old records and separate instruments');

// The blind check is independent of study settings; a fixed-size block has no fixed name quotas.
const checkSettings = {...m.defaults([5]), octaves:[4,5,6]};
const frequencies = Array(12).fill(0), spread = new Set();
for (let block = 0; block < 3000; block++) {
    const plan = m.plan(checkSettings,'cold','violin');
    spread.add(plan.filter(q => q.pc === 5).length);
    plan.forEach(q => frequencies[q.pc]++);
}
assert(frequencies.every(n => n > 2650 && n < 3350));
assert(spread.has(0) && spread.has(2));
assert(m.plan({...m.defaults([5]),octaves:[3]},'cold','violin').every(q => [7,8,9,10,11].includes(q.pc)));
assert.equal(m.plan({...m.defaults([5]),octaves:[3]},'learn','violin').length,0);
assert.equal(m.namesFor('name',[5]).length,12);
assert.deepEqual(m.namesFor('set',[5]),[5]);
const registers = new Set();
for (let i = 0; i < 120; i++) registers.add(m.pickMidi(5,m.pitchPool([4,5,6],'violin'),60,[5],null,{blind:true}));
assert.deepEqual([...registers].sort(),[65,77,89]);
const checkRow = {...shared,kind:'cold',known:m.namesFor('name',[]),pitch:68,guess:8,result:'answered',replayed:0,poolSize:12};
assert(m.correct(checkRow)); assert(!m.correct({...checkRow,guess:'out'}));
const group = [ {...checkRow,eligibleCold:true}, {...checkRow,result:'relative'}, {...checkRow,result:'timeout'},
    {...checkRow,guess:'unsure'}, {...checkRow,result:'interrupted'}, {...checkRow,result:'audio-error'},
    {...checkRow,firstRecorded:true}, {...checkRow,eligibleCold:true,poolSize:5},
    {...checkRow,protocol:8,eligibleCold:true} ];
assert.deepEqual(m.namingScores(group),{rested:{hits:1,total:1},limited:{hits:1,total:1},
    firstUse:{hits:1,total:1},warm:{hits:0,total:3}});
const midnight = Date.parse('2026-11-24T15:00:00Z');
assert(!APPitchScience.rested(midnight-60000,midnight+60000));
assert(!APPitchScience.rested(midnight,midnight+APPitchScience.restMs-1));
assert(APPitchScience.rested(midnight,midnight+APPitchScience.restMs));
assert(!APPitchScience.rested(null,midnight));
assert.equal(APPitchScience.median([900,200]),550);
console.log('PASS exact-name blind checks, balanced names, randomized first register, prior versions and first-note groups');

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
    const available=m.pitchPool(m.octaveChoices(instrument),instrument);
    for (const midi of available) {
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
        },
        createOscillator() {
            const node = this.createBufferSource();
            node.frequency = {setValueAtTime(){},exponentialRampToValueAtTime(){}};
            return node;
        },
        createGain() {
            return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
                setValueCurveAtTime(curve,at,duration){assert(curve.length >= 2 && duration > 0 && at >= 2);}},connect(){},disconnect(){}};
        },
        createBiquadFilter() {return {frequency:{setValueAtTime(){}},connect(){},disconnect(){}};}
    };
    const calls=[], loaded=[];
    function queue(instrument,midi,when) {
        const node=context.createBufferSource();
        calls.push({instrument,midi,when,node});
        return {when,audioBufferSourceNode:node};
    }
    const sound=APFocusAudio.create(context,async name=>{loaded.push(name);},queue);
    for (const instrument of ['piano','violin']) {
        for (const midi of m.pitchPool(m.octaveChoices(instrument),instrument)) {
            const clock=await sound.play(instrument,midi);
            assert(Number.isFinite(clock.when));
            assert.equal(clock.id,m.sampleId(instrument,midi));
            assert.equal(calls.at(-1).instrument,instrument);
            assert.equal(calls.at(-1).midi,midi);
            assert.equal(calls.at(-1).when,2.04);
        }
    }
    const total = 88 + 54;  // one call per playable pitch
    assert.equal(calls.length,total);
    assert.deepEqual(loaded,calls.map(x=>x.instrument));
    await sound.play('piano',65,true);
    assert(calls.at(-1).when >= 2.04 + 2.4 + .7 && calls.at(-1).when <= 2.04 + 2.4 + 1.2,'2.4 s reset, then a variable gap');
    const resetVoices = sources.filter(node => node.frequency).length;
    assert(resetVoices >= 20, 'reset tones and glide partials: ' + resetVoices);
    await sound.play('violin',77,{previous:65,low:60,high:95});
    assert(calls.at(-1).when >= 2.04 + 3.1 && calls.at(-1).when <= 2.04 + 3.6);
    await sound.play('violin',77,{long:true});
    assert(calls.at(-1).when >= 2.04 + 20.7 && calls.at(-1).when <= 2.04 + 21.2,'20 s glide after labelled notes');
    sound.stop();
    assert(sources.every(node=>node.stopped),'replay and stop release each previous source');

    let finishLoad;
    const pending=APFocusAudio.create(context,()=>new Promise(resolve=>{finishLoad=resolve;}),queue);
    const stale=pending.play('violin',75); pending.stop(); finishLoad();
    await assert.rejects(stale,/interrupted/);
    assert.equal(calls.length,total+3,'a late decode must not play after cancellation');
    const failed=APFocusAudio.create(context,async()=>{throw Error('unavailable');},queue);
    await assert.rejects(failed.play('piano',65),/unavailable/);
    assert.equal(calls.length,total+3);
    console.log('PASS original instrument files, all 142 playable pitches, short and long resets, mixed sources, cancellation and history');
}
testFocusedPlayback().catch(err=>{console.error(err);process.exitCode=1;});
