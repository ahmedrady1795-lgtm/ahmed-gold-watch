const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={},module={exports:out};
const js=ts.transpileModule(fs.readFileSync('lib/sniper-m15-hunt-preview.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
vm.runInNewContext(js,{exports:module.exports,require,Math,Number,Date},{filename:'sniper-m15-hunt-preview.ts'});
const pressure=module.exports.observeM15HuntPressure;
const T=Date.parse('2026-11-02T00:00:00Z'),BAR=900000;
function rising(){
 return Array.from({length:16},(_,i)=>{
  if(i<12)return {time:T+i*BAR,open:100,close:100.05,high:101,low:99};
  const low=100+(i-12)*.06;
  return {time:T+i*BAR,open:low+.15,close:low+.34,high:low+.40,low};
 });
}
const up=rising(),a=pressure(up,1,'WAIT','NONE');
assert.ok(a,'16 contiguous closed M15 bars can be analyzed');
assert.equal(a.earlyPattern,'RISING_BIDS','compression plus rising lows must be visible');
assert.ok(a.compressionPct>=65,'last 4 ranges should be materially tighter than earlier 8');
assert.ok(a.buyPoints>=3&&a.reasons.some(s=>s.includes('انضغاط')));
const down=up.map(b=>({...b,open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high}));
const b=pressure(down,1,'WAIT','NONE');
assert.equal(b.earlyPattern,'FALLING_OFFERS','descending highs should mirror rising lows');
assert.ok(b.sellPoints>=3);
const wide=up.map(b=>({...b}));wide[14].high=105;
assert.equal(pressure(wide,1,'WAIT','NONE').earlyPattern,'NONE',
 'a violent expansion cannot be mislabeled pre-move compression');
const gapped=up.map(b=>({...b}));gapped[8].time+=30000;
assert.equal(pressure(gapped,1,'WAIT','NONE'),null,'gap is not early pressure');
const malformed=up.map(b=>({...b}));malformed[4].low=102;
assert.equal(pressure(malformed,1,'WAIT','NONE'),null,'invalid OHLC never contributes');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const hud=fs.readFileSync('components/SniperM15PreMoveConsole.tsx','utf8');
const overlay=fs.readFileSync('components/SniperM15HuntOverlay.tsx','utf8');
const css=fs.readFileSync('app/workspace.css','utf8');
assert.match(panel,/<SniperM15PreMoveConsole preMove=\{preMove\} hunt=\{huntPreview\}/);
assert.match(panel,/<SniperM15HuntOverlay forecast=\{huntPreview\} proof=\{huntProof\} asset=\{asset\}/);
assert.match(hud,/data-early-stage=\{stage\}/);
assert.match(hud,/p\.marketOpen&&p\.dataFresh&&!p\.providerTransition/);
assert.match(hud,/درجات وصفية وليست نسب نجاح/);
assert.match(hud,/const liveTrigger=premove\?p\.preMove\.trigger:null/);
assert.doesNotMatch(hud,/fetch\(|placeOrder|submitOrder|brokerOrder/);
assert.match(overlay,/M15 · EARLY PATH/);
assert.match(overlay,/No fabricated candle body or tick/);
assert.match(css,/Qannas Early Flow \/ 2026/);
console.log('PASS: causally rising-low/falling-high compression, no forged early move after expansion, clean M15 cockpit, real activation levels');
