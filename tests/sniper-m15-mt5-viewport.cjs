const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const moduleRef={exports:{}};
const code=ts.transpileModule(
 fs.readFileSync('lib/sniper-m15-mt5-viewport.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
vm.runInNewContext(code,{module:moduleRef,exports:moduleRef.exports});
const {compactM15TargetDrawing:compact,mt5M15Viewport:viewport}=moduleRef.exports;
const model=Array.from({length:12},(_,i)=>({
 open:4110+i*.4,close:4110+(i+1)*.4,
 low:4109.6+i*.4,high:4110.6+(i+1)*.4
}));
const extension=Array.from({length:68},(_,i)=>({
 open:model.at(-1).close+i*.6,
 close:model.at(-1).close+(i+1)*.6,
 low:model.at(-1).close+i*.6-.18,
 high:model.at(-1).close+(i+1)*.6+.18
}));
const before=JSON.stringify([...model,...extension]);
const visible=compact([...model,...extension],12,15);
assert.equal(visible.length,27,'do not render 80 impossible-to-read micro-bars');
assert.equal(JSON.stringify(visible.slice(0,12)),JSON.stringify(model),
 'the first 12 scored bars must be exactly unchanged');
assert.equal(visible.at(-1).close,extension.at(-1).close,
 'compact illustration must still reach its original last target');
assert.equal(Math.max(...visible.map(x=>x.high)),Math.max(...[...model,...extension].map(x=>x.high)),
 'aggregated wicks preserve all extrema');
assert.equal(JSON.stringify([...model,...extension]),before,'never mutate frozen candles');
assert.ok(visible.every((x,i)=>x.low>0&&x.high>=Math.max(x.open,x.close)&&
 x.low<=Math.min(x.open,x.close)&&
 (i===0||Math.abs(x.open-visible[i-1].close)<1e-6)));
const base={allLow:4073,allHigh:4162,lastPrice:4112,
 history:model,forecast:model,atr:3};
const focused=viewport({...base,mode:'FOCUS'});
const all=viewport({...base,mode:'ALL'});
assert.ok(focused.zoomed);
assert.equal(all.zoomed,false);
assert.ok(focused.hi-focused.lo<(all.hi-all.lo)*.5,
 'distant TP should not make nearby candles tiny');
assert.ok(focused.lo<=Math.min(...model.map(b=>b.low)));
assert.ok(focused.hi>=Math.max(...model.map(b=>b.high)));
assert.ok(all.lo<4073&&all.hi>4162);
const chart=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(chart,/const \[priceZoom,setPriceZoom\]/);
assert.match(chart,/const viewport=mt5M15Viewport/);
assert.doesNotMatch(chart,/compactM15TargetDrawing\(targetBridge\.bars/,
 'no synthetic target-reaching candle compression in main chart');
assert.match(chart,/const displayBars=shownBars;/,
 'scenario draws only the 12 actual frozen model bars');
assert.match(chart,/className="sniper-m15-zoom-toggle"/);
assert.match(chart,/sniper-m15-offscreen-tp/);
assert.match(chart,/const up=close>=open,color=up\?'#39d6cc':'#fa5970'/,
 'use one MetaTrader-style solid candle fill palette');
assert.doesNotMatch(chart,/fillOpacity=\{future\?/,'all candle bodies are solid');
assert.match(chart,/strokeWidth="1\.15"/,'wick is visible');
assert.match(chart,/const recent=actual\.slice\(-32\)/,'increase per-candle real pane width');
console.log('PASS: MT5-style focus zoom, untouched closed candles and scored forecast, visual TP continuation and far-level labels');
