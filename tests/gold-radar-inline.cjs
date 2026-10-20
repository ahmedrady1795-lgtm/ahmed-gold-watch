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
assert.match(chart,/className=\{future\?'sniper-m15-projected':'sniper-m15-real'\}/,
 'conditional M15 candles remain separately classed from observed candles');
assert.match(chart,/أول 12 شمعة للتقييم · الامتداد عرض تاريخي غير مُقيّم/,
 'natural frozen M15 candles are separated from distant unverified watch goals');
assert.match(css,/position:relative;z-index:2/,'gold radar is inline and cannot hide candlesticks');
assert.doesNotMatch(css,/right:18%;width:150px/,'radar no longer overlays the M15 price pane');
assert.match(css,/width:100%;max-height:none;overflow:visible/,'expanded radar uses normal layout');
assert.ok(chart.indexOf('<GoldRadarBadge now={now}')<chart.indexOf('className="sniper-m15-chart-box"'),
 'radar expands ABOVE chart rather than on top of LIVE and future candles');
assert.match(css,/sniper-m15-watch-strip/,'watch levels reserve layout height');
console.log('PASS: visible GOLD on-chart radar with strict source, timestamp, DOM and shadow-candle separation');
