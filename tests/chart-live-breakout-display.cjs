const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
const page=fs.readFileSync('app/page.tsx','utf8');
assert.match(ui,/const priceFresh=m\.price!=null&&sn\.view\.priceFresh&&!goldClosed/,
 'a genuinely fresh Coinbase price remains visible independently of AI snapshot status');
assert.match(ui,/const quoteAgeSec=sn\.view\.sourceAgeSeconds/,
 'live indicator carries the actual age of the quote source');
assert.match(ui,/sniper-live-price-arrow/,'current-quote arrow is visible on the live chart');
assert.match(ui,/BTC LIVE/,'clearly distinguish live BTC from illustrative candles');
assert.match(ui,/sniper-breakout-explainer/,'closed-candle breakout guide appears on the SVG');
assert.match(ui,/breakoutWatch\.headline/,'explain actual confirmation stage');
assert.match(ui,/breakoutWatch\.closes\+'\/2 إغلاق M5/,
 'show concrete M5 close count on chart');
assert.match(ui,/breakoutUp=breakoutEvidence\.ready/,
 'show up/down M5 levels when verified');
assert.match(ui,/sourceReady:sn\.view\.priceFresh&&m\.historyFresh/,
 'technical breakout does not require fresh AI inference or an audited trade');
assert.match(ui,/!planVisible&&!ghostActive&&!breakoutEvidence\.ready/,
 'generic waiting overlay cannot cover genuine breakout explanation');
assert.match(page,/const btcDirectFresh=btc!=null&&Number\.isFinite\(btc\)/,
 'browser quote source must be validated');
assert.match(page,/btcAiFresh\?btcAiPrice/,
 'newer fallback quote must not be hidden by a stale browser tick');
assert.match(page,/shownBtcAt=btcDirectFresh\?btcAt:btcAiFresh\?aiBtcAt/,
 'quote/source timestamps must come from the same feed');
assert.doesNotMatch(ui,/downloadActualChartPng|📷 صورة فعلية/);
const exports_={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-decision-guide.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:exports_});
const guide=exports_.buildBreakoutGuide,now=Date.parse('2026-10-17T10:00:00Z');
const bars=Array.from({length:27},(_,i)=>({
 time:now-(27-i)*300000,open:100,high:101,low:99,close:100
}));
let x=guide({now,frames:{m5:bars},side:'WAIT',price:100,sourceReady:true});
assert.equal(x.ready,true,'price breakout watch remains available when execution side is WAIT');
assert.equal(x.trigger,null,'do not create an entry trigger during WAIT');
assert.ok(x.above>101&&x.below<99,'M5 structural levels remain visible');
x=guide({now,frames:{m5:bars},side:'WAIT',price:100,sourceReady:false});
assert.equal(x.ready,false,'no breakout text claims levels when actual market data is stale');
console.log('PASS: BTC true live quote/age and price arrow, M5 breakout explanation independent of AI and entry gates');
