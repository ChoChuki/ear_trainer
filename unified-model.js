/* One sampler per task, independent of the answer interface. No fixed blocks or quotas. */
(function(root){
'use strict';
const octave=m=>Math.floor(m/12)-1;
const limits={piano:[21,108],violin:[55,88]};
const range=(lo,hi)=>Array.from({length:Math.max(0,hi-lo+1)},(_,i)=>lo+i);
const names=APFocusModel.notes;
const choose=TrainingCore.choose;
// A mixed question keeps one sampled timbre for its entire lifetime.
function drawTimbre(mode,rng=Math.random){return mode==='mixed'?(rng()<.5?'piano':'violin'):mode;}
function pitches(instrument,octaves){const [lo,hi]=limits[instrument];return range(lo,hi).filter(p=>octaves.includes(octave(p)));}
function apPoolValid(pool,known){const pcs=new Set(pool.map(p=>p%12));return pcs.size>=2&&known.length>0&&known.every(pc=>pcs.has(pc));}
function drawAP(pool,known,previous,recent=[],blind=false,label=null){
 const names=[...new Set(pool.map(m=>m%12))];
 let legal=names.filter(pc=>!TrainingCore.sameNoteName(pc,previous));
 const withoutLabel=legal.filter(pc=>!TrainingCore.sameNoteName(pc,label));
 if(withoutLabel.length)legal=withoutLabel;
 if(!legal.length)return null;
 const target=legal.filter(pc=>known.includes(pc)), foil=legal.filter(pc=>!known.includes(pc));
 let pc;
 const history=[...recent].reverse();
 const anti=pc=>{const age=history.findIndex(m=>m%12===pc);return age===1?.35:age===2||age===3?.8:1;};
 if(blind){pc=choose(legal,legal.map(()=>1));}
 else{
  const share=known.length===1?.38:known.length===2?.60:.75;
  const group=target.length&&foil.length?(Math.random()<share?target:foil):(target.length?target:foil);
  pc=choose(group,group.map(n=>{const proximity=known.includes(n)?1:Math.min(...known.map(k=>APPitchScience.chromaDistance(n,k)))===1?2:1;return proximity*anti(n);}));
 }
 return APFocusModel.pickMidi(pc,pool,previous,known,null,{active:!blind,blind,recent,avoid:label});
}
function rpGroups(lo,hi,min,max,direction,previous=null){
 const groups=[];
 for(const distance of range(min,Math.min(max??hi-lo,hi-lo))){
  for(const dir of direction==='both'?['higher','lower']:[direction]){
   const signed=dir==='higher'?distance:-distance;
   const refs=range(lo+(signed<0?distance:0),hi-(signed>0?distance:0)).filter(r=>!TrainingCore.sameNoteName(r+signed,previous?.target));
   if(refs.length)groups.push({distance,direction:dir,signed,refs});
  }
 }
 return groups;
}
function rpPoolValid(groups){return new Set(groups.flatMap(g=>g.refs.map(r=>(r+g.signed)%12))).size>=2;}
function drawRP(groups,previous){if(!groups.length)return null;const old=previous?.reference==null?null:Math.abs(previous.target-previous.reference);
 const group=choose(groups,groups.map(g=>g.distance===old ? .55 : 1));const reference=choose(group.refs);return {reference,target:reference+group.signed,size:group.distance,direction:group.direction};}
function gradeAP(target,guess,guessOctave,known){const correct=TrainingCore.matchesLearningSet(target%12,guess,known,0,11);
 return {correct,octaveCorrect:known.includes(target%12)&&guess===target%12&&Number.isInteger(guessOctave)?guessOctave===octave(target):null};}
// Review is independent of the question pool: choose real pitches only.
function apReviewPitch(current,kind,value,lo,hi){
 const desired=kind==='name'?12*(octave(current)+1)+value:12*(value+1)+current%12;
 const candidates=range(lo,hi).filter(m=>kind==='name'?m%12===value:octave(m)===value);
 return candidates.reduce((best,m)=>best===null||Math.abs(m-desired)<Math.abs(best-desired)?m:best,null);
}
function rpReviewPair(reference,target,distance,lo,hi){
 if(!Number.isInteger(distance)||distance<1||distance>hi-lo)return null;
 const signed=target<reference?-distance:distance;
 const r=Math.max(lo+Math.max(0,-signed),Math.min(hi-Math.max(0,signed),reference));
 return [r,r+signed];
}
root.UnifiedModel={octave,limits,range,names,pitches,apPoolValid,drawAP,rpGroups,rpPoolValid,drawRP,gradeAP,apReviewPitch,rpReviewPair,drawTimbre};
})(typeof window==='undefined'?globalThis:window);
