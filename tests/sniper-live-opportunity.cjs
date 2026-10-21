const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(
 fs.readFileSync('lib/sniper-live-opportunity.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
 }).outputText,{module:mod,exports:mod.exports});
const run=mod.exports.assessSniperLiveOpportunity;
const start=Date.parse('2026-10-21T10:00:00Z');
const base=Array.from({length:60},(_,i)=>{
 const close=100+Math.sin(i*.56)*.025;
 return {time:start+i*60000,open:close+.015,close,
 high:close+.16,low:close-.16};
});
const sell=[...base];
sell[59]={time:base[59].time,open:100.03,high:100.08,low:98.51,close:98.60};
function five(c1){const out=[];for(let i=0;i+5<=c1.length;i+=5){
 const rows=c1.slice(i,i+5);out.push({time:rows[0].time,
 open:rows[0].open,close:rows.at(-1).close,
 high:Math.max(...rows.map(x=>x.high)),low:Math.min(...rows.map(x=>x.low))});
}return out;}
const now=start+60*60000+2000;
const watch={ready:true,upper:[{price:101.5}],lower:[
 {price:99.2},{price:98.1},{price:96.5}]};
const data={now,price:98.4,sourceReady:true,c1:sell,c5:five(sell),watch};
const result=run(data);
assert.equal(result.phase,'BREAK_CONFIRMED');
assert.equal(result.side,'SELL');
assert.ok(result.trigger>result.targets[0]);
assert.equal(result.targets[0],98.1,'only levels ahead of actual LIVE price');
assert.equal(result.tradeEligible,false,'movement detection never authorizes trading');
assert.ok(result.sourceAt<=now);
assert.equal(result.higherFrame,'ALIGNED');
const future={time:now-1000,open:98.4,high:160,low:40,close:50};
const withPartial=run({...data,c1:[...sell,future]});
assert.equal(withPartial.phase,result.phase,'unfinished M1 ignored');
assert.equal(withPartial.trigger,result.trigger);
assert.equal(run({...data,sourceReady:false}).phase,'OFFLINE');
assert.equal(run({...data,now:now+250000}).phase,'OFFLINE','stale M1 cannot confirm fresh break');
assert.equal(run({...data,c1:sell.filter((_,i)=>i!==48)}).phase,'OFFLINE','gapped M1 is rejected');
assert.equal(run({...data,price:100.50}).phase,'CANCELLED','reclaimed range cancels break');
const noTarget=run({...data,price:94.0});
assert.equal(noTarget.phase,'BREAK_CONFIRMED','do not hide real displacement because target unavailable');
assert.equal(noTarget.targets.length,0,'do not invent future TP levels');
assert.match(noTarget.targetNote,/لا يوجد هدف/);
const pre=run({...data,c1:base,c5:five(base),price:99.9,
 preMove:{ok:true,stage:'ARMED',side:'SELL',sourceAt:now-15000,
 trigger:99.7,invalidation:100.5,readiness:62}});
assert.equal(pre.phase,'PREPARE');
assert.equal(pre.side,'SELL');
assert.equal(pre.tradeEligible,false);
const testing=run({...data,c1:base,c5:five(base),price:99.5,
 preMove:{ok:true,stage:'ARMED',side:'SELL',sourceAt:now-15000,
 trigger:99.7,invalidation:100.5,readiness:62}});
assert.equal(testing.phase,'TESTING','unclosed break stays provisional');
console.log('PASS: live movement M1 breakout, early pre-move, future-bar exclusion, missing targets, reversal and stale feed');
