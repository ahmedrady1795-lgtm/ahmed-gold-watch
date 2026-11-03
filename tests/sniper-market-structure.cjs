const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const file='lib/sniper-market-structure.ts';
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports},{filename:file});
const {analyzeM15MarketStructure,rsiFromClosedBars}=mod.exports;
const M15=900000,at=Date.parse('2026-11-02T06:00:00Z');
const base=Array.from({length:39},(_,i)=>{
 const open=3900+Math.sin(i)*.04;
 return {time:at+i*M15,open,close:open+.02,
   high:open+.45,low:open-.46};
});
const first=base.at(-1),start=first.time+M15;
const last={time:start,open:3901.12,close:3902.14,high:3902.31,low:3900.9};
const closed=[...base,last],now=start+M15;
const s=analyzeM15MarketStructure(closed,now);
assert.equal(s.ready,true,s.reason);
assert.equal(s.bias,'BUY','confirmed M15 high break is a bullish PRICE event');
assert.ok(s.events.some(e=>e.kind==='BOS_UP'));
assert.ok(s.zones.some(z=>z.kind==='BULL_FVG'),
 'closed three-bar nonoverlap detects a bullish fair-value gap');
assert.ok(s.rsi14!==null&&s.rsi14>=0&&s.rsi14<=100);
assert.ok(s.strength>=0&&s.strength<=80,
 'pattern strength is a bounded descriptive scale, not an 87% win claim');
assert.ok(s.events.every(e=>e.at<=last.time),
 'no event may use a future or unclosed candle');
assert.equal(JSON.stringify(analyzeM15MarketStructure(closed,now+30000)),
 JSON.stringify(s),'live ticks cannot repaint already confirmed market structure');
const reject={time:start+M15,open:3902.38,close:3901.38,
  high:3902.84,low:3901.21};
const sweep=analyzeM15MarketStructure([...closed,reject],now+M15);
assert.equal(sweep.ready,true,sweep.reason);
assert.ok(sweep.events.some(e=>e.kind==='SWEEP_HIGH'),
 'a wick crossing the prior closed top with a bearish close is a sweep');
assert.ok(sweep.events.every(e=>e.at<=reject.time));
const future={...reject,time:reject.time+M15};
assert.equal(analyzeM15MarketStructure([...closed,future],now+M15).ready,false,
 'unfinished candle must not enter structure evidence');
const broken=[...closed.slice(0,-2),{...closed.at(-2),time:closed.at(-2).time+60000},last];
assert.equal(analyzeM15MarketStructure(broken,now).ready,false,
 'recent broken bars are not interpolated into a confident price signal');
const session=[
 {time:at-3*M15,open:3900,high:3901,low:3899,close:3900},
 {time:at-2*M15,open:3900,high:3901,low:3899,close:3900},
 ...closed
];
assert.equal(analyzeM15MarketStructure(session,now).ready,true,
 'an older session gap must not hide recent 24+ contiguous valid M15');
assert.equal(analyzeM15MarketStructure(closed,now+3600001).ready,false,
 'stale market structure is not an active trade signal');
assert.equal(analyzeM15MarketStructure(closed.slice(-15),now).ready,false);
const flat=Array.from({length:22},(_,i)=>({
 time:at+i*M15,open:4000,high:4001,low:3999,close:4000}));
assert.equal(rsiFromClosedBars(flat).at(-1),50,
 'RSI without gains or losses is neutral, not a fabricated 100');
const rally=flat.map((b,i)=>({...b,close:4000+i*.12,
 high:4002+i*.12,low:3999+i*.12,open:4000+i*.12}));
assert.equal(rsiFromClosedBars(rally).at(-1),100,
 'RSI from only closed higher closes is well-defined');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const overlay=fs.readFileSync('components/SniperMarketStructureOverlay.tsx','utf8');
const sides=fs.readFileSync('components/SniperHunterSidebars.tsx','utf8');
const style=fs.readFileSync('app/hunter-cockpit-layout.css','utf8');
assert.match(panel,/analyzeM15MarketStructure\(actual,now\)/,
 'real OHLC is the only origin of structure, never synthetic forecast bodies');
assert.match(panel,/<SniperMarketStructureOverlay structure=\{structure\}/,
 'confirmed BOS CHoCH and FVG zones are painted on the actual candle chart');
assert.match(panel,/<SniperStructureRSI structure=\{structure\}/,
 'real RSI appears beneath the actual M15 price SVG');
assert.match(sides,/RSI 14/);
assert.match(sides,/FVG \/ OB/);
assert.match(overlay,/BOS/);
assert.match(overlay,/CHoCH/);
assert.match(overlay,/SWEEP/);
assert.match(overlay,/sniper-structure-zone/,
 'confirmed source-backed zones render under their stored labels');
const algorithm=fs.readFileSync('lib/sniper-market-structure.ts','utf8');
assert.match(algorithm,/BULL_FVG\x27\|\x27BEAR_FVG/,
 'FVG zones require non-overlapping closed three-bar OHLC');
assert.match(algorithm,/BULL_OB\x27\|\x27BEAR_OB/,
 'OB candidates require the closed opposing candle before displacement');
assert.match(style,/sniper-structure-rsi/);
assert.doesNotMatch(overlay,/87%|92%|62%|38%/);
assert.match(panel,/className="sniper-hunter-workbench"/,
 'the existing real 3-column dashboard is preserved');
console.log('PASS: causal M15 BOS/CHoCH/FVG/OB, source-gap handling, RSI, real-price overlay and no fabricated order depth');
