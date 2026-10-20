const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const load=(path)=>{
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText,{module,exports:module.exports});
 return module.exports;
};
const {validateFrozenM15Snapshot,FROZEN_M15_HORIZON}=load('lib/sniper-m15-snapshot.ts');
const {frozenM15Decision,retainM15Snapshot}=load('lib/sniper-m15-freeze.ts');
const M15=900000,anchorTime=Date.parse('2026-10-20T09:00:00Z');
const scenario={
 ready:true,origin:'RECENT_M15',archiveYears:0,sourceBars:100,reason:'analogue',
 stopped:false,atr:1,touches:[],bars:Array.from({length:12},(_,i)=>({
   step:i+1,open:100-i,close:99-i,high:100.5-i,low:98.5-i,
   source:'HISTORICAL_ANALOGUE'
 }))
};
const frozen={asset:'GOLD',source:'Biquote',side:'SELL',closedTime:anchorTime-M15,
 anchorTime,createdAt:anchorTime+180000,stop:105,goals:[{stage:1,price:96}],
 scenario,reactions:{bands:[],marks:[]}};
const args={asset:'GOLD',source:'Biquote',now:anchorTime+20*60000};
assert.ok(validateFrozenM15Snapshot(frozen,args));
assert.equal(validateFrozenM15Snapshot(frozen,{...args,source:'Coinbase'}),null);
assert.equal(validateFrozenM15Snapshot(frozen,{...args,asset:'BTC'}),null);
assert.equal(validateFrozenM15Snapshot(frozen,{...args,
 now:anchorTime+FROZEN_M15_HORIZON}),null,'expired route must not revive');
assert.equal(validateFrozenM15Snapshot({...frozen,createdAt:anchorTime-1},args),null,
 'cannot issue a prediction before its authentic partial M15 starts');
assert.equal(validateFrozenM15Snapshot({...frozen,scenario:{...scenario,
 bars:scenario.bars.map((b,i)=>i===4?{...b,open:200}:b)}},args),null,
 'damaged contiguous candle chain cannot be restored');
const gate={old:frozen,asset:'GOLD',closedTime:anchorTime+M15,
 quote:100,fresh:true,marketOpen:true,now:anchorTime+2*M15+1000};
assert.equal(frozenM15Decision(gate),'HOLD',
 'new M15 close MUST NOT resample the original next-candle forecast');
assert.equal(frozenM15Decision({...gate,closedTime:anchorTime+8*M15,
 now:anchorTime+9*M15}),'HOLD','do not repaint at eighth M15');
assert.equal(frozenM15Decision({...gate,closedTime:anchorTime+11*M15,
 now:anchorTime+12*M15+1000}),'REBUILD','route expires after 12 future M15');
assert.equal(frozenM15Decision({...gate,quote:105}),'CLEAR',
 'stop breach immediately cancels without inventing a successful new route');
assert.equal(retainM15Snapshot('HOLD',frozen,'GOLD',anchorTime+10*M15),true);
assert.equal(retainM15Snapshot('REBUILD',frozen,'GOLD',anchorTime+12*M15+1),false);
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panel,/localStorage\.getItem\(persistenceKey\)/);
assert.match(panel,/localStorage\.setItem\(persistenceKey,JSON\.stringify\(frozen\)\)/);
assert.match(panel,/validateFrozenM15Snapshot/);
assert.match(panel,/steps:12/,'only a fixed three-hour analogue may be issued');
assert.match(panel,/scenario\.bars\.slice\(elapsedSteps,12\)/);
assert.match(panel,/m\.step>elapsedSteps/,'remaining bounce events share original timestamps');
assert.match(panel,/restoredKey!==persistenceScope/,'must restore before issuing');
assert.match(panel,/id="sniper-performance"/,'working results navigation anchor');
assert.match(panel,/sniper-m15-results-overlay/);
assert.match(panel,/SniperPerformance title="نتائج الأهداف/);
assert.match(panel,/audit\.metrics\[asset\]/,'scorecard must use actual server outcomes');
assert.match(panel,/evaluateM15ForwardProof\(record,actual,now\)/);
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(css,/height:clamp\(550px,calc\(100dvh - 148px\),955px\)!important/);
console.log('PASS: original M15 snapshots survive reload and interim closes without resampling; expiry/stop/source guards, real target scoreboard, enlarged mobile chart');
