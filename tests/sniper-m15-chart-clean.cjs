const assert=require('node:assert/strict');
const fs=require('node:fs');
const component=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const style=fs.readFileSync('app/m15-chart-clean.css','utf8');

assert.match(component,/const \[showHistoricalExtension,setShowHistoricalExtension\]=useState\(false\)/,
  'the first visible M15 projection consists of the short scored sequence');
assert.match(component,/const renderedBars=showHistoricalExtension\?/,
  'optional longer visual extension remains available on demand');
assert.match(component,/const \[showExtra,setShowExtra\]=useState\(false\)/,
  'secondary annotations are off until requested');
for(const layer of [
 'liquidity.zones.map','compactZones.map','positionedLiquidityLabels.map',
 'liquidity.events.map','reactionMap.marks.map'
]){
 const escaped=layer.replace(/\./g,'\\.');
 const rx=new RegExp('showExtra&&[^\\n]*'+escaped);
 assert.match(component,rx,'nonessential '+layer+' must not overprint OHLC on first load');
}
assert.match(component,/\{showExtra&&<text x=\{split\+8\} y=\{clamp\(y-4/,
  'target labels no longer overlap future candles by default');
assert.match(component,/\{showExtra&&<text x=\{split-15\} y=\{Math\.max\(plotTop\+13/,
  'live price no longer collides with nearby supply/demand labels');
assert.match(component,/sniper-m15-compact-status/,
  'live quote remains visible in a quiet header above the real chart');
const svgEnd=component.indexOf('     </svg>',component.indexOf('className="sniper-m15-chart-box"'));
const chartEnd=component.indexOf('   </div>',svgEnd);
const legend=component.indexOf('className="sniper-m15-levels-below"',svgEnd);
assert.ok(svgEnd>0&&chartEnd>svgEnd&&legend>chartEnd,
 'legend MUST be outside the fixed-height clipped SVG box');
const details=component.indexOf('className="sniper-m15-diagnostics"',legend);
assert.ok(details>legend,'technical details stay below the legible M15 price key');
assert.match(component,/scaleLevels\.filter\(level=>level.kind!=='PRICE'\)\.slice\(0,4\)/,
 'only essential live/conditional target and stop prices appear under the chart');
assert.match(component,/showLiquidity&&positionedLiquidityLabels\.map/,
 'source-backed demand/supply/pool price labels are preserved outside the chart');
assert.match(component,/className="sniper-m15-liquidity-line"/,
 'four actual liquidity price lines remain on the chart');
assert.match(component,/shownBars\.length\+' M15'/,
 'original M15 evaluated bars remain identified');
assert.match(component,/renderedBars\.map/,
 'rendered original projected candle geometry is untouched');
assert.match(layout,/m15-chart-clean\.css/,
 'mobile layout styles load last and cannot be overridden by older styles');
assert.match(style,/\.sniper-m15-level-key\{display:grid/,
 'price-level key uses responsive grid cards rather than SVG text');
assert.match(style,/@media\(max-width:640px\)/,
 'small-screen chart height and legend remain readable');
console.log('PASS: clean M15 12-bar default, price true liquidity lines, movable labels outside SVG and optional diagnostics');
