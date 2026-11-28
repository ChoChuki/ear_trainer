const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const ctx=vm.createContext({console});ctx.window=ctx;ctx.globalThis=ctx;
for(const f of ['training-core.js','ap-science.js','ap-focus-model.js','unified-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
const U=ctx.UnifiedModel;
for(const [lo,hi] of Object.values(U.limits))for(let current=lo;current<=hi;current++){
 for(const sign of [-1,1])for(let d=1;d<=hi-lo;d++){const pair=U.rpReviewPair(current,current+sign,d,lo,hi);assert(pair.every(m=>m>=lo&&m<=hi));assert.equal(pair[1]-pair[0],sign*d);if(current+sign*d>=lo&&current+sign*d<=hi)assert.equal(pair[0],current);}
}
assert.equal(U.rpReviewPair(60,65,88,21,108),null);
for(const [lo,hi] of Object.values(U.limits)){
 for(let pc=0;pc<12;pc++)for(let o=0;o<=8;o++){
  const exact=12*(o+1)+pc;
  assert.equal(U.apReviewPitch(pc,o,lo,hi),exact>=lo&&exact<=hi?exact:null);
 }
 for(const [pc,o] of [[null,4],[4,null],[undefined,4],[4,undefined],[-1,4],[12,4],[4,9],[4,-1],[4,4.5]])assert.equal(U.apReviewPitch(pc,o,lo,hi),null);
}
console.log('PASS exact AP review pairs (no implicit or substituted pitch), RP bounds and direction');
