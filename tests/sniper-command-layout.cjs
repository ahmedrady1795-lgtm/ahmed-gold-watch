const assert=require('node:assert/strict'),fs=require('node:fs');
const page=fs.readFileSync('app/page.tsx','utf8');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const command=fs.readFileSync('components/AICommandCenter.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(page,/className="sniper-home-head"/,'single visible Qannas masthead');
assert.match(page,/href="#market-forecast"/,'jump to actual M1 chart');
assert.match(page,/href="#sniper-performance"/,'jump to TP scorecard');
assert.match(page,/href="#market-news"/,'news remains accessible');
assert.ok(page.indexOf('<AICommandCenter')<page.indexOf('<NewsCommandCenter'),
 'chart-first surface precedes optional macro ticker');
assert.equal((page.match(/<NewsCommandCenter/g)||[]).length,1,'no duplicate calendar');
const strip=chart.slice(chart.indexOf('className="sniper-decision-strip'),chart.indexOf('className={\'forecast-visual-layout'));
for(const token of ['sniper-action-primary','sniper-action-cell','quickDecision','quickDirection','quickTrigger','breakoutWatch.closes'])
 assert.ok(strip.includes(token),'decision glance surface preserves '+token);
assert.match(chart,/quickSide=feedProblem\|\|providerTransition\?'WAIT'/,
 'never claim a current buy/sell bias on stale or crossing exchange sources');
assert.match(chart,/quickTrigger=feedProblem\|\|providerTransition\?null/,
 'never suggest a live trigger from an obsolete feed');
assert.match(chart,/statusReady\?'خطة مسجلة'/,
 'qualified entries distinguished from observation-only paths');
assert.match(chart,/لا يوجد أمر دخول معتمد/,
 'monitoring is explicitly not a trade authorization');
assert.match(chart,/<details className="sniper-more-chart-tools">/,
 'secondary tools do not crowd the chart by default');
assert.match(chart,/className="sniper-btc-forecast-summary"/,
 'BTC forecast shows one-line direction/target summary');
assert.match(chart,/<details className="sniper-route-research">/,
 'audit and far levels stay inspectable without burying chart');
assert.match(chart,/className="sniper-provider-transition"/,
 'source handoff is never silently hidden in a closed panel');
assert.match(chart,/id="sniper-performance"/,'record of TP outcomes stays accessible');
assert.match(chart,/buildConditionalTargetCandles\(/,'original goal OHLC scenario still exists');
assert.match(chart,/targetRoute!\.outcome===\x27AMBIGUOUS\x27/,
 'simultaneous TP/SL guard still visible in audit');
assert.match(command,/sniper-system-notice/,'one clear warning instead of stacked alarms');
assert.match(css,/\.sniper-action-dashboard/,'four-part decision responsive layout styled');
assert.match(css,/\.sniper-more-chart-tools-body/,'secondary tools have a discoverable menu');
assert.match(css,/\.sniper-route-research/,'route audit disclosure has deliberate hierarchy');
assert.match(css,/@media\(max-width:760px\)/,'mobile access remains available');
console.log('PASS: confident chart-first Qannas layout, compact diagnostics, unbiased trading gates intact');
