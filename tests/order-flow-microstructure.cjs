const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/order-flow-microstructure.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const {inspectL2Book,assessL2Persistence}=mod.exports;
const base=Date.parse('2026-10-20T12:00:00.000Z');
function book(at,bidScale=1,askScale=1){
 const bids=Array.from({length:12},(_,i)=>[99999-i*.5,(i===2?6:1)*bidScale]);
 const asks=Array.from({length:12},(_,i)=>[100001+i*.5,(i===2?6:1)*askScale]);
 return inspectL2Book({bids,asks,at});
}
const sample=book(base);assert.ok(sample);
assert.equal(sample.bid,99999);assert.equal(sample.ask,100001);
assert.ok(sample.bidWallPrice!=null&&sample.askWallPrice!=null);
assert.equal(inspectL2Book({bids:[[101,1]],asks:[[100,1]],at:base}),null);
assert.equal(inspectL2Book({bids:[[100,1]],asks:[[100.5,1]],at:base}),null,
 'insufficient depth cannot be used as a clean L2 book');
const hist=[0,2,4,6,8].map(s=>book(base+s*1000));
const ready=assessL2Persistence({snapshots:hist,now:base+8000,executed:[]});
assert.equal(ready.status,'OBSERVING');
assert.equal(ready.ready,true);
assert.ok(ready.bidPersistent&&ready.askPersistent,'unchanged level observed across real snapshots');
assert.equal(ready.actionable,false);
const pulled=[...hist,book(base+10000,.20,1),book(base+12000,.18,1)];
const watch=assessL2Persistence({snapshots:pulled,now:base+12000,executed:[]});
assert.equal(watch.status,'POSSIBLE_PULL');
assert.equal(watch.possibleBidPull,true);
assert.equal(watch.possibleAskPull,false);
assert.equal(watch.actionable,false);
const filled=assessL2Persistence({snapshots:pulled,now:base+12000,executed:[
 {at:base+9000,price:99999,size:20,aggressor:'SELL'}
]});
assert.equal(filled.possibleBidPull,false,'matching executed sells can explain bid-depth disappearance');
const sellTape=Array.from({length:10},(_,i)=>({
 at:base+3000+i*700,price:99999,size:.20,aggressor:'SELL'
}));
const sells=sellTape.filter(t=>t.at<=base+8000);
const defendedBuy=assessL2Persistence({snapshots:hist,
 now:base+8000,executed:sells});
assert.equal(defendedBuy.possibleBidAbsorption,true,
 'actual aggressive sells with a strong unbroken BID wall and flat price');
assert.equal(defendedBuy.possibleAskAbsorption,false);
assert.equal(defendedBuy.status,'POSSIBLE_ABSORPTION');
assert.ok(defendedBuy.executedSellUsd>=75000);
assert.equal(defendedBuy.actionable,false);
const buyTape=sellTape.map(t=>({...t,aggressor:'BUY'}));
const defendedSell=assessL2Persistence({snapshots:hist,now:base+8000,
 executed:buyTape.filter(t=>t.at<=base+8000)});
assert.equal(defendedSell.possibleAskAbsorption,true);
const tiny=assessL2Persistence({snapshots:hist,now:base+8000,
 executed:sellTape.map(t=>({...t,size:.0002}))});
assert.equal(tiny.possibleBidAbsorption,false,
 'many small prints are not meaningful aggressive USD execution');
const mixed=assessL2Persistence({snapshots:hist,now:base+8000,
 executed:[...sells,...buyTape.filter(t=>t.at<=base+8000)]});
assert.equal(mixed.possibleBidAbsorption,false,
 'balanced buying and selling cannot masquerade as bid absorption');
const futureFills=assessL2Persistence({snapshots:hist,now:base+8000,
 executed:sellTape.map(t=>({...t,at:base+15000}))});
assert.equal(futureFills.possibleBidAbsorption,false,
 'future prints cannot qualify a causally observed footprint');
const vanished=assessL2Persistence({snapshots:pulled,now:base+12000,
 executed:sellTape.map(t=>({...t,at:base+7000}))});
assert.equal(vanished.possibleBidAbsorption,false,
 'a vanished bid wall cannot be called a bid-side absorber');
// Strong best-queue imbalance must persist for 4 actual L2 snapshots.
// It does NOT claim the identities of the liquidity providers and never
// implies an M15 forecast or a trade signal.
function skewBook(at,bidBestSize=1,askBestSize=1){
 const bids=Array.from({length:12},(_,i)=>[99999-i*.5,i===0?bidBestSize:i===2?6:1]);
 const asks=Array.from({length:12},(_,i)=>[100001+i*.5,i===0?askBestSize:i===2?6:1]);
 return inspectL2Book({bids,asks,at});
}
const stackedBid=[0,2,4,6,8].map(i=>skewBook(base+i*1000,12,1));
const queuedBuy=assessL2Persistence({snapshots:stackedBid,now:base+8000});
assert.equal(queuedBuy.ready,true);
assert.equal(queuedBuy.buyQueuePressure,true,'large persistent best bid queue should register as tentative short-term pressure');
assert.equal(queuedBuy.sellQueuePressure,false);
assert.equal(queuedBuy.status,'POSSIBLE_QUEUE_PRESSURE');
assert.ok(queuedBuy.bestQueueImbalancePct>58);
assert.ok(queuedBuy.microprice>(sample.ask+sample.bid)/2,
 'weighted microprice shifts towards ask with larger best bid queue');
assert.equal(queuedBuy.actionable,false,'queue pressure is NEVER permission to trade');
const stackedAsk=[0,2,4,6,8].map(i=>skewBook(base+i*1000,1,12));
const queuedSell=assessL2Persistence({snapshots:stackedAsk,now:base+8000});
assert.equal(queuedSell.sellQueuePressure,true);
assert.ok(queuedSell.microprice<(sample.ask+sample.bid)/2);
const unstable=[...hist.slice(0,4),skewBook(base+8000,12,1)];
assert.equal(assessL2Persistence({snapshots:unstable,now:base+8000}).buyQueuePressure,false,
 'a one-snapshot spoof-looking size is not persistent queue pressure');
assert.equal(assessL2Persistence({snapshots:stackedBid,now:base+30000}).buyQueuePressure,false,
 'a stale book cannot provide next-quote pressure');
const tinyBook=[0,2,4,6,8].map(i=>skewBook(base+i*1000,.02,.001));
assert.equal(assessL2Persistence({snapshots:tinyBook,now:base+8000}).buyQueuePressure,false,
 'huge ratio with a negligible top-of-book USD notional must be ignored');
const brokenQueue=[...stackedBid];brokenQueue[2]={...brokenQueue[2],bestBidSize:undefined};
assert.equal(assessL2Persistence({snapshots:brokenQueue,now:base+8000}).buyQueuePressure,false,
 'missing true best-queue sizes cannot be extrapolated from deeper levels');
const stale=assessL2Persistence({snapshots:hist,now:base+30000});
assert.equal(stale.status,'STALE');
assert.equal(stale.ready,false);
const gapped=assessL2Persistence({snapshots:[hist[0],hist[1],hist[4]],now:base+8000});
assert.equal(gapped.status,'WARMUP','no invented continuous depth history');
const radar=fs.readFileSync('lib/order-flow-radar.ts','utf8');
const panel=fs.readFileSync('components/OrderFlowRadar.tsx','utf8');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(radar,/assessL2Persistence/);
assert.match(radar,/bookSamples=\[/);
assert.match(panel,/micro\?\.ready&&micro\.possibleBidPull/);
assert.match(panel,/micro\?\.ready&&micro\.possibleBidAbsorption/);
assert.match(panel,/micro\?\.ready&&micro\.possibleAskAbsorption/);
assert.match(panel,/بصمة: امتصاص بيع/);
assert.match(panel,/بصمة: امتصاص شراء/);
assert.match(panel,/طابور: ضغط صعود/);
assert.match(panel,/طابور: ضغط هبوط/);
assert.match(panel,/micro\.bestQueueImbalancePct/);
assert.match(panel,/micro\.microprice/);
assert.match(panel,/compact\?\s*null/);
assert.match(chart,/onView=\{onRadarView\} compact/);
assert.match(css,/\.sniper-flow-radar-chip/);
assert.match(panel,/Coinbase BTC-USD فقط/);
console.log('PASS: true Coinbase L2 persistence, withdrawal vs fills, stale/gap/venue safety and mobile radar chip');
