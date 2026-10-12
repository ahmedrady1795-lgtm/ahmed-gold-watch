const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('instrumentation.ts','utf8');
const route=fs.readFileSync('app/api/ai-analysis/route.ts','utf8');
assert.match(worker,/\/api\/ai-analysis\?worker=1/,'background fetch must identify worker mode');
assert.match(worker,/AbortSignal\.timeout\(50000\)/,'slow background requests have a bounded 50s deadline');
assert.doesNotMatch(worker,/setInterval\(\(\)=>\{void tick\(\);\},30000\)/,
  'heavy market analysis must not schedule overlapping fixed-interval invocations');
assert.match(worker,/if\(running\)return;/,'worker must prevent overlapping cycles');
assert.match(worker,/schedule\(succeeded\?Math\.max\(2000,30000-duration\):Math\.max\(15000,45000-duration\)\)/,
  'worker must back off after a failed cycle');
assert.match(route,/if\(analysisBusy\)\{/,'any running analysis must block concurrent heavy calculations');
assert.match(route,/busy-no-snapshot/,'old snapshots must fail closed during a long-running analysis');
console.log('PASS: serial bounded worker, explicit worker mode, no overlapping AI computations');
