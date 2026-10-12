const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});return out;}
const {indicators}=load('lib/engine.ts'),{frameVote}=load('lib/ai-analyst.ts'),{buildMultiBrainCore}=load('lib/multi-brain-core.ts');
const flat=Array.from({length:300},(_,i)=>({time:i*60000,open:100,high:101,low:99,close:100}));
assert.equal(frameVote(indicators(flat),100).bias,'WAIT','Equal EMAs and flat price cannot create a sell vote');
assert.equal(frameVote({...indicators(flat),ema200:NaN},100).bias,'WAIT');
assert.equal(frameVote(indicators(flat),null).bias,'WAIT');
assert.equal(indicators(flat.slice(0,15)).atr,2,'ATR available after 14 price transitions');
assert.equal(indicators(flat.slice(0,28)).adx,0,'ADX first available after 27 transitions');
// Independent Wilder reference with varying directional movements, including seed DX.
const candles=flat.map((c,i)=>{const p=100+Math.sin(i*.71)*4+i*.03;return {...c,open:p,close:p,high:p+1,low:p-1};});
let tr=0,plus=0,minus=0,dx=[];
for(let i=1;i<candles.length;i++){
 const c=candles[i],p=candles[i-1],u=c.high-p.high,d=p.low-c.low;
 const t=Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));
 const up=u>d&&u>0?u:0,down=d>u&&d>0?d:0;
 if(i<=14){tr+=t;plus+=up;minus+=down;}else{tr=tr-tr/14+t;plus=plus-plus/14+up;minus=minus-minus/14+down;}
 if(i>=14)dx.push(plus+minus?100*Math.abs(plus-minus)/(plus+minus):0);
}
let reference=dx.slice(0,14).reduce((a,b)=>a+b,0)/14;
for(const value of dx.slice(14))reference=(reference*13+value)/14;
assert.ok(Math.abs(indicators(candles).adx-reference)<1e-10);
const args={decision:{motion:{side:'BUY',score:85},liquidity:{side:'BUY',buy:85},indicatorMatrix:{rows:{m1:{bias:'BUY',strength:85},m5:{bias:'BUY',strength:85}}}},scalp:{action:'BUY',confidence:85},movement:{regime:'EXPANSION',side:'BUY',confidence:85},tick:{side:'BUY',confidence:85},stateGraph:{nextSide:'BUY',nextSideProbability:85},brainLearning:{regimes:{EXPANSION:Object.fromEntries(['MICRO','TREND','REVERSAL','RANGE'].map(k=>[k,{samples:40,blendedAccuracy:80,multiplier:1}]))}}};
const result=buildMultiBrainCore('BTC',args);
assert.equal(result.calibration.supportSamples,40,'Shared observation windows are not four independent samples');
assert.equal(result.calibration.qualityReady,false);
assert.equal(result.strong,false);
assert.equal(buildMultiBrainCore('BTC',{}).side,'WAIT');
console.log('PASS: neutral/invalid indicators, independent Wilder ADX reference, correlated core evidence');
