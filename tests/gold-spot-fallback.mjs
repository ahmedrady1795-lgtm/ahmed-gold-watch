import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectGoldSpotDisplay} from '../lib/gold-spot-fallback.ts';
const at=Date.parse('2026-11-23T04:27:00Z');
const chartSource='Biquote · MT5 XAUUSD candles';
const quoteSource='Biquote · MT5 XAUUSD';
const active=(buy=true)=>{
 const flip=p=>buy?p:8400-p;
 const plan={id:'SERVER_ISSUED_GOLD_M1',issuedAt:at-20000,
  contextAt:at-60000,quoteAt:at-22000,armUntil:at+100000,
  source:chartSource,quoteSource,method:'SPOT_PRICE_PREPARATION',
  status:'ARMED',side:buy?'BUY':'SELL',trigger:flip(4201),
  target:flip(4204),invalidate:flip(4199),reason:'ضغط سعري M1 مغلق'};
 const observation={checkedAt:at-5000,quoteAt:at-4000,price:flip(4200.48),
  source:chartSource,quoteSource};
 return {now:at,marketFresh:true,chartSource,quoteSource,
  quoteAt:at-2000,price:flip(4200.52),
  view:{status:'OBSERVING',current:plan,observation}};
};
for(const buy of [true,false]){
 const a=active(buy),p=selectGoldSpotDisplay(a);
 assert.equal(p?.side,buy?'BUY':'SELL','mirrored server-issued spot plan before breakout');
 assert.equal(p?.method,'SPOT_PRICE_PREPARATION');
 assert.equal(p?.issuedAt,a.view.current.issuedAt,'never backdate the entry marker');
 assert.equal(p?.trigger,a.view.current.trigger,'frozen trigger survives display');
 assert.equal(selectGoldSpotDisplay({...a,marketFresh:false}),null);
 assert.equal(selectGoldSpotDisplay({...a,quoteAt:at-18000}),null,'stale live quote');
 assert.equal(selectGoldSpotDisplay({...a,quoteSource:'Twelve Data'}),null,'mixed spot sources');
 assert.equal(selectGoldSpotDisplay({...a,chartSource:'Kraken XBT/USD'}),null,'no BTC leakage');
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,status:'STALE_OR_STARTING'}}),null);
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,current:
  {...a.view.current,status:'BREAKOUT'}}}),null,'do not reissue postbreak as prebreak');
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,current:
  {...a.view.current,method:'DOM'}}}),null,'not fabricated broker DOM');
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,current:
  {...a.view.current,issuedAt:at+6000}}}),null,'future setup');
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,current:
  {...a.view.current,armUntil:at-1}}}),null,'expired setup');
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,observation:
  {...a.view.observation,checkedAt:at-46000}}}),null,'stale server observation');
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,observation:
  {...a.view.observation,source:'Other spot feed'}}}),null,'server-source conflict');
 assert.equal(selectGoldSpotDisplay({...a,view:{...a.view,current:
  {...a.view.current,target:buy?4202:4198}}}),null,'no invented target');
 assert.equal(selectGoldSpotDisplay({...a,price:buy?4201.05:4198.95}),null,
  'crossed trigger is late');
 assert.equal(selectGoldSpotDisplay({...a,price:buy?4199.1:4200.9}),null,
  'adverse drift is not an early entry');
 const edge=buy?4200.99:4199.01;
 assert.equal(selectGoldSpotDisplay({...a,price:edge,view:{...a.view,
  observation:{...a.view.observation,price:edge}}}),null,'tiny prebreak buffer');
}
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const badge=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
assert.match(panel,/onPreparationView=\{onGoldPreparationView\}/,
 'the already-running radar poll feeds the main chart');
assert.match(badge,/onPreparationView\?\.\(data\?\.ok\?data\.preparationLead/,
 'no second polling loop or synthesized broker event');
assert.match(panel,/data-gold-spot-fallback="read-only"/,
 'eligible experimental GOLD spot plan gets a separate chart marker');
assert.match(panel,/showGoldSpotPlan=Boolean\(goldSpotPlan&&!mainSetup&&!cuePrebreak\)/,
 'a stronger confirmed setup outranks the price-only fallback');
console.log('PASS: GOLD Biquote/Exness-independent price-only prebreak display, frozen source/times, BUY/SELL, no late or fake DOM entries');
