const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/forecast-motion.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:m,exports:m.exports,require});
const {buildForecastMotion:build,layoutForecastMotion:layout,buildSmoothMotionPath:smooth}=m.exports;
const input={visible:true,side:'BUY',price:100,targets:[{stage:1,price:105},{stage:2,price:108},{stage:3,price:112}],
  breakout:{ready:true,trigger:101,confirmed:false,extension:.5}};
let points=build(input);
assert.equal(points.map(p=>p.kind).join(','),'START,BREAK,TARGET,TARGET,TARGET',
  'M5 is absent: do not draw an invented overshoot and retest');
assert.equal(points[1].price,101,'break level is the actual trigger, not an invented price');
assert.equal(points.slice(-3).map(p=>p.price).join(','),'105,108,112','server objectives remain untouched');
assert.ok(!points.some(p=>p.kind==='STOP'),'invalidation never joins the target route');
points=build({...input,price:102,breakout:{...input.breakout,confirmed:true}});
assert.equal(points.map(p=>p.kind).join(','),'START,TARGET,TARGET,TARGET',
  'a confirmed M5 retest cannot be drawn without authentic completed M5 history');
points=build({...input,price:102});
assert.equal(points.map(p=>p.kind).join(','),'START,TARGET,TARGET,TARGET','unconfirmed trigger behind price is not drawn as a new break');
points=build({...input,breakout:{...input.breakout,trigger:106}});
assert.equal(points.length,4,'activation beyond first target is inconsistent and omitted');
points=build({...input,side:'SELL',targets:[{stage:1,price:95},{stage:2,price:92}],breakout:{...input.breakout,trigger:99}});
assert.equal(points.map(p=>p.kind).join(','),'START,BREAK,TARGET,TARGET',
  'SELL cannot invent upward retest without M5 evidence');
assert.equal(build({...input,visible:false}).length,0,'stale/unavailable plans cannot draw a route');
assert.equal(build({...input,side:'WAIT'}).length,0);
assert.equal(build({...input,targets:[{stage:1,price:99}]}).length,0);
assert.equal(build({...input,price:NaN}).length,0);
assert.equal(build({...input,breakout:{...input.breakout,ready:false}}).length,4,'no invented confirmation without M5 evidence');
const prices=[{key:'NOW',price:100},{key:'BREAK',price:101},{key:'RETEST',price:100.8},{key:'TP1',price:106},{key:'TP2',price:110}];
const mapped=layout(prices,500,750,price=>900-price*3);
assert.equal(mapped[0].x,500);
assert.equal(mapped.at(-1).x,750);
assert.equal(mapped.map(p=>p.price).join(','),'100,101,100.8,106,110',
  'every server target and retest must retain exact original price');
assert.ok(mapped.slice(1).every((p,i)=>p.x>mapped[i].x),
  'projection points always advance on the non-temporal scenario axis');
assert.ok(mapped[3].x-mapped[2].x>mapped[2].x-mapped[1].x,
  'larger real price travel should use more horizontal space');
assert.ok(mapped.every(p=>p.y===900-p.price*3),
  'future and historic candles must share the same vertical price scale');
const spline=smooth(mapped);
assert.ok(spline.startsWith('M 500 ')&&spline.includes(' C '));
assert.ok(spline.endsWith(mapped.at(-1).x+' '+mapped.at(-1).y),
  'smooth dashed line must finish precisely at the actual target');
assert.equal(smooth([{x:5,y:10},{x:5,y:20}]),'',
  'no zero-width or backward-moving projected path');
assert.equal(layout([{key:'BAD',price:NaN}],2,10,p=>p).length,0);
const view=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(view,/layoutForecastMotion\(motion,xf,xr-18,px\)/);
assert.match(view,/buildSmoothMotionPath\(projectedPoints\)/);
assert.match(view,/sniper-actual-to-quote/);
console.log('PASS: price-proportional conditional route, bounded smooth spline and actual M1-to-live quote anchor');

console.log('PASS: conditional buy/sell routes, optional retest, authoritative objectives and no invalidation in target path');
