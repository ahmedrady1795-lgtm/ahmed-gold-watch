import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readGoldLiquidityRadar,trustedSpotGoldSource} from '../lib/gold-liquidity-radar.ts';
import {appendGoldRadarEvent,emptyGoldLedger,settleGoldRadar,goldRadarScore,
 safeGoldRadarLedger,mergeGoldRadarLedger} from '../lib/gold-radar-shadow.ts';
const now=Date.parse('2026-10-20T11:42:10Z');
const lastAt=Math.floor(now/60000)*60000-60000;
const src='Biquote · MT5 XAUUSD candles';
const candles=Array.from({length:44},(_,i)=>{
 const t=lastAt-(43-i)*60000;
 const open=4200+Math.sin(i*.3)*.18;
 const close=open+.05;
 return {time:t,open,close,high:Math.max(open,close)+.64,
  low:Math.min(open,close)-.64};
});
assert.equal(trustedSpotGoldSource(src),true);
assert.equal(trustedSpotGoldSource('Yahoo Finance · COMEX GC=F proxy'),false);
assert.equal(trustedSpotGoldSource('Another Synthetic Exchange'),false);
const neutral=readGoldLiquidityRadar({now,source:src,bars:candles,marketOpen:true});
assert.equal(neutral.ready,true);
assert.equal(neutral.side,'WAIT');
assert.equal(neutral.actionable,false);
assert.equal(readGoldLiquidityRadar({now,source:src,bars:candles,marketOpen:false}).ready,false);
assert.equal(readGoldLiquidityRadar({now,source:'Yahoo Finance · COMEX GC=F proxy',bars:candles,marketOpen:true}).ready,false);
const gapped=candles.map(x=>({...x}));gapped[37].time+=6000;
assert.equal(readGoldLiquidityRadar({now,source:src,bars:gapped,marketOpen:true}).ready,false);
const future=[...candles.slice(0,-1),{...candles.at(-1),time:lastAt+60000}];
assert.equal(readGoldLiquidityRadar({now,source:src,bars:future,marketOpen:true}).ready,false);
const buying=candles.map(x=>({...x}));buying.at(-1).open=4199.7;
buying.at(-1).low=4198.05;buying.at(-1).high=4200.75;buying.at(-1).close=4200.44;
const bull=readGoldLiquidityRadar({now,source:src,bars:buying,marketOpen:true});
assert.equal(bull.phase,'CONFIRMED',JSON.stringify(bull));
assert.equal(bull.side,'BUY');assert.equal(bull.label,'سحب سيولة قاع');
assert.ok(bull.confirm>bull.price&&bull.invalidate<bull.price);
const selling=candles.map(x=>({...x}));selling.at(-1).open=4200.2;
selling.at(-1).low=4199.65;selling.at(-1).high=4202.25;selling.at(-1).close=4199.85;
const bear=readGoldLiquidityRadar({now,source:src,bars:selling,marketOpen:true});
assert.equal(bear.phase,'CONFIRMED',JSON.stringify(bear));
assert.equal(bear.side,'SELL');
const sig=appendGoldRadarEvent({ledger:emptyGoldLedger(),now,
 source:src,closedAt:bull.eventAt,side:bull.side,
 price:bull.price,reason:bull.reason,confirm:bull.confirm,
 invalidate:bull.invalidate,baseline:'BUY'});
assert.equal(sig.added,true,sig.reason);
const dup=appendGoldRadarEvent({ledger:sig.ledger,now,
 source:src,closedAt:bull.eventAt,side:bull.side,
 price:bull.price,reason:bull.reason,confirm:bull.confirm,
 invalidate:bull.invalidate,baseline:'BUY'});
assert.equal(dup.added,false);
assert.equal(appendGoldRadarEvent({ledger:emptyGoldLedger(),now,
 source:'Yahoo Finance · COMEX GC=F proxy',closedAt:bull.eventAt,
 side:bull.side,price:bull.price,reason:bull.reason,
 confirm:bull.confirm,invalidate:bull.invalidate,baseline:'BUY'}).added,false);
const rec=sig.ledger.events[0];
const m1={time:rec.m1.barAt,open:rec.price,
 high:rec.price+1,low:rec.price-.5,close:rec.price+.6};
const m15={...m1,time:rec.m15.barAt};
const before=settleGoldRadar({ledger:sig.ledger,
 now:rec.m1.barAt+30000,source:src,m1:[m1],m15:[]});
assert.equal(before.updated,0,'forming outcome is never scored');
const cross=settleGoldRadar({ledger:sig.ledger,
 now:rec.m1.barAt+70000,source:'Twelve Data · XAU/USD',
 m1:[m1],m15:[]});
assert.equal(cross.updated,0,'different gold provider cannot score');
const scored=settleGoldRadar({ledger:sig.ledger,
 now:rec.m15.barAt+900000+5000,source:src,m1:[m1],m15:[m15]});
assert.equal(scored.updated,2);
assert.equal(scored.ledger.events[0].m1.correct,true);
assert.equal(scored.ledger.events[0].m15.correct,true);
const stats=goldRadarScore(scored.ledger);
assert.equal(stats.events,1);assert.equal(stats.m1.scored,1);
assert.equal(stats.m15.ready,false);assert.equal(stats.modelQualified,false);
assert.equal(stats.tradingEnabled,false);
const restored=safeGoldRadarLedger(scored.ledger,now+86400000);
assert.equal(restored.events.length,1);
const merged=mergeGoldRadarLedger(sig.ledger,scored.ledger,now+86400000);
assert.equal(merged.events.length,1);
assert.equal(merged.events[0].m15.status,'SCORED');
const worker=fs.readFileSync('scripts/gold-radar-worker.mjs','utf8');
const frontend=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const interfaceCode=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
const boot=fs.readFileSync('scripts/start-with-audit-archive.mjs','utf8');
const checkpoint=fs.readFileSync('scripts/checkpoint-gold-radar.mjs','utf8');
assert.match(worker,/goldMarketSession/);
assert.match(worker,/g\?\.fresh===true/);
assert.match(worker,/settleGoldRadar/);
assert.match(worker,/appendGoldRadarEvent/);
assert.match(worker,/lastClosed=reading.eventAt/);
assert.match(frontend,/asset==='GOLD'&&<GoldRadarBadge/);
assert.match(interfaceCode,/\/api\/gold-radar/);
assert.match(boot,/gold-radar-worker\.mjs/);
assert.match(checkpoint,/mergeGoldRadarLedger/);
console.log('PASS: real XAUUSD M1 sweep, compression guards, source-safe M1/M15 shadow score and mobile overlay');
