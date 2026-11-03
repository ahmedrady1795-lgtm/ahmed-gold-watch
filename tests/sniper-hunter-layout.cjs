const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const source=fs.readFileSync('components/SniperHunterSidebars.tsx','utf8');
const transpiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX
}}).outputText;
const exports={},mod={exports};
vm.runInNewContext(transpiled,{
  module:mod,exports:mod.exports,
  require:id=>{
    if(id==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null,Fragment:()=>null};
    throw Error('Unexpected dynamic module: '+id);
  }
},{filename:'components/SniperHunterSidebars.tsx'});
const {closedM15PriceActivity}=mod.exports;
const start=Date.parse('2026-11-03T05:00:00Z'),T=900000;
const bars=Array.from({length:40},(_,i)=>{
  const open=3950+Math.sin(i/5)*4,close=open+.3;
  return {time:start+i*T,open,close,high:open+1.2,low:open-1.1};
});
const profile=closedM15PriceActivity(bars,3952,11);
assert.equal(profile.length,11);
assert.ok(profile.some(b=>b.touches>0));
assert.ok(profile.every(b=>Number.isFinite(b.at)&&b.touches>=0&&b.touches<=40));
assert.ok(profile[0].at>profile.at(-1).at);
assert.equal(closedM15PriceActivity(bars.slice(0,6),3952,11).length,0,
 'insufficient observed closed M15 candles must not produce a synthetic profile');
assert.equal(closedM15PriceActivity(bars,null,11).length,0);
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
const css=fs.readFileSync('app/hunter-cockpit-layout.css','utf8');
const root=fs.readFileSync('app/layout.tsx','utf8');
const page=fs.readFileSync('app/page.tsx','utf8');
const sidebars=fs.readFileSync('components/SniperHunterSidebars.tsx','utf8');
const chartIndex=panel.indexOf('className="sniper-m15-chart-box"');
const startIndex=panel.indexOf('className="sniper-hunter-workbench"');
const liquidityIndex=panel.indexOf('<SniperLiquidityColumn ');
const centerIndex=panel.indexOf('className="sniper-hunter-center"');
const scenarioIndex=panel.indexOf('<SniperScenarioColumn ');
const endIndex=panel.indexOf('className="sniper-hunter-bottom"');
const m1Index=panel.indexOf('<SniperM1CandleTape ',endIndex);
assert.ok(0<startIndex&&startIndex<liquidityIndex&&liquidityIndex<centerIndex&&
 centerIndex<chartIndex&&chartIndex<scenarioIndex&&scenarioIndex<endIndex&&endIndex<m1Index,
 'real M15 chart has left price-activity and right scenario sidebars, with M1 RESULTS visible below');
assert.match(panel,/chartMode==='M1'\?<SniperM1CandleHunter/);
assert.match(panel,/<SniperM15HuntOverlay forecast=\{huntPreview\}/,
 'actual M15 conditional candles must remain on the live chart');
assert.match(panel,/className="sniper-m15-diagnostics"/,
 'detailed engine readings remain accessible but below the cockpit');
assert.match(sidebars,/ليس دفتر أوامر/,
 'profile must not be sold as real L2/order book');
assert.match(sidebars,/محطات محاكاة ATR/,
 'simulated target stations are not implied live executions');
assert.match(sidebars,/مستويات مستنتجة/,
 'liquidity clues are observed price zones not hidden institutional accounts');
assert.doesNotMatch(sidebars,/87%|62%|38%|14 صفقة|ربح اليوم/,
 'image mock-up wins and probabilities must not be inserted as real facts');
assert.match(css,/grid-template-columns:minmax\(160px,\.74fr\)/);
assert.match(css,/@media\(max-width:1100px\)/);
assert.match(css,/@media\(max-width:640px\)/);
assert.match(css,/\.sniper-hunter-center\{order:0\}/,
 'mobile displays true M15 chart before secondary panels');
assert.match(root,/hunter-cockpit-layout\.css/);
assert.match(page,/AICommandCenter assetView="ALL"/,
 'production homepage continues to mount the same real chart data flow');
console.log('PASS: production three-column dashboard with actual market data, always-visible M1 tape, responsive chart-first mobile and no fictional PnL');
