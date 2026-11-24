const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/local-candle-ml.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex});
const run=ex.localCandleMl,now=1800000000000;
const rows=Array.from({length:300},(_,i)=>{
 const close=100+Math.sin(i*.31)*.4+i*.005;
 return {time:now-(300-i)*60000,open:close-.01,close,high:close+.04,low:close-.04};
});
const result=run('GOLD:source',rows,now,true);
assert.equal(result.asOf,now);
assert.equal(result.m1.validationCount,60);
assert.equal(result.m5.validationCount,60);
assert.equal(result.tradeAuthorized,false);
const future={time:now,open:100,close:105,high:106,low:99};
assert.equal(run('GOLD:source',[...rows,future],now,true),result,'forming candle excluded from training and prediction');
assert.equal(run('GOLD:source',rows,now+180000,true).asOf,null);
assert.equal(run('GOLD:source',rows,now,false).m1.side,'WAIT');
assert.equal(run('GOLD:source',rows.slice(-50),now,true).m5.status,'INSUFFICIENT');
assert.equal(run('BTC:source',[...rows,{...rows[200],close:rows[200].close+.01}],now,true).asOf,null);
const gapped=rows.filter((_,i)=>i!==295);
assert.equal(run('GOLD:source',gapped,now,true).m1.side,'WAIT');
assert.equal(run('BTC:source',rows,now,true).tradeAuthorized,false);
console.log('PASS local chronological candle model, validation, closed-bar integrity, source isolation and no trade authorization');

for(const h of ['neuralM1','neuralM5']){
 assert.equal(result[h].validationCount,60);
 assert.ok(Number.isFinite(result[h].rawScore)&&result[h].rawScore>=0&&result[h].rawScore<=1);
 assert.equal(run('GOLD:source',rows,now,false)[h].side,'WAIT');
 assert.equal(run('GOLD:source',gapped,now,true)[h].side,'WAIT');
 assert.equal(run('GOLD:source',rows,now+180000,true)[h].status,'INSUFFICIENT');
}
console.log('PASS local nonlinear neural model, historical validation and no stale inference');
