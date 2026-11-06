const assert=require('node:assert/strict'),fs=require('node:fs');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const map=fs.readFileSync('components/SniperLiquidityDecisionMap.tsx','utf8');
const sidebar=fs.readFileSync('components/SniperHunterSidebars.tsx','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const style=fs.readFileSync('app/m15-chart-clean.css','utf8');

assert.match(panel,/M15 · LEVEL MAP/,'the scenario lane is a price-level map');
assert.match(panel,/<SniperLiquidityDecisionMap watch=\{watchMap\}/,
  'map uses observed M15/H1 levels');
assert.match(panel,/forecast:\[\]/,'synthetic future bars never rescale real candles');
assert.doesNotMatch(panel,/renderedBars\.map|futureCandleWidth|<SniperM15HuntOverlay/,
  'no synthetic future OHLC is painted onto the chart');
assert.match(panel,/const \[showExtra,setShowExtra\]=useState\(false\)/);
assert.match(panel,/sniper-m15-compact-status/,'observed quote stays above the chart');
assert.match(panel,/className="sniper-m15-liquidity-line"/,'source liquidity lines stay visible');
assert.match(panel,/showLiquidity&&positionedLiquidityLabels\.map/);
assert.match(map,/watch\.upper\.slice\(0,2\)/);
assert.match(map,/watch\.lower\.slice\(0,2\)/);
assert.match(map,/ready\?\[/,'stale data cannot display active price levels');
assert.doesNotMatch(map,/\.open\b|\.close\b|\.high\b|\.low\b|ATR|candle\(/,
  'the map consumes historic reference levels, not hypothetical candles');
assert.match(sidebar,/watch\.upper/);
assert.match(sidebar,/watch\.lower/);
assert.doesNotMatch(sidebar,/candles\[2\]|candles\[5\]/,
  'legacy ATR future stations no longer appear as destinations');
const svgEnd=panel.indexOf('     </svg>',panel.indexOf('className="sniper-m15-chart-box"'));
const chartEnd=panel.indexOf('   </div>',svgEnd);
const legend=panel.indexOf('className="sniper-m15-levels-below"',svgEnd);
assert.ok(svgEnd>0&&chartEnd>svgEnd&&legend>chartEnd,
  'legend remains outside clipped SVG');
assert.match(layout,/m15-chart-clean\.css/);
assert.match(style,/\.sniper-m15-level-key\{display:grid/);
console.log('PASS: future candles removed; real-price map, legend and M15 chart retained');
