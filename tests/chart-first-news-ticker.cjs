const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const out={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/news-impact-outlook.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:out});
const classify=out.classifyMacroNews;
assert.equal(classify('CPI inflation report').kind,'DATA');
assert.match(classify('CPI inflation report').higher,/USD ↑ · ذهب ↓/);
assert.match(classify('CPI inflation report').lower,/USD ↓ · ذهب ↑/);
assert.equal(classify('Unemployment Rate').kind,'LABOR_INVERSE');
assert.match(classify('Unemployment Rate').higher,/USD ↓ · ذهب ↑/);
assert.equal(classify('FOMC interest rate decision').kind,'CENTRAL_BANK');
assert.match(classify('FOMC interest rate decision').higher,/تشدد/);
assert.equal(classify('Unknown macro headline').kind,'UNCERTAIN');
assert.match(classify('Unknown macro headline').higher,/↕/);
assert.match(classify('CPI').disclaimer,/BTC/);
const page=fs.readFileSync('app/page.tsx','utf8');
const news=fs.readFileSync('components/NewsCommandCenter.tsx','utf8');
const chart=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.ok(page.indexOf('<NewsCommandCenter')<page.indexOf('<AICommandCenter'),
  'one-line news ticker must appear before the chart');
assert.equal((page.match(/<NewsCommandCenter/g)||[]).length,1);
assert.match(news,/<details className="news-ticker-shell"/);
assert.match(news,/<summary className="news-ticker-line"/);
assert.match(news,/classifyMacroNews\(highlighted\?\.name\)/);
assert.match(news,/outlook\.higher/);
assert.match(news,/outlook\.lower/);
assert.match(news,/remainingAlerts\.map\(/);
assert.match(chart,/sniper-price-snapshot/);
assert.match(chart,/sniper-evidence-drawer/);
assert.match(chart,/sniper-chart-legend-drawer/);
assert.match(chart,/const W=mobile\?650:1440/,
  'new mobile SVG expands chart label readability without second screens');
assert.match(chart,/const candleWidth=clamp\(stride\*\.73/);
assert.match(css,/\.news-ticker-line\{display:flex/);
assert.match(css,/white-space:nowrap/);
assert.match(css,/\.compact-sniper \.forecast-visual-svg\{width:100%;min-width:0;height:auto\}/);
assert.match(css,/\.sniper-price-snapshot/);
console.log('PASS: one-line conditional macro ticker, visible full-size candle chart and optional deep analysis');
