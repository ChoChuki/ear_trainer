/* Controller-level sound routing checks. These execute the production functions
 * with an explicit audio/clock boundary; they are not browser or listening tests.
 * UI rendering is a no-op, not a DOM implementation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
// app.js uses column-zero declarations for top-level functions. Keep their exact
// source, rather than reproducing the routing logic in this test.
const declarations=[...source.matchAll(/^(?:async\s+)?function\s+([\w$]+)\s*\(/gm)];
function production(name){
 const i=declarations.findIndex(match=>match[1]===name);assert(i>=0,`Missing production function ${name}`);
 return source.slice(declarations[i].index,declarations[i+1]?.index??source.length);
}
const functions=['currentPool','reviewAllowed','reviewRow','auditionSound','idleBoardPlay',
 'cancelAudio','freePlay','selectedPreviewPitches','clearSelectionPreview','previewSelection',
 'pauseReview','previewNotes','newQuestion','playTrial','submit','replay'];
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function fixture(instrument='violin'){
 const noop=()=>{},element={textContent:'',querySelector:()=>null};
 const ctx=vm.createContext({console,performance:{now:()=>1000},Date,Math,setTimeout:()=>1,clearTimeout:noop});
 ctx.window=ctx;ctx.globalThis=ctx;
 for(const file of ['training-core.js','ap-science.js','ap-focus-model.js','unified-model.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 Object.assign(ctx,{
  U:ctx.UnifiedModel,S:ctx.APPitchScience,instrumentMode:instrument,PLAY_DURATION:.7,
  document:{hidden:false,querySelectorAll:()=>[]},$:()=>element,
  cfg:{timbre:'mixed',known:[5],octaves:[4,5]},mode:'single',phase:'done',ready:true,testActive:true,
  generation:0,nextTimer:null,pickName:null,pickOctave:null,pickNameAt:null,onset:0,deadline:null,
  pendingSound:null,selectionPreview:null,summarySession:null,reviewPitch:null,
  pendingVoices:new Map(),activePointers:new Map(),activeVoices:new Map(),
  audioContext:{state:'running',currentTime:10},player:{cancelQueue:noop},
  answerClock:{stop:noop,start:noop},TrainingTracker:{activity:noop},
  render:noop,renderHeldNotes:noop,renderSelectionPreview:noop,releaseAllKeys:noop,
  clearFeedback:noop,clearPreviewMark:noop,markReference:noop,paintFeedback:noop,
  msg:noop,status:noop,saveSession:noop,saveRow:noop,feedbackText:()=>'',
  tr:key=>key,label:midi=>String(midi),hasOutside:()=>true,
  canContinue:token=>ctx.testActive&&ctx.generation===token&&!ctx.document.hidden,
  audioFailure:()=>{throw Error('Unexpected audio failure')},
  queued:[],durations:[],freeVoices:[],ensureAudio:async()=>{},
  queueInstrumentNote:(sound,midi,at,duration=.7)=>{ctx.queued.push({sound,midi});ctx.durations.push(duration);return {when:at,audioBufferSourceNode:{onended:null,stop:noop,disconnect:noop}};},
  playFreeVoice:(midi,sound)=>ctx.freeVoices.push({sound,midi}),
 });
 ctx.TrainingCore.waitForAudio=async(_context,_at,allowed)=>allowed();
 ctx.APFocusModel.outputClock=(_context,at)=>({when:at*1000,method:'test-clock'});
 ctx.S.markLabel=ctx.S.markPractice=noop;
 ctx.S.lastPracticeAt=()=>null;
 for(const name of functions)vm.runInContext(production(name),ctx,{filename:`app.js:${name}`});
 ctx.session={id:'test',mode:'single',display:'buttons',timbre:'mixed',blind:false,known:[5],
  pitches:ctx.U.pitches(instrument,[4,5]),recent:[],ordinal:0,rows:[],total:0,correct:0,
  limit:null,auto:false,mask:false,lo:ctx.U.limits[instrument][0],hi:ctx.U.limits[instrument][1],
  min:1,max:12,direction:'both'};
 ctx.trial={target:65,pitch:65,reference:null,timbre:'piano',replayed:0,correct:false,octaveCorrect:null};
 return ctx;
}
function setRP(ctx){
 ctx.mode=ctx.session.mode='interval';ctx.session.known=[5,6,7];
 ctx.trial={target:67,reference:60,size:7,timbre:'piano',replayed:0,correct:false};
}
function expectSound(ctx,notes,sound){assert.deepEqual(plain(ctx.queued),notes.map(midi=>({sound,midi})));}

(async()=>{
 // Both random outcomes are reachable, while fixed sounds do not consult RNG.
 const model=fixture().U;
 for(const fixed of ['piano','violin'])assert.equal(model.drawTimbre(fixed,()=>{throw Error('Fixed sound drew RNG')}),fixed);
 assert.equal(model.drawTimbre('mixed',()=>0),'piano');
 assert.equal(model.drawTimbre('mixed',()=>.499999),'piano');
 assert.equal(model.drawTimbre('mixed',()=>.5),'violin');
 assert.equal(model.drawTimbre('mixed',()=>.999999),'violin');

 // The actual newQuestion creates one timbre, uses it in sample identity, and
 // retains the displayed instrument as the history source.
 for(const instrument of ['piano','violin'])for(const mode of ['single','interval']){
  const ctx=fixture(instrument);if(mode==='interval')setRP(ctx);
  let draws=0,played=0;
  ctx.U.drawTimbre=choice=>{assert.equal(choice,'mixed');draws++;return 'violin';};
  ctx.U.drawAP=()=>65;ctx.U.drawRP=()=>({reference:60,target:67,size:7,direction:'higher'});
  ctx.playTrial=replaying=>{assert.equal(replaying,false);played++;};
  ctx.newQuestion();assert.equal(draws,1);assert.equal(played,1);
  assert.equal(ctx.trial.timbre,'violin');assert.equal(ctx.trial.timbreMode,'mixed');
  assert.equal(ctx.trial.source,instrument);
  if(mode==='single')assert.equal(ctx.trial.sampleId,ctx.APFocusModel.sampleId('violin',65));
 }

 // Questions and replays use the stored sound even if a fresh random choice
 // would be the other instrument. RP keeps it for both notes.
 for(const mode of ['single','interval']){
  const ctx=fixture();if(mode==='interval')setRP(ctx);
  const notes=mode==='single'?[65]:[60,67];
  ctx.U.drawTimbre=()=>{throw Error('Playback drew another timbre')};
  await ctx.playTrial(false);expectSound(ctx,notes,'piano');assert.equal(ctx.phase,'answer');
  ctx.queued=[];ctx.replay();await flush();expectSound(ctx,notes,'piano');assert.equal(ctx.trial.replayed,1);
  ctx.queued=[];ctx.phase='done';ctx.replay();expectSound(ctx,notes,'piano');
 }

 // Fixed AP interference and target obey the sound choice, and maskers still
 // use the real reset-tone generator and its 3–4-note count.
 for(const [random,expected] of [[0,3],[.999999,4]]){
  const ctx=fixture('violin');ctx.Math=Object.create(Math);ctx.Math.random=()=>random;ctx.session.timbre='piano';ctx.session.mask=true;ctx.session.ordinal=2;
  await ctx.playTrial(false);
  assert.equal(ctx.trial.resetNoteCount,expected);
  assert.equal(ctx.queued.length,ctx.trial.resetNoteCount+1);
  assert(ctx.queued.every(note=>note.sound==='piano'));
  assert.equal(ctx.durations.length,ctx.trial.resetNoteCount+1);
  assert(ctx.durations.every(duration=>duration===ctx.PLAY_DURATION));
 }

 // Automatic correct RP replay, incorrect RP correction, AP correction and
 // timeout correction all use the question's sound, without another draw.
 for(const [mode,guess] of [['interval',7],['interval',6],['interval','timeout'],['single','out'],['single','timeout']]){
  const ctx=fixture();if(mode==='interval')setRP(ctx);ctx.phase='answer';
  ctx.U.drawTimbre=()=>{throw Error('Feedback drew another timbre')};
  ctx.submit(guess);expectSound(ctx,mode==='interval'?[60,67]:[65],'piano');
  assert.equal(ctx.phase,'done');assert.equal(ctx.session.total,1);
 }

 // A wrong answer may not schedule auto-next even with auto enabled. Verify
 // all answer surfaces, wrong octave, Other, timeout, and blind-test isolation.
 for(const instrument of ['violin','piano'])for(const display of ['buttons','instrument']){
  const cases=[
   {mode:'single',args:[5,4],pause:false},
   {mode:'single',args:[5,5],pause:true},
   {mode:'single',args:[4,4],pause:true},
   {mode:'single',args:['out'],pause:true},
   {mode:'single',args:['out'],target:67,pause:false},
   {mode:'single',args:['unsure'],pause:true},
   {mode:'single',args:['timeout'],pause:true},
   {mode:'single',args:[5,4],blind:true,pause:true},
   {mode:'single',args:['out'],blind:true,pause:true},
   {mode:'single',args:['relative'],blind:true,pause:true},
   {mode:'interval',args:[7],pause:false},
   {mode:'interval',args:[6],pause:true},
   {mode:'interval',args:['timeout'],pause:true},
   {mode:'interval',args:[7,null,53],pause:true}
  ];
  for(const c of cases){
   const ctx=fixture(instrument);if(c.mode==='interval')setRP(ctx);
   ctx.session.display=display;ctx.session.auto=true;ctx.session.blind=!!c.blind;
   ctx.phase='answer';if(c.target)ctx.trial.target=c.target;
   let timers=0;ctx.setTimeout=()=>++timers;
   ctx.submit(...c.args);
   assert.equal(ctx.session.reviewPaused,c.pause,JSON.stringify(c));
   assert.equal(ctx.nextTimer!==null,!c.pause,JSON.stringify(c));
   assert.equal(timers,c.pause?0:1);
   assert.equal(ctx.session.total,1);
   if(!c.blind){ctx.replay();assert.equal(ctx.nextTimer!==null,!c.pause);}
   if(c.pause)assert.equal(timers,0,'Replay must not re-arm auto-next');
   assert.equal(ctx.session.total,1);
  }
 }

 // The shared preview path (used by both answer surfaces) never rescores and
 // uses the stored timbre. Stopped review honors a newly chosen fixed sound.
 {
  const ctx=fixture();setRP(ctx);let marked=0;
  await ctx.previewNotes([60,65],()=>marked++,()=>true);
  expectSound(ctx,[60,65],'piano');assert.equal(marked,1);assert.equal(ctx.session.total,0);
  assert.equal(ctx.session.reviewPaused,true);
  ctx.summarySession={mode:'interval',timbre:'mixed',rows:[{timbre:'piano'}]};
  ctx.testActive=false;ctx.session=null;ctx.trial=null;
  assert.equal(ctx.auditionSound(),'piano');ctx.cfg.timbre='violin';
  assert.equal(ctx.auditionSound(),'violin');
 }

 // Pending free-play loads cannot emit stale notes or clear a newer pending
 // request for the same pitch after a sound change/cancellation.
 {
  const ctx=fixture();ctx.testActive=false;ctx.mode='free';ctx.cfg.timbre='piano';
  const old=deferred(),fresh=deferred();let loads=0;
  ctx.ensureAudio=()=>++loads===1?old.promise:fresh.promise;
  ctx.freePlay(60,'old');ctx.cancelAudio();ctx.activePointers.clear();
  ctx.cfg.timbre='violin';ctx.freePlay(60,'fresh');
  old.resolve();await flush();assert.equal(ctx.freeVoices.length,0);assert.equal(ctx.pendingVoices.size,1);
  fresh.resolve();await flush();assert.deepEqual(plain(ctx.freeVoices),[{sound:'violin',midi:60}]);
 }

 // Settings preview intersects selected names/octaves with real instrument
 // limits. No fictitious F8/F6 or C0 can be introduced by an octave selector.
 for(const instrument of ['piano','violin']){
  const ctx=fixture(instrument);ctx.cfg.known=[0,5];ctx.cfg.octaves=instrument==='piano'?[0,8]:[6];
  assert.deepEqual(plain(ctx.selectedPreviewPitches()),instrument==='piano'?[108]:[84]);
  ctx.cfg.known=[5];assert.deepEqual(plain(ctx.selectedPreviewPitches()),[]);
 }

 // One click emits exactly the clicked pitch. Arbitrary order and repeated
 // pitches work; unselected pitches and calls without a pitch do not play.
 for(const instrument of ['piano','violin']){
  const ctx=fixture(instrument);ctx.testActive=false;ctx.cfg.known=[4,5];let count=0;
  ctx.U.drawTimbre=choice=>{assert.equal(choice,'mixed');return count++%2?'violin':'piano';};
  for(const midi of [77,64,77,76,65])await ctx.previewSelection(midi);
  assert.deepEqual(plain(ctx.queued),[77,64,77,76,65].map((midi,i)=>({midi,sound:i%2?'violin':'piano'})));
  for(const midi of [undefined,67,89,20])await ctx.previewSelection(midi);
  assert.equal(ctx.queued.length,5);assert.equal(ctx.selectionPreview,null);assert.equal(ctx.session.total,0);
  ctx.testActive=true;await ctx.previewSelection(77);assert.equal(ctx.queued.length,5);
 }
 // Rapid clicks while audio is loading: only the latest request can sound.
 {
  const ctx=fixture();ctx.testActive=false;ctx.cfg.known=[4,5];
  const old=deferred(),fresh=deferred();let loads=0;
  ctx.ensureAudio=()=>++loads===1?old.promise:fresh.promise;
  const first=ctx.previewSelection(64),second=ctx.previewSelection(77);
  old.resolve();await first;assert.equal(ctx.queued.length,0);assert.equal(ctx.selectionPreview.midi,77);
  fresh.resolve();await second;assert.equal(ctx.queued.length,1);assert.equal(ctx.queued[0].midi,77);
 }

 // Cancelling while audio is still resuming/decoding must prevent any later
 // sound from both kinds of preview, including selection-label callbacks.
 for(const kind of ['selection','review']){
  const ctx=fixture();const gate=deferred();ctx.ensureAudio=()=>gate.promise;let marked=0;
  let task;
  if(kind==='selection'){ctx.testActive=false;task=ctx.previewSelection(65);assert(ctx.selectionPreview);}
  else task=ctx.previewNotes([65],()=>marked++,()=>true);
  ctx.cancelAudio();gate.resolve();await task;
  assert.equal(ctx.queued.length,0);assert.equal(marked,0);assert.equal(ctx.selectionPreview,null);
 }
 console.log('PASS production controller sound routing: per-question timbre, sample identity, AP masks, replay/feedback/review, stopped override, stale free-play load, playable selected notes, async preview cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
