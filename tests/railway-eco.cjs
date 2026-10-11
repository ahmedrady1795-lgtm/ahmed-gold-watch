const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// Evaluate ONLY configuration expressions, never start the infinite worker loops.
const worker=fs.readFileSync('learning-worker.mjs','utf8');
const m=worker.match(/^const intervalMs=(.+);$/m);
assert.ok(m,'AI worker must declare an explicit scheduling expression');
const interval=(env)=>vm.runInNewContext(m[1],{process:{env}});
assert.equal(interval({}),10000,'default heavy analysis refresh must be 10s');
assert.equal(interval({LEARNING_INTERVAL_MS:'3000'}),10000,'legacy Railway value cannot restore 3s refresh');
assert.equal(interval({LEARNING_INTERVAL_MS:'20000'}),20000,'operator may choose a slower refresh');
assert.equal(interval({LEARNING_INTERVAL_MS:'90000'}),60000,'refresh schedule remains bounded');

// Fast paper scalp is intentionally independent of full AI forecasts.
const scalp=worker.match(/^const scalpIntervalMs=(.+);$/m);
assert.ok(scalp,'paper scalp monitor must retain an independent interval');
const scalpInterval=(env)=>vm.runInNewContext(scalp[1],{process:{env}});
assert.equal(scalpInterval({}),5000,'scalp heartbeat must remain at five seconds');
assert.equal(scalpInterval({SCALP_PULSE_INTERVAL_MS:'3000'}),3000);
assert.match(worker,/if\(scalpEnabled\)void scalpLoop\(\)/,'scalp loop is separate from structural worker');

const home=fs.readFileSync('app/page.tsx','utf8');
assert.match(home,/const aiTimer=setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)void loadAi\(\);\},3000\)/,
  'lightweight AI snapshot reads run every three seconds');
assert.match(home,/const clock=setInterval\(\(\)=>setNow\(Date\.now\(\)\),1000\)/,
  'screen clock stays responsive independent of snapshot reads');
assert.match(home,/const restTimer=setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)void loadBtc\(\);\},5000\)/,
  'BTC price stream fallback remains independent');
assert.match(home,/goldTickRef\.current=nextGoldTick/,'gold tick source remains independent');
console.log('PASS: Railway ECO analysis 10s, snapshots 3s, paper scalp 5s, real-time ticks intact');
