const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const ctx=vm.createContext({console});ctx.window=ctx;ctx.globalThis=ctx;
for(const f of ['training-core.js','ap-science.js','ap-focus-model.js','unified-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx);
const U=ctx.UnifiedModel;
for(const [lo,hi] of Object.values(U.limits))for(let current=lo;current<=hi;current++){
 for(let pc=0;pc<12;pc++){const n=U.apReviewPitch(current,'name',pc,lo,hi);assert(n>=lo&&n<=hi);assert.equal(n%12,pc);if(12*(U.octave(current)+1)+pc>=lo&&12*(U.octave(current)+1)+pc<=hi)assert.equal(U.octave(n),U.octave(current));}
 for(let o=0;o<=8;o++){const n=U.apReviewPitch(current,'octave',o,lo,hi);if(o<U.octave(lo)||o>U.octave(hi)){assert.equal(n,null);continue;}assert(n>=lo&&n<=hi);assert.equal(U.octave(n),o);const exact=12*(o+1)+current%12;if(exact>=lo&&exact<=hi)assert.equal(n,exact);}
 for(const sign of [-1,1])for(let d=1;d<=hi-lo;d++){const pair=U.rpReviewPair(current,current+sign,d,lo,hi);assert(pair.every(m=>m>=lo&&m<=hi));assert.equal(pair[1]-pair[0],sign*d);if(current+sign*d>=lo&&current+sign*d<=hi)assert.equal(pair[0],current);}
}
assert.equal(U.rpReviewPair(60,65,88,21,108),null);
assert.equal(U.apReviewPitch(65,'octave',8,55,88),null);
console.log('PASS review pitch and interval bounds, direction, preservation of playable reference and pitch class');
