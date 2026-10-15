const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const source=fs.readFileSync('lib/institutional-price-action.ts','utf8'),ex={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText,{exports:ex,Map,Math,Number,Array});
const {detectDisplacementObFvg:scan,activeStructureRetest:active,sameActiveStructureEvent:stillValid}=ex;
const begin=Date.parse('2026-10-15T08:00:00Z'),now=begin+90*60000;
const base=()=>Array.from({length:90},(_,i)=>({
  time:begin+i*60000,open:100,high:100.4,low:99.6,close:100,
  volume:12
}));
const bull=base();
bull[87]={...bull[87],open:100.25,high:100.4,low:99.6,close:99.8};
bull[88]={...bull[88],open:101.2,high:103,low:100.9,close:102.8,volume:28};
bull[89]={...bull[89],open:101.65,high:102.2,low:100.8,close:102.05,volume:21};
const found=scan(bull,now);
assert.equal(found.ok,true);
const buy=found.setups.find(x=>x.side==='BUY'&&x.impulseAt===bull[88].time);
assert.ok(buy,'completed displacement candle with prior-body BOS, FVG and opposite OB');
assert.equal(buy.phase,'RETEST_CONFIRMED');
assert.equal(buy.structuralLevel,100.4);
assert.equal(buy.fvg.low,100.4);
assert.equal(buy.fvg.high,100.9);
assert.equal(buy.obAt,bull[87].time);
assert.equal(buy.ob.low,99.6);
assert.ok(buy.invalidation<buy.ob.low,'stop should extend beyond actual opposite candle');
assert.equal(buy.retestAt,now,'only the NEXT independently closed candle may confirm retest');
assert.equal(active(found,now)?.id,buy.id);
assert.equal(active(found,now+91000),null,'stale retest must never qualify a new trade');

assert.equal(stillValid({setupOriginId:buy.id,side:'BUY'},buy,now),true);
assert.equal(stillValid({setupOriginId:'another-event',side:'BUY'},buy,now),false);
assert.equal(stillValid({setupOriginId:buy.id,side:'SELL'},buy,now),false);
assert.equal(stillValid({setupOriginId:buy.id,side:'BUY'},buy,now+91000),false);
const laterInvalid=[...bull,{time:now,open:99.8,high:100.2,low:98.8,close:99.1}];
const revoked=scan(laterInvalid,now+60000);
const broken=revoked.setups.find(x=>x.id===buy.id);
assert.equal(broken?.phase,'INVALIDATED','any later CLOSED candle breaking OB stop must revoke previous retest');
assert.equal(broken?.retestAt,null,'cannot keep timestamp of revoked confirmation');
assert.equal(active(revoked,now+60000),null);
assert.equal(stillValid({setupOriginId:buy.id,side:'BUY'},active(revoked,now+60000),now+60000),false);
const rebound=[...laterInvalid,{time:now+60000,open:99.2,high:102.5,low:99,close:102.1}];
assert.equal(scan(rebound,now+120000).setups.find(x=>x.id===buy.id)?.phase,'INVALIDATED',
  'a later bounce cannot resurrect an invalidated original OB/FVG event');
const distantBlock=bull.map(c=>({...c}));
distantBlock[87]={...distantBlock[87],open:99.15,high:99.35,low:98.7,close:98.85};
assert.equal(scan(distantBlock,now).setups.some(x=>x.impulseAt===bull[88].time),false,
  'a far-away bearish candle cannot be claimed as the origin of the observed FVG');

const pre=scan(bull.slice(0,-1),now-60000);
assert.equal(pre.setups.find(x=>x.impulseAt===bull[88].time)?.phase,'AWAIT_RETEST');
assert.equal(active(pre,now-60000),null,'BOS+OB+FVG without retest is WATCH only');
const noGap=bull.map(x=>({...x}));
noGap[88].low=100.3;
assert.equal(scan(noGap,now).setups.some(x=>x.impulseAt===bull[88].time),false,
  'no distinct three-bar FVG blocks OB/FVG classification');
const wickOnly=bull.map(x=>({...x}));
wickOnly[88]={...wickOnly[88],open:100,high:103,low:99.9,close:100.3};
assert.equal(scan(wickOnly,now).setups.some(x=>x.impulseAt===bull[88].time),false,
  'a long wick is NOT a close-body BOS or true displacement');
const invalid=bull.map(x=>({...x}));
invalid[89]={...invalid[89],open:100,high:101,low:99.0,close:99.1};
assert.equal(scan(invalid,now).setups.find(x=>x.impulseAt===bull[88].time)?.phase,'INVALIDATED');
const bear=bull.map(x=>({...x,open:200-x.open,close:200-x.close,
  high:200-x.low,low:200-x.high}));
const sell=scan(bear,now).setups.find(x=>x.side==='SELL'&&x.impulseAt===bull[88].time);
assert.equal(sell?.phase,'RETEST_CONFIRMED','SELL pattern must mirror BUY');
assert.ok(sell.invalidation>sell.ob.high);
const gap=bull.map(x=>({...x}));gap.splice(-5,1);
assert.equal(scan(gap,now).reason,'GAPPED_M1');
assert.equal(scan(bull,now+180001).reason,'STALE_M1');
const future=[...bull,{time:now,open:100,high:300,low:10,close:299}];
assert.equal(scan(future,now).setups.find(x=>x.impulseAt===bull[88].time)?.phase,'RETEST_CONFIRMED',
  'future/unfinished bars cannot change confirmation');
const scalp=fs.readFileSync('lib/scalp-opportunities.ts','utf8');
const strategies=fs.readFileSync('lib/scalp-strategies.ts','utf8');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(scalp,/activeStructureRetest\(structureScan,now,90000\)/);
assert.match(scalp,/obFvgEvidence:obFvgRetest/);
assert.match(scalp,/chosen\.setup==='OB_FVG'\?3/);
assert.match(scalp,/targets\\[0\\]\\?\\.kind!=='STRUCTURE'\\|\\|netRUnrounded==null\\|\\|netRUnrounded<3/);
assert.match(scalp,/obFvgRetest\.invalidation/);
assert.match(scalp,/sameActiveStructureEvent/);
assert.match(scalp,/liveNetRR>=\(previous\.setup==='OB_FVG'\?3:1\.25\)/);
assert.match(scalp,/netRUnrounded<3/);
assert.match(scalp,/setupOriginId:chosen\.setup==='OB_FVG'\?obFvgRetest\?\.id:null/);
assert.match(strategies,/id:'OB_FVG'/);
assert.match(chart,/className="sniper-obfvg-structure"/);
assert.match(chart,/OB\/FVG/);
assert.doesNotMatch(chart,/أوامر مؤسسات مؤكدة/);
console.log('PASS: causal OB/FVG BOS, close-confirmed retest, permanent invalidation, nearest block, strict 3R on frozen entries, and chart');
