const assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
const ensure=(pattern,label)=>assert.match(ui,pattern,label);
ensure(/<details className="sniper-chart-analysis-drawer">/,
 'expanded research must not push the real candle chart below multiple rows by default');
ensure(/<summary>[\s\S]*?playbook\.title/,
 'essential sniper and M5 status stays glanceable in collapsed summary');
ensure(/className="forecast-visual-chart-scroll"/,'native chart remains the main visible surface');
ensure(/chartBands\.filter\(z=>px\(z\.price\)>=yt\+8&&px\(z\.price\)<=yb-8\)/,
 'offscreen objectives cannot stack on a visible price label');
ensure(/Math\.min\(chartWindow,mobile\?24:36\)/,
 'real closed mobile candles retain legible bodies');
ensure(/candleWidth=clamp\(stride\*\.46,3,9\)/,
 'small, price-true candlestick bodies resemble a professional MT5/TradingView chart');
ensure(/latest=i===candles\.length-1/,'most recent real OHLC receives separate visual emphasis');
const future=ui.slice(ui.indexOf('{visualCandles.map((c,i)=>{'),ui.indexOf('{ghostRangeVisible&&<g'));
assert.match(future,/const body=candleBodyGeometry\(px\(c\.open\),px\(c\.close\)\)/,
 'future OHLC share the real-candle body geometry helper');
assert.match(future,/height=\{body\.height\} rx="\.35" fill=\{color\}/,
 'future candle bodies have exactly the same solid-body dimensions as real M1');
assert.match(ui,/\{candles\.map\(\(c,i\)=>\{[\s\S]*?const body=candleBodyGeometry\(px\(c\.open\),px\(c\.close\)\)/,
 'actual M1 bodies use the same price-space helper');
assert.doesNotMatch(future,/fillOpacity|strokeDasharray|opacity=/,
 'future OHLC uses solid bodies and continuous wicks without ghost transparency');
assert.match(future,/strokeWidth="1\.5"/,'future wicks match regular historical wicks');
ensure(/forecast-ghost-surface/,'forecast lane has its own background');
ensure(/<g className="sniper-breakout-explainer"/,'breakout explanation remains on the actual SVG');
ensure(/<g className="sniper-live-price-arrow"/,'genuine live source quote remains on the SVG');
ensure(/watchTargets/,'real historical TP watch remains');
ensure(/sniper-market-evidence-rail/,'BTC Delta and POC can still be inspected');
ensure(/primaryLiquidityZone/,'zone priority evidence stays');
ensure(/<svg className=/,'user retains real in-app chart');
assert.doesNotMatch(ui,/downloadActualChartPng|📷 صورة فعلية/,
 'user specifically removed screenshot export');
assert.match(css,/\.sniper-chart-analysis-drawer>summary/);
assert.match(css,/\.compact-sniper \.forecast-visual-svg/);
assert.match(css,/@media\(max-width:760px\)/);
console.log('PASS: chart-first compact cockpit, real/illustrative candle separation, mobile clarity, breakout/TP/liquidity intact');
