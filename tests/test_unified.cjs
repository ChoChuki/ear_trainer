const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const ctx=vm.createContext({console});ctx.window=ctx;ctx.globalThis=ctx;
for(const f of ['training-core.js','ap-science.js','ap-focus-model.js','unified-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
const U=ctx.UnifiedModel;
assert.equal(U.pitches('piano',U.range(0,8)).length,88);assert.equal(U.pitches('violin',U.range(3,6)).length,34);
assert(!U.apPoolValid([108],[0]));assert(!U.apPoolValid([21,22,23],[0]));
for(const inst of ['piano','violin'])for(const known of [[5],[4,5],[0,1,2,3,4,5,6,7,8,9,10,11]])for(const blind of [true,false]){
 const pool=U.pitches(inst,[4,5]),seen=new Set();let recent=[],p;
 for(let i=0;i<10000;i++){const q=U.drawAP(pool,known,p,recent,blind);assert(pool.includes(q));if(p!=null)assert.notEqual(q%12,p%12);p=q;recent.push(q);if(recent.length>4)recent.shift();seen.add(q);}assert.equal(seen.size,pool.length);
}
let recent=[],count=0,target=0,aba=0,abab=0;const pool=U.pitches('piano',[4,5]);
for(let i=0;i<120000;i++){const p=U.drawAP(pool,[4,5],recent.at(-1),recent);if(p===recent.at(-2))count++;if([4,5].includes(p%12))target++;recent.push(p);if(recent.length>=4&&recent.at(-1)===recent.at(-3)&&recent.at(-2)===recent.at(-4))aba++;if(recent.length>=6&&recent.at(-1)===recent.at(-3)&&recent.at(-3)===recent.at(-5)&&recent.at(-2)===recent.at(-4)&&recent.at(-4)===recent.at(-6))abab++;if(recent.length>6)recent.shift();}
assert(count/120000<.09);assert(aba/120000<.015);assert(abab/120000<.002);assert(Math.abs(target/120000-.60)<.015);
console.log('E/F octaves 4/5: target share',target/120000,'same pitch 2 back',count/120000,'ABAB',aba/120000,'ABABAB',abab/120000);
for(const [instrument,[lo,hi]] of Object.entries(U.limits))for(const direction of ['higher','lower','both']){
 for(const [min,max] of [[1,12],[5,7],[7,7],[1,null],[hi-lo,hi-lo]]){
 let previous=null;const seen=new Set();for(let i=0;i<1000;i++){const groups=U.rpGroups(lo,hi,min,max,direction,previous);if(!groups.length){assert.equal(min,hi-lo);assert.notEqual(direction,'both');break;}const q=U.drawRP(groups,previous);assert(q.reference>=lo&&q.reference<=hi&&q.target>=lo&&q.target<=hi);assert(q.size>=min&&q.size<=(max??hi-lo));assert.equal(q.size,Math.abs(q.target-q.reference));if(direction==='higher')assert(q.target>q.reference);if(direction==='lower')assert(q.target<q.reference);if(previous)assert.notEqual(q.target%12,previous.target%12);seen.add(q.size);previous=q;}assert(seen.size>0);
 }
}
assert.equal(U.gradeAP(67,9,null,[4,5]).correct,true);assert.equal(U.gradeAP(67,'out',null,[4,5]).correct,true);assert.equal(U.gradeAP(67,4,4,[4,5]).correct,false);assert.equal(U.gradeAP(64,4,5,[4,5]).correct,true);assert.equal(U.gradeAP(64,4,5,[4,5]).octaveCorrect,false);assert.equal(U.gradeAP(64,4,4,[4,5]).octaveCorrect,true);assert.equal(U.gradeAP(64,'out',null,[4,5]).correct,false);assert.equal(U.gradeAP(67,'unsure',null,[4,5]).correct,false);
console.log('PASS unified model: playable range, weighted unlimited AP, no adjacent pitch name, E/F cycle suppression, RP ranges/directions, and intentional Other grading');

assert(!U.rpPoolValid(U.rpGroups(21,108,87,87,"higher")));assert(U.rpPoolValid(U.rpGroups(21,108,5,7,"both")));
