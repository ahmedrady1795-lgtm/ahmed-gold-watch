const assert=require('node:assert/strict');
const fs=require('node:fs');
const page=fs.readFileSync('app/page.tsx','utf8');
const map=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.doesNotMatch(page,/import TradingViewGold|<TradingViewGold\s*\/>/,
  'remove only the secondary embedded TradingView chart');
assert.match(page,/<AICommandCenter/,'keep the primary sniper movement chart');
assert.match(page,/chartData=\{chartData\}/,'keep independent market candle data');
assert.match(map,/<svg className=/,'preserve native sniper SVG illustration');
assert.match(map,/forecast-visual-svg-zoomed/,'preserve optional chart zoom');
assert.match(css,/\.compact-sniper \.forecast-visual-svg\{width:100%;min-width:0;height:auto\}/,
  'primary chart still fits on mobile');
console.log('PASS: no secondary chart; native sniper market chart and mobile styles intact');
