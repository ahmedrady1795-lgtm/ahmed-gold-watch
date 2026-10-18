const assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
const page=fs.readFileSync('app/page.tsx','utf8');
const news=fs.readFileSync('components/NewsCommandCenter.tsx','utf8');
const metadata=fs.readFileSync('app/layout.tsx','utf8');
assert.equal((ui.match(/className="sniper-price-snapshot-live"/g)||[]).length,0,
  'chart already displays quote: do not repeat the same live quote below the map');
assert.equal((ui.match(/className="render-target-panel"/g)||[]).length,0,
  'duplicated target cards and unvalidated arrival ranges must not use dashboard space');
assert.equal((ui.match(/<div className="forecast-visual-legend"/g)||[]).length,1,
  'one optional full legend only');
assert.equal((ui.match(/className="sniper-chart-key"/g)||[]).length,1,
  'one concise key beside the chart');
assert.match(ui,/showAlternatives&&!routeVisible&&\(\['BUY','SELL'\] as const\)/,
  'alternative BUY/SELL curves must stay hidden when the realistic target candle route is visible');
assert.match(ui,/setShowAlternatives\(v=>!v\)/,
  'alternative scenario paths stay available upon explicit user action');
assert.match(ui,/className="sniper-evidence-drawer"/,
  'no disappearance of detailed market indicator analysis');
assert.ok(ui.indexOf('className="sniper-data-health"')>ui.indexOf('className="sniper-evidence-drawer"'),
  'the detailed data health readout is within the deep-analysis drawer');
assert.match(page,/<NewsCommandCenter now=\{now\}/);
assert.ok(page.indexOf('<NewsCommandCenter')<page.indexOf('<AICommandCenter'),
  'the news ticker remains a compact first row above the chart');
assert.match(news,/className="news-ticker-shell"/);
assert.match(css,/QANNAS 2026 terminal/);
assert.match(css,/\.compact-sniper \.forecast-chart-tools button\[aria-pressed=true\]/);
assert.match(css,/\.compact-sniper \.forecast-visual-shell/);
assert.match(metadata,/القناص \| Qannas Trading Terminal/);
console.log('PASS: modern single-chart terminal, deduplicated quote/TP cards and opt-in conditional routes');
