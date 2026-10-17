const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const module_={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-chart-playbook.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:module_,exports:module_.exports},{filename:'sniper-chart-playbook'});
const build=module_.exports.buildSniperChartPlaybook;
const base={marketOpen:true,priceFresh:true,historyFresh:true,price:100,atr:4,
 observation:{status:'ALIGNED',side:'BUY',m1Side:'BUY',m5Side:'BUY'},
 breakout:{phase:'RANGE',side:'WAIT',closes:0,level:null,headline:'داخل النطاق',detail:'ننتظر الإغلاق'},
 planReady:false,planSide:'WAIT',liquidityAvailable:true,
 targets:[{stage:1,price:110},{stage:2,price:116},{stage:3,price:122}]
};
const scan=build(base);
assert.equal(scan.phase,'TRACKING');assert.equal(scan.side,'BUY');
assert.equal(scan.evidenceStrength,'ALIGNED','agreement without breakout is directional evidence, not a trade');
assert.match(scan.title,/متوافق/,'directional assessment is clear rather than generic WAIT');
assert.match(scan.strengthDetail,/M1 \+ M5/);
assert.doesNotMatch(scan.strengthTitle,/\d+%/,'never market technical alignment as calibrated win chance');
assert.equal(scan.actionable,false,'directional radar is never an execution signal');
assert.equal(scan.target.price,110,'first objective is the nearest observed structure');
assert.equal(scan.level,null,'never invent a breakout level when none exists');
assert.equal(scan.retest,null,'no imaginary retest range before a breakout test');
assert.equal(scan.steps[0].state,'READY');assert.equal(scan.steps[1].state,'WAIT');
assert.equal(scan.steps[2].state,'WAIT','liquidity map is not trade-flow confirmation');
const testing=build({...base,breakout:{phase:'M1_BREAK',side:'BUY',closes:0,
 level:103,headline:'اختبار',detail:'M1 فوق المقاومة'}});
assert.equal(testing.phase,'TESTING');assert.equal(testing.level,103);
assert.equal(testing.retest.low,102.4);
assert.equal(testing.retest.high,103.6);
assert.equal(testing.retest.executable,false,'ATR sketch is not a broker LIMIT zone');
const first=build({...base,breakout:{...testingToBreak(testing),'phase':'M5_FIRST',closes:1}});
assert.equal(first.phase,'FIRST_CLOSE');assert.equal(first.steps[1].detail,'1/2 M5');
const confirmed=build({...base,breakout:{...testingToBreak(testing),phase:'M5_CONFIRMED',closes:2}});
assert.equal(confirmed.phase,'CONFIRMED');assert.equal(confirmed.steps[1].state,'READY');
assert.equal(confirmed.evidenceStrength,'CONFIRMED','aligned frames, full breakout and mapped structural liquidity warrant high technical evidence');
assert.equal(build({...base,liquidityAvailable:false,breakout:{
  ...testingToBreak(testing),phase:'M5_CONFIRMED',closes:2}}).evidenceStrength,'ALIGNED',
  'do not upgrade evidence if structural liquidity map is not qualified');
assert.equal(build({...base,observation:{status:'M5_ONLY',side:'BUY',m1Side:'WAIT',m5Side:'BUY'},
  breakout:{...testingToBreak(testing),phase:'M5_CONFIRMED',closes:2}}).evidenceStrength,'PARTIAL',
  'M5-only cannot masquerade as a strong two-frame forecast');
assert.equal(build({...base,observation:{status:'ALIGNED_WATCH',side:'BUY',m1Side:'BUY',m5Side:'BUY'}}).steps[0].state,
  'READY','a qualified independent AI horizon watch is visible but not an execution signal');
assert.equal(confirmed.actionable,false,'confirmed breakout alone is not a trade');
const qualified=build({...base,planReady:true,planSide:'BUY'});
assert.equal(qualified.phase,'QUALIFIED');assert.equal(qualified.actionable,false);
assert.equal(qualified.evidenceStrength,'QUALIFIED');
const conflict=build({...base,observation:{status:'CONFLICT',side:'WAIT',m1Side:'SELL',m5Side:'BUY'}});
assert.equal(conflict.phase,'CONFLICT');assert.equal(conflict.side,'WAIT');
assert.equal(conflict.targets.length,0,'opposed frames do not promote an objective as directional');
assert.equal(conflict.evidenceStrength,'NONE','a genuine conflict is never strong evidence');
const stale=build({...base,historyFresh:false,breakout:{...testingToBreak(testing),phase:'M5_CONFIRMED',closes:2}});
assert.equal(stale.phase,'PAUSED');assert.equal(stale.level,null);assert.equal(stale.retest,null);
assert.equal(stale.targets.length,0);
assert.equal(stale.evidenceStrength,'NONE');
assert.equal(build({...base,marketOpen:false}).phase,'PAUSED');
assert.equal(build({...base,priceFresh:false}).phase,'PAUSED');
assert.equal(build({...base,price:null}).phase,'PAUSED');
const noTargets=build({...base,targets:[]});
assert.equal(noTargets.target,null,'missing structural prices do not generate a fake TP');
const wrongSide=build({...base,targets:[{stage:1,price:95},{stage:2,price:91}]});
assert.equal(wrongSide.target,null,'opposite-side targets are never shown as sniper TP');
const sell=build({...base,observation:{status:'ALIGNED',side:'SELL',m1Side:'SELL',m5Side:'SELL'},
 targets:[{stage:1,price:94},{stage:2,price:88}],breakout:{
 phase:'M5_FIRST',side:'SELL',closes:1,level:97,headline:'كسر',detail:'إغلاق أول'}});
assert.equal(sell.side,'SELL');assert.equal(sell.target.price,94);
assert.equal(sell.retest.center,97);
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8'),
 css=fs.readFileSync('app/workspace.css','utf8');
assert.match(chart,/sniper-playbook-heading/,'playbook drawn inside live chart UI');
assert.match(chart,/sniper-retest-corridor/,'retest band rendered at its actual price scale');
assert.match(chart,/sniper-offscreen-target/,'off-zoom targets are disclosed, not repositioned');
assert.match(chart,/offscreenTargets=playbook\.targets\.filter/);
assert.match(chart,/primaryLiquidityZone/,'preserve liquidity mapping');
assert.match(chart,/assessBreakoutWatch/,'preserve M5 breakout gating');
assert.match(chart,/watchTargets/,'preserve original read-only TP');
assert.doesNotMatch(chart,/downloadActualChartPng|📷 صورة فعلية/);
assert.match(css,/\.sniper-playbook-steps/,'responsive decision ladder is styled');
assert.match(chart,/playbook\.strengthTitle/,'visible confidence comes from verified evidence grade');
assert.match(chart,/sniper-strength-chip/,'compact on-chart status shows confidence in measured conditions');
assert.match(css,/\.sniper-strength-confirmed/,'technical evidence state is emphasized');
console.log('PASS: honest chart playbook, M5 confirmation, retest, off-zoom TP, stale and no-entry safety');
function testingToBreak(v){return {phase:v.phase,side:v.side,closes:0,
 level:v.level,headline:v.title,detail:v.detail};}
