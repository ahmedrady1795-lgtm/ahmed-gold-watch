const assert=require('node:assert/strict'),fs=require('node:fs'),
  ts=require('typescript'),vm=require('node:vm');
function load(path,deps={}){
  const mod={exports:{}};
  const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  vm.runInNewContext(js,{module:mod,exports:mod.exports,
    require:id=>{if(!(id in deps))throw Error('unexpected import '+id);return deps[id]}});
  return mod.exports;
}
const guide=load('lib/sniper-m15-watch-guide.ts');
const hunt=load('lib/sniper-m15-hunt-preview.ts');
const t0=Date.parse('2026-11-06T00:00:00Z'),M15=900000;
const trend=(sign)=>Array.from({length:24},(_,i)=>{
  const open=4100+sign*i*.25,close=open+sign*.15;
  return {time:t0+i*M15,open,close,high:Math.max(open,close)+.19,
    low:Math.min(open,close)-.19};
});
const bullish=trend(1),bearish=trend(-1),now=bullish.at(-1).time+M15;
const upGuide=guide.buildM15WatchGuide(bullish,now);
const dnGuide=guide.buildM15WatchGuide(bearish,now);
assert.equal(upGuide.ready,true);
assert.equal(dnGuide.ready,true);
const up=hunt.buildM15HuntPreview(bullish,upGuide,now);
const down=hunt.buildM15HuntPreview(bearish,dnGuide,now);
assert.equal(up.preferred,'BUY');
assert.equal(down.preferred,'SELL');
assert.equal(up.observation?.notTradeSignal,true);
assert.equal(down.observation?.notTradeSignal,true);
assert.ok(up.observation.buyPoints>up.observation.sellPoints);
assert.ok(down.observation.sellPoints>down.observation.buyPoints);
assert.ok(up.observation.reasons.length>=2);
assert.equal(up.buy.length,6,'keep old six-candle what-if up route');
assert.equal(up.sell.length,6,'keep old six-candle what-if down route');
const noGate=hunt.buildM15HuntPreview(bullish,
  {...upGuide,bias:'WAIT'},now);
assert.ok(['BUY','SELL'].includes(noGate.preferred),
 'WATCH must still choose a research preference without certified trade');
assert.equal(noGate.buy.length,6);
assert.equal(noGate.sell.length,6);
assert.deepEqual(
 JSON.parse(JSON.stringify(hunt.buildM15HuntPreview(bullish,upGuide,now+12000))),
 JSON.parse(JSON.stringify(up)),
 'quote ticks cannot repaint 16 fully closed M15 observations');
const max=Math.max(...bullish.slice(-13,-1).map(b=>b.high));
const rejection=bullish.map(b=>({...b}));
rejection[rejection.length-1]={...rejection.at(-1),
 open:max+.06,high:max+.28,low:max-.29,close:max-.06};
const rg=guide.buildM15WatchGuide(rejection,now);
const rev=hunt.buildM15HuntPreview(rejection,rg,now);
assert.equal(rev.sweep,'HIGH_REJECTION');
assert.equal(rev.preferred,'SELL',
 'confirmed stop-run/rejection overrides slower trend');
assert.ok(rev.observation.reasons.some(s=>s.includes('سحب قمة')));
const gapped=bullish.map(b=>({...b}));gapped[gapped.length-2].time+=60000;
assert.equal(hunt.observeM15HuntPressure(gapped,1,'WAIT','NONE'),null,
 'gapped candles cannot be treated as independent fresh evidence');
assert.equal(hunt.buildM15HuntPreview(gapped,upGuide,now).ready,false,
 'preserve original source data validity constraint');
assert.equal(hunt.buildM15HuntPreview(bullish,{...upGuide,ready:false},now).ready,false,
 'an unverified market tape must never look live');
const hud=fs.readFileSync('components/SniperHuntHUD.tsx','utf8');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
const css=fs.readFileSync('app/smart-money-hunter.css','utf8');
assert.match(hud,/راصد M15/);
assert.match(hud,/تعارض اتجاه M1 مع M15/);
assert.match(css,/\.sniper-hunt-hud-observation/);
assert.match(panel,/buildM15HuntPreview\(actual,watchGuide,now\)/);
assert.match(panel,/<SniperM15HuntOverlay forecast=\{huntPreview\}/);
assert.match(overlay,/M15 · PATH \/ WATCH/)
assert.match(overlay,/polyline points=\{toPoints/);
assert.doesNotMatch(overlay,/drawCandles\(|sniper-hunt-candles/)
console.log('PASS: active multi-factor M15 watch with both old routes, structural sweep and data-integrity tests');
