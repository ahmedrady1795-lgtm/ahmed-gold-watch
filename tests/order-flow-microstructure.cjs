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
assert.match(panel,/micro\?\.possibleBidPull/);
assert.match(panel,/micro\?\.possibleBidAbsorption/);
assert.match(panel,/micro\?\.possibleAskAbsorption/);
assert.match(panel,/بصمة: امتصاص بيع/);
assert.match(panel,/بصمة: امتصاص شراء/);
assert.match(panel,/compact\?\s*null/);
assert.match(chart,/onView=\{onRadarView\} compact/);
assert.match(css,/\.sniper-flow-radar-chip/);
assert.match(panel,/Coinbase BTC-USD فقط/);
console.log('PASS: true Coinbase L2 persistence, withdrawal vs fills, stale/gap/venue safety and mobile radar chip');
