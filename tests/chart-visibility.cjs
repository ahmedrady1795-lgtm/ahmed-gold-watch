const assert=require('node:assert/strict');
const fs=require('node:fs');
const page=fs.readFileSync('app/page.tsx','utf8');
const chart=fs.readFileSync('components/TradingViewGold.tsx','utf8');
const map=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(page,/import TradingViewGold from/,'chart component should be imported');
assert.match(page,/<TradingViewGold\s*\/>/,'the live chart must actually mount on the landing page');
assert.match(page,/<AICommandCenter/,'the sniper outlook remains visible');
assert.ok(page.indexOf('<AICommandCenter')<page.indexOf('<TradingViewGold'),
  'sniper movement map must appear above the external chart');
assert.match(chart,/embed-widget-advanced-chart\.js/,'use the TradingView advanced chart');
assert.match(chart,/OANDA:XAUUSD/,'gold symbol preserved');
assert.match(chart,/COINBASE:BTCUSD/,'bitcoin chart available');
assert.match(chart,/href=\{info.url\}/,'provide a direct chart link if embedded content is blocked');
assert.match(map,/forecast-visual-svg-zoomed/,'forecast SVG has a readable optional zoom mode');
assert.match(css,/\.compact-sniper \.forecast-visual-svg\{width:100%;min-width:0;height:auto\}/,
  'chart must fit mobile by default, even under RTL layout');
assert.match(css,/\.compact-sniper \.forecast-visual-svg-zoomed\{min-width:830px\}/,
  'enlarged chart can still scroll for detail');
console.log('PASS: TradingView is mounted, sniper diagram persists, mobile chart fits and zooms');
