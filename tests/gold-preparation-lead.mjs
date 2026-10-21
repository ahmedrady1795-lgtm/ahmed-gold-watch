import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GOLD_PREPARATION_VERSION,emptyGoldLeadLedger,readGoldPreparation,
 appendGoldLead,settleGoldLead,safeGoldLeadLedger,mergeGoldLeadLedger,goldLeadScore,
 goldQuoteMatchesCandles} from '../lib/gold-preparation-lead.ts';
const MIN=60000,now=Date.parse('2026-10-21T10:40:10Z');
const source='Biquote · MT5 XAUUSD candles',quoteSource='Biquote · MT5 XAUUSD';
const start=Math.floor(now/MIN)*MIN;
const bars=Array.from({length:80},(_,i)=>{
 const level=4200+Math.sin(i*.6)*.4;
 return {time:start-(80-i)*MIN,open:level,high:level+.4,low:level-.4,close:level+.05};
});
// A genuine historical destination, formed long before the compression box.
bars[15]={...bars[15],open:4202,high:4204,low:4201,close:4202};
for(let i=72;i<80;i++){
 const j=i-72,low=4199.8+j*.06,close=4200.1+j*.085;
 bars[i]={time:bars[i].time,open:close-.05,low,high:4200.85,close};
}
const quote={ok:true,source:quoteSource,price:4200.7,bid:4200.65,ask:4200.75,
 sourceTime:now-1000,fetchedAt:now,status:'live'};
const read=(over={})=>readGoldPreparation({now,source,bars,quote,marketOpen:true,...over});
const reading=read();assert.ok(reading.plan,reading.reason);
const plan=reading.plan;
assert.equal(plan.setup,'PRESSURE_COIL');assert.equal(plan.side,'BUY');
assert.ok(plan.trigger>quote.ask&&plan.target>plan.trigger&&plan.invalidate<quote.bid);
assert.equal(plan.target,4204,'target is an actual pre-existing swing');
assert.equal(plan.issuedAt,now,'issuance cannot be backdated to the closed setup candle');
assert.equal(plan.version,GOLD_PREPARATION_VERSION);
const frozen=structuredClone(plan);
assert.equal(read({marketOpen:false}).plan,null);
assert.equal(read({source:'Yahoo Finance · COMEX GC=F proxy'}).plan,null);
assert.equal(read({quote:{...quote,source:'Twelve Data'}}).plan,null);
assert.equal(read({quote:{...quote,sourceTime:now-11000}}).plan,null);
assert.equal(read({quote:{...quote,sourceTime:null,fetchedAt:now}}).plan,null);
assert.equal(read({quote:{...quote,sourceTime:now+5000}}).plan,null);
assert.equal(read({quote:{...quote,bid:4200.8,ask:4200.6}}).plan,null);
assert.equal(read({quote:{...quote,price:plan.trigger+.1,ask:plan.trigger+.2}}).plan,null);
assert.equal(read({bars:[...bars,{...bars.at(-1),time:start}]}).plan,null,'forming candles rejected');
const gap=structuredClone(bars);gap.splice(30,1);
assert.equal(read({bars:gap}).plan,null);
assert.equal(read({now:now+100000,quote:{...quote,sourceTime:now+100000,fetchedAt:now+100000}}).plan,null);
const noDest=bars.map(b=>({...b,high:Math.min(b.high,4200.9)})).filter(b=>b.high>=b.open&&b.high>=b.close);
assert.equal(read({bars:noDest}).plan,null,'no invented extended target');
const mirror=b=>({time:b.time,open:8400-b.open,close:8400-b.close,high:8400-b.low,low:8400-b.high});
const sell=read({bars:bars.map(mirror),quote:{...quote,price:4199.3,bid:4199.25,ask:4199.35}}).plan;
assert.ok(sell);assert.equal(sell.side,'SELL');assert.equal(sell.target,4196);
assert.equal(goldQuoteMatchesCandles(quoteSource,source),true);
assert.equal(goldQuoteMatchesCandles(quoteSource,'Exness/MT5 · XAUUSD'),false);

const empty=emptyGoldLeadLedger(),armed=appendGoldLead(empty,plan);
assert.equal(armed.events.length,1);assert.equal(armed.events[0].status,'ARMED');
assert.equal(appendGoldLead(armed,{...plan,issuedAt:now+MIN}),armed,'one active independent case');
assert.equal(goldLeadScore(armed).targetRate,null);assert.equal(goldLeadScore(armed).evaluated,0);
const bar=(at,change={})=>({time:at,open:4200.7,close:4200.72,
 high:plan.trigger-.02,low:plan.invalidate+.1,...change});
const issue=bar(start),breakout=bar(start+MIN,{high:plan.trigger+.15,close:plan.trigger+.05});
const target=bar(start+2*MIN,{open:plan.trigger-.01,high:plan.target+.1,close:plan.target-.1});
const settle=(ledger,rows,at=start+3*MIN+4000,src=source)=>settleGoldLead(ledger,at,src,rows);
assert.equal(settle(armed,[issue],start+MIN-1),armed,'forming issuance minute never settles');
const crossed=settle(armed,[issue,breakout],start+2*MIN+4000);
const e=crossed.events[0];
assert.equal(e.status,'BREAKOUT');assert.equal(e.leadMinSeconds,50);assert.equal(e.leadMaxSeconds,110);
assert.deepEqual(e.breakoutBar,breakout);assert.deepEqual(e.issuanceBar,issue);
assert.equal(e.trigger,plan.trigger);assert.equal(e.issuedAt,now);
const hit=settle(crossed,[target]);
assert.equal(hit.events[0].status,'TARGET');assert.equal(goldLeadScore(hit).targetBeforeStop,1);
assert.equal(goldLeadScore(hit).evaluated,1);assert.equal(goldLeadScore(hit).modelQualified,false);
assert.equal(goldLeadScore(hit).tradingEnabled,false);
assert.equal(settle(hit,[]),hit,'terminal outcome never repaints');
assert.deepEqual(plan,frozen,'frozen plan not mutated');
assert.equal(settle(armed,[{...issue,high:plan.trigger+.1}]).events[0].status,'TIMING_UNPROVEN');
assert.equal(settle(armed,[issue,{...breakout,low:plan.invalidate-.1}]).events[0].status,'AMBIGUOUS');
assert.equal(settle(armed,[issue,bar(start+MIN,{low:plan.invalidate-.1})]).events[0].status,'INVALIDATED');
assert.equal(settle(crossed,[{...target,low:plan.invalidate-.1}]).events[0].status,'AMBIGUOUS');
assert.equal(settle(crossed,[bar(start+2*MIN,{low:plan.invalidate-.1})]).events[0].status,'STOP');
assert.equal(settle(armed,[issue,{...breakout,open:plan.trigger+.1}]).events[0].status,'UNKNOWN');
assert.equal(settle(armed,[issue,breakout],start+3*MIN+4000,'Twelve Data · XAU/USD').events[0].status,'UNKNOWN');
assert.equal(settle(armed,[issue],start+6*MIN).events[0].status,'UNKNOWN','missing bars are excluded');
const noBreak=settle(armed,Array.from({length:6},(_,i)=>bar(start+i*MIN)),start+6*MIN+4000);
assert.equal(noBreak.events[0].status,'NO_BREAK');assert.equal(goldLeadScore(noBreak).targetRate,0);
const expired=settle(crossed,Array.from({length:15},(_,i)=>bar(start+(i+2)*MIN)),start+17*MIN+4000);
assert.equal(expired.events[0].status,'TIMEOUT');
const futureTarget={...target,time:start+3*MIN};
assert.notEqual(settle(crossed,[futureTarget],start+3*MIN+2000).events[0].status,'TARGET');
// Persisted proof is retained even if a provider revises a previously observed
// candle. Future evidence starts at evaluatedThrough, never replays the past.
const revised=settle(crossed,[{...breakout,high:plan.trigger-.01},target]);
assert.equal(revised.events[0].leadMinSeconds,50);
assert.equal(revised.events[0].status,'TARGET');
const restored=safeGoldLeadLedger(hit,start+4*MIN);
assert.equal(restored.events.length,1);assert.equal(restored.events[0].status,'TARGET');
const merged=mergeGoldLeadLedger(armed,hit,start+4*MIN);
assert.equal(merged.events[0].status,'TARGET');
assert.equal(mergeGoldLeadLedger(hit,armed,start+4*MIN).events[0].status,'TARGET');
const tampered=structuredClone(hit);tampered.events[0].target+=1;
assert.equal(mergeGoldLeadLedger(armed,tampered,start+4*MIN).events[0].status,'ARMED','level rewrites rejected');
const forged=structuredClone(hit);forged.events[0].leadMinSeconds=800;
assert.equal(safeGoldLeadLedger(forged,start+4*MIN).events.length,0);
const conflicting=structuredClone(hit);conflicting.events[0].status='STOP';
assert.equal(mergeGoldLeadLedger(hit,conflicting,start+4*MIN).events[0].status,'UNKNOWN');
const cooled=appendGoldLead(noBreak,{...plan,id:plan.id+':other',issuedAt:now+7*MIN});
assert.equal(cooled,noBreak,'no repeat correlated alerts inside 15 minutes');
const sellArmed=appendGoldLead(empty,sell);
const sellHit=settle(sellArmed,[issue,breakout,target].map(mirror));
assert.equal(sellHit.events[0].status,'TARGET','mirrored sell is symmetric');
const score=goldLeadScore({schema:empty.schema,updatedAt:now,events:[hit.events[0],noBreak.events[0],
 {...hit.events[0],status:'INVALIDATED'}, {...hit.events[0],status:'TIMING_UNPROVEN'}]});
assert.equal(score.evaluated,3);assert.equal(score.targetRate,1/3);assert.equal(score.excluded,1);
const ui=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
assert.match(ui,/leadMinSeconds/);assert.match(ui,/preparationLead/);
assert.match(ui,/لم تثبت دقته خارج العينة/);
assert.match(fs.readFileSync('scripts/start-with-audit-archive.mjs','utf8'),/gold-preparation-worker\.mjs/);
console.log('PASS: causal pre-break plans, historical targets, immutable proof, future-only lead bounds, source/gap/ambiguity guards, honest denominator and restore');
