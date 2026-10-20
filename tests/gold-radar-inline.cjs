const assert=require('node:assert/strict'),fs=require('node:fs');
const radar=fs.readFileSync('components/GoldRadarBadge.tsx','utf8');
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const css=fs.readFileSync('app/gold-sniper-radar.css','utf8');
assert.match(radar,/sniper-gold-radar-widget/,'radar is a persistent screen panel');
assert.match(chart,/<GoldRadarBadge now=\{now\}/,'chart supplies a live clock');
assert.match(chart,/watch=\{watchMap\}/,'radar uses historical watch destinations');
assert.match(radar,/radar\?\.eventAt/,'M1 evidence must retain origin timestamp');
assert.match(radar,/now-eventAt<=115000/,'M1 event cannot remain active forever');
assert.match(radar,/marketFresh&&state\?\.status==='OBSERVING'/,
 'stale quotes cannot advertise a current radar');
assert.match(radar,/radar\?\.phase==='CONFIRMED'/,
 'only closed-bar evidence can express conditional direction');
assert.match(radar,/DOM غير متاح/,'missing MT5 DOM must be disclosed');
assert.match(radar,/لا دخول · انتظار تأكيد/,'WAIT must not look like an order');
assert.match(chart,/strokeDasharray=\{future\?'2 2':undefined\}/,
 'hypothetical M15 candles must not look identical to actual ones');
assert.match(css,/position:absolute/,'radar belongs inside the chart surface');
assert.match(css,/right:18%/,'radar occupies forecast area, not real OHLC');
assert.match(css,/sniper-m15-watch-strip/,'watch levels reserve layout height');
console.log('PASS: visible GOLD on-chart radar with strict source, timestamp, DOM and shadow-candle separation');
