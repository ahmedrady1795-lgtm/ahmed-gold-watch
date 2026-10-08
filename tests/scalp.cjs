const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const modules={};
function load(file){
  file=path.resolve(file);if(modules[file])return modules[file];
  const exports={};modules[file]=exports;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),globalThis:{},console});
  return exports;
}
const {buildScalpPlans}=load('lib/scalp-opportunities.ts');
const {advancePaperTrade,updateScalpLedger}=load('lib/scalp-paper-ledger.ts');
const now=Date.parse('2026-10-08T01:30:00Z');
const series=(ms)=>Array.from({length:240},(_,i)=>({time:now-(240-i)*ms,open:4000,high:4000.4,low:3999.6,close:4000}));
function input(){return {asset:'GOLD',c1:series(60000),c5:series(300000),quote:{price:4000.45,at:now,bid:4000.44,ask:4000.455,source:'Biquote'},candleSource:'Biquote XAUUSD',now,events:[],newsReady:true,marketOpen:true,feeBps:0,slippageBps:0};}
function breakout(){const x=input();x.c1[x.c1.length-1]={time:now-60000,open:4000,high:4000.55,low:3999.9,close:4000.45};return x;}
const plans=buildScalpPlans(breakout());
const buy=plans[0];assert.equal(buy.side,'BUY');assert.equal(buy.status,'ARMED');
assert.ok(buy.entry>4000.45);assert.ok(buy.stop<buy.entry);assert.ok(buy.targets[0].price>buy.entry);assert.ok(buy.targets[1].price>buy.targets[0].price);assert.ok(buy.targets[2].price>buy.targets[1].price);assert.ok(buy.netRR>=1.25);
const reflected=breakout();reflected.c1=reflected.c1.map(c=>({...c,open:8000-c.open,close:8000-c.close,high:8000-c.low,low:8000-c.high}));reflected.quote={...reflected.quote,price:3999.55,bid:3999.54,ask:3999.555};
const sell=buildScalpPlans(reflected)[0];assert.equal(sell.side,'SELL');assert.ok(sell.stop>sell.entry);assert.ok(sell.targets[2].price<sell.targets[1].price&&sell.targets[1].price<sell.targets[0].price);
assert.equal(buildScalpPlans(input())[0].side,'WAIT','Flat market must not invent an opportunity');
for(const change of [x=>x.quote.at=now-16000,x=>x.quote.price=null,x=>x.marketOpen=false,x=>x.candleSource='COMEX GC=F proxy',x=>x.c1.splice(-5,1),x=>x.c1.push({...x.c1.at(-1),time:now+60000}),x=>x.c1.at(-1).high=NaN,x=>x.events=[{importance:3,exactTime:true,time:now+60000,name:'CPI'}]]){
 const x=breakout();change(x);assert.equal(buildScalpPlans(x)[0].status,'BLOCKED');
}
const forming=breakout();forming.c1.push({time:now,open:4000.45,high:4010,low:3990,close:4009});assert.equal(buildScalpPlans(forming)[0].id,buy.id,'Unclosed candles cannot alter the setup');
const fees=breakout();fees.feeBps=100;assert.equal(buildScalpPlans(fees)[0].status,'WATCH','Large costs must block entry');
const unknownNews=breakout();unknownNews.newsReady=false;assert.equal(buildScalpPlans(unknownNews)[0].status,'WATCH');
function trade(){return {plan:{...buy,entry:100,stop:99,targets:[{price:102,kind:'STRUCTURE'}],cost:.1,expiresAt:now+45000},state:'ARMED',activatedAt:null,closedAt:null,exit:null,netR:null,lastAt:now,lastPrice:99.9,note:''};}
const quote=(price,at)=>({price,at,source:'fixture'});
const activated=advancePaperTrade(trade(),quote(100.1,now+1000),now+1000,[]);assert.equal(activated.state,'ACTIVE');assert.equal(activated.plan.targets[0].price,102);
const winner=advancePaperTrade(activated,quote(102.1,now+2000),now+2000,[]);assert.equal(winner.state,'TP1');assert.equal(winner.netR,1.727);
const loser=advancePaperTrade(activated,quote(98.8,now+2000),now+2000,[]);assert.equal(loser.state,'STOP');assert.ok(loser.netR<-1,'Stop slippage must worsen the result');
assert.equal(advancePaperTrade(trade(),quote(100.1,now+46000),now+46000,[]).state,'EXPIRED','Cannot activate after the deadline');
assert.equal(advancePaperTrade(trade(),quote(98.9,now+1000),now+1000,[]).state,'CANCELED');
assert.equal(advancePaperTrade(trade(),quote(100.7,now+1000),now+1000,[]).state,'CANCELED','Do not assume a fill after a gap past the trigger');
assert.equal(advancePaperTrade(activated,quote(102.1,now+40000),now+40000,[]).state,'UNKNOWN','Missed monitoring must not manufacture wins');
assert.equal(advancePaperTrade(activated,quote(102.1,now+2000),now+30000,[]).state,'ACTIVE','Stale quotes cannot settle');
const ambiguous={...activated,activatedAt:now,lastAt:now,lastPrice:100};const bar={time:now,open:100,close:101,high:103,low:98};
assert.equal(advancePaperTrade(ambiguous,quote(101,now+61000),now+61000,[bar]).state,'STOP','If target and stop share a bar, use stop first');
const frozen=updateScalpLedger('GOLD',[buy],breakout().quote,now,breakout().c1);const changed={...buy,entry:buy.entry+10,targets:[{price:9999,kind:'PROJECTION'}]};
const repeated=updateScalpLedger('GOLD',[changed],quote(4000.45,now+1000),now+1000,breakout().c1);assert.equal(repeated.lanes[0].current.plan.entry,frozen.lanes[0].current.plan.entry);assert.equal(repeated.lanes[0].stats.samples,0,'Unactivated setups do not count as trades');
console.log('PASS: 27 scalp checks: buy/sell geometry, closed bars, bad data, costs, news, expiry, activation, frozen levels, stop slippage and conservative outcomes. Profitability is not established.');

// Optional chronological replay of real OHLC; same parameters for all bars, no tuning.
// Only next-bar opens can enter. Full next-bar ranges settle with stop-first priority.
if(process.argv[2]){
 const dataset=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(const d of dataset){
  for(const horizon of [1,5]){
   const trades=[];let cooldown=0,signals=0;
   for(let k=60;k<d.c1.length-horizon-1;k++){
    const closed=d.c1[k],at=closed.time+60000;if(at<cooldown)continue;
    const available5=d.c5.filter(c=>c.time+300000<=at);if(available5.length<60)continue;
    const plan=buildScalpPlans({asset:d.asset,c1:d.c1.slice(0,k+1),c5:available5,quote:{price:closed.close,at,bid:closed.close-d.spread/2,ask:closed.close+d.spread/2,source:'historical'},candleSource:d.source,now:at,events:[],newsReady:true,marketOpen:true,feeBps:d.feeBps,slippageBps:d.slippageBps}).find(p=>p.horizon===horizon);
    if(plan.status!=='ARMED')continue;signals++;
    const next=d.c1[k+1],dir=plan.side==='BUY'?1:-1;
    if(dir*(next.open-plan.entry)>Math.abs(plan.entry-plan.stop)*.3)continue;
    // Entry and stop/target within the trigger bar have unknown order; conservative skip.
    if(!(dir===1?next.high>=plan.entry:next.low<=plan.entry))continue;
    const touchedStop=dir===1?next.low<=plan.stop:next.high>=plan.stop;
    const touchedTarget=dir===1?next.high>=plan.targets[0].price:next.low<=plan.targets[0].price;
    let exit=null,exitAt=next.time+60000;
    if(touchedStop)exit=plan.stop;
    else if(touchedTarget)continue; // A TP in the trigger bar could precede entry; never claim it.
    for(let j=1;exit==null&&j<=horizon;j++){
     const c=d.c1[k+1+j];if(!c)break;
     const stop=dir===1?c.low<=plan.stop:c.high>=plan.stop,hit=dir===1?c.high>=plan.targets[0].price:c.low<=plan.targets[0].price;
     if(stop||hit||j===horizon){exit=stop?plan.stop:hit?plan.targets[0].price:c.close;exitAt=c.time+60000;}
    }
    if(exit!=null){trades.push((dir*(exit-plan.entry)-plan.cost)/(Math.abs(plan.entry-plan.stop)+plan.cost));cooldown=exitAt;}
   }
   console.log(JSON.stringify({asset:d.asset,horizon,bars:d.c1.length,armedSetups:signals,trades:trades.length,winRate:trades.length?round(trades.filter(r=>r>0).length/trades.length*100):null,netR:round(trades.reduce((s,r)=>s+r,0)),expectancyR:trades.length?round(trades.reduce((s,r)=>s+r,0)/trades.length):null,note:'Small OHLC replay, assumed costs, unknown intrabar order; not proof of future profit.'}));
  }
 }
}
function round(n){return Math.round(n*1000)/1000;}
