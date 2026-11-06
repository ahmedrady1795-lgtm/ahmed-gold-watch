const assert=require('node:assert/strict'),fs=require('node:fs');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
assert.match(panel,/M15 · PATH/);
assert.match(overlay,/M15 · PATH \/ WATCH/);
assert.match(panel,/className="sniper-m15-conditional-route"/);
assert.match(panel,/renderedBars\.map\(\(b,i\)=>\[/);
assert.match(overlay,/\(\['BUY','SELL'\] as const\)\.map/);
assert.match(overlay,/polyline points=\{toPoints/);
assert.doesNotMatch(panel,/sniper-m15-projected|futureCandleWidth|M15 · FORECAST/);
assert.doesNotMatch(panel,/renderedBars\.map\(\(b,i\)=>\s*candle\(/);
assert.doesNotMatch(overlay,/drawCandles\(|sniper-hunt-candles/);
assert.match(panel,/trueHistory\.map\(\(b,i\)=>candle\(/,
 'authentic closed M15 OHLC must remain visible');
assert.match(panel,/candle\(forming\.open,forming\.high,forming\.low,forming\.close/,
 'live partial actual M15 candle must remain visible');
assert.match(panel,/forecast:\[\]/,
 'fake future OHLC must not rescale authentic historical candles');
assert.match(panel,/scaleLevels\.filter/,
 'targets and invalidation level rail must remain');
assert.match(overlay,/sniper-hunt-waypoint/,
 'both conditional target stations must remain visible');
assert.match(overlay,/sniper-hunt-pool/,
 'historical liquidity markers must remain');
console.log('PASS: FORECAST and WATCH lanes draw only conditional paths; historical and live real candles remain');
