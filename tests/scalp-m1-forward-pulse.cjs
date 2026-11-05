const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();
function load(file){
  file=path.resolve(file);
  if(cache.has(file))return cache.get(file);
  const exports={};
  cache.set(file,exports);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  vm.runInNewContext(js,{
    exports,Number,Math,Date,
    require:id=>id.startsWith('.')?
      load(path.resolve(path.dirname(file),id+'.ts')):require(id)
  },{filename:file});
  return exports;
}
const {advanceForwardM1Pulse,auditForwardM1Pulse,
  M1_FORWARD_PULSE_V1}=load('lib/scalp-m1-forward-pulse.ts');
assert.match(M1_FORWARD_PULSE_V1,/V1$/);
const T=Date.parse('2026-11-05T17:00:00Z');
const fresh=(mid,ms,source='Exness/MT5',spread=.04)=>({
  at:T+ms,bid:mid-spread/2,ask:mid+spread/2,source
});
const base={issuedAt:T,anchorClose:100,atr:1,forecastSide:'BUY',
  now:T+100,historicalSource:'Exness/MT5'};
const advance=(prev,q,ms)=>advanceForwardM1Pulse({...base,
  previous:prev,quote:q,now:T+ms});
const first=advance(null,fresh(100,100),100);
assert.equal(first.count,1);
assert.equal(first.firstSide,null,'a single tick cannot supply early conviction');
const second=advance(first,fresh(100.21,500),500);
assert.equal(second.count,2);
assert.equal(second.firstSide,'BUY');
assert.equal(second.firstAgree,true);
assert.equal(second.firstAtSignal,T+500);
assert.equal(second.firstMoveAtr,.21);
assert.strictEqual(advance(second,fresh(99.3,500),500),second,
 'duplicate time cannot rewrite tick path');
const flip=advance(second,fresh(99.5,850),850);
assert.equal(flip.firstSide,'BUY',
 'a subsequently reversed minute must never repaint the first forecast');
assert.equal(flip.firstAgree,true);
assert.equal(flip.lowMid,99.5);
let counter=advance(null,fresh(100,100),100);
counter=advance(counter,fresh(99.80,600),600);
assert.equal(counter.firstSide,'SELL');
assert.equal(counter.firstAgree,false);
assert.equal(advance(null,fresh(100.2,500,'Yahoo'),500),null,
 'different venue cannot supply source-matched tick evidence');
assert.equal(advance(null,fresh(100.2,-20),100),null,
 'pre-issuance quote cannot be used to predict the issued minute');
assert.equal(advance(null,fresh(100.2,100),11100),null,
 'delayed quote cannot become a fresh signal');
const secondQuiet=advance(first,fresh(100.02,10000),10000);
const thirdQuiet=advance(secondQuiet,fresh(100.03,18000),18000);
const afterWindow=advance(thirdQuiet,fresh(100.5,25000),25000);
assert.equal(afterWindow.valid,true);
assert.equal(afterWindow.firstSide,null,
 'first meaningful tick after 20 seconds is not early evidence');
const mismatched=advance(first,fresh(100.3,2000,'EXNESS-other-feed'),2000);
assert.equal(mismatched.valid,false,'provider key switch invalidates sequence');
assert.equal(advance(mismatched,fresh(100.4,2600),2600).valid,false,
 'invalidated sequence cannot be resurrected by a late matching quote');
const gap=advance(first,fresh(100.5,18000),18000);
assert.equal(gap.valid,false,'missing intervening ticks are not filled in');
assert.equal(advance(second,fresh(100.8,61000),61000).count,2,
 'ticks from later minutes cannot change frozen M1 research');
const rows=[
 {issuedAt:T,side:'BUY',pulse:second,directionObserved:'BUY'},
 {issuedAt:T,side:'BUY',pulse:counter,directionObserved:'SELL'},
 {issuedAt:T,side:'BUY',pulse:counter,directionObserved:'BUY'},
 {issuedAt:T,side:'BUY',pulse:second,directionObserved:'UNKNOWN'},
 {issuedAt:T,side:'BUY',pulse:second,directionObserved:'FLAT'},
 {issuedAt:T,side:'BUY',pulse:second,directionObserved:null},
 {issuedAt:T,side:'BUY',pulse:first,directionObserved:'SELL'},
 {issuedAt:T,side:'BUY',pulse:mismatched,directionObserved:'SELL'}
];
const summary=auditForwardM1Pulse(rows);
assert.equal(summary.issued,8);
assert.equal(summary.earlySignals,6);
assert.equal(summary.graded,3);
assert.equal(summary.earlyHits,2);
assert.equal(summary.originalHits,2);
assert.equal(summary.agree.graded,1);
assert.equal(summary.agree.earlyHits,1);
assert.equal(summary.counter.graded,2);
assert.equal(summary.counter.earlyHits,1);
assert.equal(summary.unknown,1);
assert.equal(summary.flat,1);
assert.equal(summary.waiting,1);
assert.equal(summary.insufficient,2);
assert.equal(auditForwardM1Pulse([]).earlyAccuracyPct,null);
const engine=fs.readFileSync('lib/scalp-every-candle.ts','utf8');
assert.match(engine,/pulseVersion:M1_FORWARD_PULSE_V1,pulse:null/);
assert.match(engine,/t\.pulse=advanceForwardM1Pulse\(/);
assert.match(engine,/const forwardPulse=auditForwardM1Pulse\(/);
assert.match(engine,/forwardPulse,\s*(?:smartExit,\s*)?forwardDirection:/,
 'forward pulse retains its audit even when another independent study is added');
const page=fs.readFileSync('app/scalp/page.tsx','utf8');
assert.match(page,/data\?\.forwardPulse\?\.earlyHits/);
assert.match(page,/data\?\.forwardPulse\?\.originalHits/);
console.log('PASS: prospective M1 early-tick cohort, frozen first signal, truthful coverage, source and time safety');
