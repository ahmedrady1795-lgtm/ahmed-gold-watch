const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/forecast-motion.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:m,exports:m.exports,require});
const build=m.exports.buildForecastMotion;
const input={visible:true,side:'BUY',price:100,targets:[{stage:1,price:105},{stage:2,price:108},{stage:3,price:112}],
  breakout:{ready:true,trigger:101,confirmed:false,extension:.5}};
let points=build(input);
assert.equal(points.map(p=>p.kind).join(','),'START,BREAK,HOLD,RETEST,TARGET,TARGET,TARGET');
assert.equal(points[3].price,101,'retest is the actual trigger, not an invented price');
assert.equal(points.slice(-3).map(p=>p.price).join(','),'105,108,112','server objectives remain untouched');
assert.ok(!points.some(p=>p.kind==='STOP'),'invalidation never joins the target route');
points=build({...input,price:102,breakout:{...input.breakout,confirmed:true}});
assert.equal(points.map(p=>p.kind).join(','),'START,RETEST,TARGET,TARGET,TARGET');
points=build({...input,price:102});
assert.equal(points.map(p=>p.kind).join(','),'START,TARGET,TARGET,TARGET','unconfirmed trigger behind price is not drawn as a new break');
points=build({...input,breakout:{...input.breakout,trigger:106}});
assert.equal(points.length,4,'activation beyond first target is inconsistent and omitted');
points=build({...input,side:'SELL',targets:[{stage:1,price:95},{stage:2,price:92}],breakout:{...input.breakout,trigger:99}});
assert.equal(points[2].price,98.5);assert.equal(points[3].price,99,'bear path includes upward optional retest');
assert.equal(build({...input,visible:false}).length,0,'stale/unavailable plans cannot draw a route');
assert.equal(build({...input,side:'WAIT'}).length,0);
assert.equal(build({...input,targets:[{stage:1,price:99}]}).length,0);
assert.equal(build({...input,price:NaN}).length,0);
assert.equal(build({...input,breakout:{...input.breakout,ready:false}}).length,4,'no invented confirmation without M5 evidence');
console.log('PASS: conditional buy/sell routes, optional retest, authoritative objectives and no invalidation in target path');
