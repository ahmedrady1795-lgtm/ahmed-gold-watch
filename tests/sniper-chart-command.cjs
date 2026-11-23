const assert=require('node:assert/strict');
const fs=require('node:fs');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const early=fs.readFileSync('components/EarlyMoveAlert.tsx','utf8');
const css=fs.readFileSync('app/qannas-chart-focus.css','utf8');
const startup=fs.readFileSync('scripts/start-with-audit-archive.mjs','utf8');
assert.match(panel,/data-qannas-chart-signal=\{commandState\}/,
 'main BUY/SELL and WATCH must appear in the chart itself');
assert.match(panel,/const commandConfirmed=commandLive&&[\s\S]{0,160}quality==='SETUP'/,
 'only original qualified breakout can be called BUY/SELL');
assert.match(panel,/const commandM1=commandLive&&movementSignal\.phase==='PREPARE'/,
 'prospective early record can be a WATCH only');
assert.match(panel,/const commandM5=commandLive&&!commandM1&&cuePrebreak/,
 'independent genuine M5 prebreak is preserved');
assert.match(panel,/movementSignal\.trigger>price:movementSignal\.trigger<price/,
 'watch trigger must remain ahead of real current price');
assert.match(panel,/data-qannas-chart-side=\{commandSide\}/,
 'chart direction must be explicit and testable');
assert.match(panel,/<EarlyMoveAlert key=\{asset\}[\s\S]{0,120}compact\/>/,
 'server early radar must move inside tiny chart rail');
assert.doesNotMatch(panel,/<SniperM15PreMoveConsole\b/,
 'large standalone LOCAL AI and liquidity radar may not clutter the page');
assert.doesNotMatch(panel,/sniper-intelligence-drawer/,
 'large duplicate intelligence deck was removed');
assert.match(panel,/<details className="sniper-m15-levels-below"/,
 'secondary levels stay available but collapsed');
assert.match(early,/if\(compact\)return null/,
 'radar data feed should have no independent visible card in chart-only mode');
assert.match(panel,/data-qannas-chart-early=\{leadVerified\?'DEPTH_WATCH':'PRICE_WATCH'\}/,
 'genuine prebreak lead remains visible within real chart with correct source');
assert.match(early,/onSignal\?\.\(next\)/,
 'compact radar must forward only observed packets into in-chart markers');
assert.match(css,/sniper-m15-chart-box \.sniper-chart-command\{/,
 'chart sidebar must have a dedicated responsive overlay');
assert.match(startup,/await Promise\.all\(\[restoreSniperArchive\(\),restoreScalpArchive\(\)\]\)/,
 'independent remote archive restores should run in parallel before server starts');
assert.ok(startup.indexOf('await Promise.all([restoreSniperArchive(),restoreScalpArchive()]);')<
 startup.indexOf("const child=spawn('npm',['start']"),
 'never start analysis before saved result histories were restored');
console.log('PASS chart-only prospective BUY/SELL rail, hidden details, safe fast parallel startup');
