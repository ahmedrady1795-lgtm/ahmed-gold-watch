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
assert.equal(confirmed.actionable,false,'confirmed breakout alone is not a trade');
const qualified=build({...base,planReady:true,planSide:'BUY'});
assert.equal(qualified.phase,'QUALIFIED');assert.equal(qualified.actionable,false);
const conflict=build({...base,observation:{status:'CONFLICT',side:'WAIT',m1Side:'SELL',m5Side:'BUY'}});
assert.equal(conflict.phase,'CONFLICT');assert.equal(conflict.side,'WAIT');
assert.equal(conflict.targets.length,0,'opposed frames do not promote an objective as directional');
const stale=build({...base,historyFresh:false,breakout:{...testingToBreak(testing),phase:'M5_CONFIRMED',closes:2}});
assert.equal(stale.phase,'PAUSED');assert.equal(stale.level,null);assert.equal(stale.retest,null);
assert.equal(stale.targets.length,0);
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
console.log('PASS: honest chart playbook, M5 confirmation, retest, off-zoom TP, stale and no-entry safety');
function testingToBreak(v){return {phase:v.phase,side:v.side,closes:0,
 level:v.level,headline:v.title,detail:v.detail};}
