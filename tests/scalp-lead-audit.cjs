const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('lib/scalp-lead-audit.ts','utf8');
const store={},stateGlobal={};
const fakeFs={
  existsSync:p=>p==='/data'||Object.prototype.hasOwnProperty.call(store,p),
  readFileSync:p=>{if(!(p in store))throw new Error('missing');return store[p]},
  writeFileSync:(p,txt)=>{store[p]=String(txt)},
  renameSync:(a,b)=>{store[b]=store[a];delete store[a]}
};
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
}).outputText,{exports:exportsObject,require:name=>name==='node:fs'?{default:fakeFs,...fakeFs}:require(name),globalThis:stateGlobal});
const {startLeadObservation:start,advanceLeadObservation:advance,
  observeScalpLead:observe,summarizeLeadObservations:summary}=exportsObject;
const T=Date.parse('2026-11-04T12:00:00Z');
const candidate=(id='a',side='BUY',status='WATCH')=>({
  id,side,status,score:81,setup:'BREAKOUT',cost:.5
});
const quote=(price,ms,source='Biquote · MT5 XAUUSD')=>({
  price,at:T+ms,source
});
const at=ms=>T+ms;
let base=start('GOLD_M1',candidate(),quote(100,0),at(100));
assert.equal(base.result,'OPEN');
assert.equal(base.threshold,1,'threshold must cover twice the estimated transaction cost');
assert.equal(base.startedAt,T+100,'signal birth is computation time, not pre-signal source tick');
assert.equal(start('GOLD_M1',{...candidate(),score:69},quote(100,0),at(100)),null,
 'low confidence technical WATCH must not be silently promoted');
assert.equal(start('GOLD_M1',candidate(),quote(100,0),at(11000)),null,
 'stale quotes never become observation starts');
assert.equal(start('GOLD_M1',{...candidate(),cost:0},quote(100,0),at(100)),null,
 'missing cost must not create a free winning threshold');
let step=advance(base,quote(100.5,4000),at(4100));
assert.equal(step.result,'OPEN');
assert.equal(step.maxFavorable,.5);
assert.equal(advance(step,quote(999,3000),at(4100)),step,'older quotes ignored');
step=advance(step,quote(101.2,8000),at(8100));
assert.equal(step.result,'FAVORABLE_FIRST');
assert.equal(step.resolvedAt,T+8000);
assert.equal(step.maxFavorable,1.2);
assert.equal(advance(step,quote(50,9000),at(9100)),step,
 'settled outcomes cannot be rewritten after the fact');
let adverse=advance(base,quote(98.8,3000),at(3100));
assert.equal(adverse.result,'ADVERSE_FIRST');
assert.equal(adverse.maxAdverse,1.2);
let switched=advance(base,quote(101.2,3000,'Exness/MT5 XAUUSDm'),at(3100));
assert.equal(switched.result,'UNKNOWN','never merge Biquote/Exness sources into a win');
let gap=advance(base,quote(101.2,16000),at(16100));
assert.equal(gap.result,'UNKNOWN','a 16 second quote gap cannot prove first threshold touch');
let missing=advance(base,{price:null,at:null,source:'Biquote · MT5 XAUUSD'},at(76000));
assert.equal(missing.result,'UNKNOWN','unobserved 60s horizon does not count as a loss');
let flat=base;
for(let ms=10000;ms<=60000;ms+=10000)
 flat=advance(flat,quote(100.2,ms),at(ms+100));
flat=advance(flat,quote(100.2,61000),at(61100));
assert.equal(flat.result,'NO_THRESHOLD','completed horizon without a threshold is neutral, not a win');
let amb=start('GOLD_AMBUSH',{...candidate('ambush-1','SELL','AMBUSH'),score:62},
 quote(100,0,'Exness/MT5 XAUUSDm'),at(100));
assert.ok(amb,'real Ambush events are observed without inventing technical score gating');
assert.equal(amb.expiresAt,T+30100);
assert.equal(advance(amb,quote(98.7,5000,'Exness/MT5 XAUUSDm'),at(5100)).result,'FAVORABLE_FIRST');
let s=summary([step,adverse,switched,gap,missing,flat],null);
assert.equal(s.total,6);
assert.equal(s.resolved,2);
assert.equal(s.favorableFirst,1);
assert.equal(s.adverseFirst,1);
assert.equal(s.noThreshold,1);
assert.equal(s.unknown,3);
assert.equal(s.observedFavorablePct,50);
assert.equal(s.verdict,'COLLECTING','a tiny shadow sample proves no predictive edge');
// Exercise real lane state: one unresolved signal per lane, no repeat ID and no peeking.
assert.equal(advance(base,quote(110,50),at(110)),base,
 'ticks from before signal computation must not count as favorable outcomes');
const t1=observe('GOLD_M1',quote(100,0),at(100),candidate('same'));
assert.equal(t1.pending,1);assert.equal(t1.total,0);assert.equal(t1.persisted,true);
const t2=observe('GOLD_M1',quote(101.2,3000),at(3100),candidate('same'));
assert.equal(t2.favorableFirst,1);
assert.equal(t2.pending,0,'a settled signal cannot re-open on the closing tick');
const t3=observe('GOLD_M1',quote(101.3,4000),at(4100),candidate('same'));
assert.equal(t3.pending,0,'the same plan must not be scored twice');
const t4=observe('GOLD_M1',quote(101.3,5000),at(5100),candidate('fresh'));
assert.equal(t4.pending,1,'only a new plan ID can start a new sample');
assert.equal(observe('GOLD_M5',quote(100,0),at(100),candidate('independent')).pending,1,
 'M1 and M5 audit lanes must be separate');
const scalpPage=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.ok(scalpPage.includes('GoldLeadAudit audit={desk?.gold?.leadAudit}'),
 'the GOLD M1/M5 audit must appear on the mobile Scalp Lab screen');
assert.match(scalpPage,/ليست صفقات أو نسبة ربح/,
 'the UI must not present observed directional moves as a win rate');
assert.match(scalpPage,/لا يشمل الحالات المجهولة/,
 'unknown quote gaps must remain visible rather than being scored as wins');
console.log('PASS: causal scalp shadow observations, no future candles, stale/gap/source uncertainty, fee thresholds, dedupe, no live execution');
