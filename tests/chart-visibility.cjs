const assert=require('node:assert/strict');
const fs=require('node:fs');
const page=fs.readFileSync('app/page.tsx','utf8');
const map=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.doesNotMatch(page,/import TradingViewGold|<TradingViewGold\s*\/>/,
  'remove only the secondary embedded TradingView chart');
assert.match(page,/<AICommandCenter/,'keep the primary sniper movement chart');
assert.match(page,/chartData=\{chartData\}/,'keep independent market candle data');
assert.match(map,/<svg ref=\{chartSvgRef\}/,'preserve native sniper SVG illustration and native PNG export');
assert.match(map,/forecast-visual-svg-zoomed/,'preserve optional chart zoom');
assert.match(css,/\.compact-sniper \.forecast-visual-svg\{width:100%;min-width:0;height:auto\}/,
  'primary chart still fits on mobile');
const panels=(map.match(/<section className="sniper-audit-panel/g)||[]).length;
assert.equal(panels,1,'show a single compact audit summary, not two repeated target grids');
assert.match(map,/سيناريوهات الدخول المؤهلة/,'keep qualified scenario count visible');
assert.match(map,/الرصد الهيكلي للأهداف البعيدة/,'keep structural watch history visible');
assert.doesNotMatch(map,/مراقبة الأهداف الفعلية|ذاكرة القناص · نتائج الأهداف البعيدة/,
  'remove the duplicated full-size scorecards');
assert.match(css,/\.sniper-audit-summary-grid/,'compact responsive summary is styled');
console.log('PASS: no secondary chart; native sniper market chart and mobile styles intact');
