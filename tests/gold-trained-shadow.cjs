const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const modelPath='public/models/gold-shape-model.json';
const stub=JSON.parse(fs.readFileSync(modelPath,'utf8'));
const source=fs.readFileSync('lib/gold-trained-shadow.ts','utf8');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
}).outputText,{module:mod,exports:mod.exports,
  require:p=>p.endsWith('/gold-shape-model.json')?{default:stub,...stub}:require(p),
  console},{filename:'lib/gold-trained-shadow.ts'});
const {predictGoldTrainedShadow:predict}=mod.exports;
const start=Date.parse('2026-10-16T10:00:00Z');
const bars=Array.from({length:60},(_,i)=>{
  const open=100+i*.30,close=open+.27;
  return {time:start+i*60000,open,close,high:close+.36,low:open-.40};
});
const t=start+60*60000;
const shape={n:1250,path:[
  [0,.78,-.3,.35],[.35,1.04,-.1,.54],[.54,1.4,.1,1.07]
],holdout:{n:300,wins:211,accuracy:211/300,
  wilsonLower:.649,pairedMomentumBaseline:.54,maeAtr:1.03,months:8}};
const artifact={schema:'qannas-gold-shape-v1',status:'QUALIFIED',
  source:'MT5_XAUUSD_MONTHLY_ARCHIVE',symbol:'XAUUSDm',frame:'M1',horizon:3,
  training:{origin:'USER_MT5_TERMINAL',nonOverlapping:true,purgedSampleGap:4},
  patterns:{'EU|UP|UP|NORMAL':shape}};
const args={candles:bars,now:t,price:bars.at(-1).close,
  source:'Exness/MT5 · XAUUSDm',planSide:'WAIT',sourceReady:true,artifact};
assert.equal(stub.status,'SHADOW','never embed pretend historical results in public model');
assert.equal(predict({...args,artifact:stub}),null,'empty user-data install must not activate');
const positive=predict(args);
assert.ok(positive,'paired MT5 data and independently audited pattern should render');
assert.equal(positive.source,'GOLD_MT5_OOS_MODEL');
assert.equal(positive.candles.length,3);
assert.equal(positive.validation.samples,300);
assert.equal(positive.validation.directionHits,211);
assert.equal(positive.candles[0].open,bars.at(-1).close);
assert.equal(positive.candles[1].open,positive.candles[0].close);
assert.ok(positive.candles.every(c=>c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&
  c.upperBand>=c.high&&c.lowerBand<=c.low));
assert.equal(predict({...args,planSide:'SELL'}),null,'server trade side conflicts may not be overriden');
assert.equal(predict({...args,sourceReady:false}),null);
assert.equal(predict({...args,source:'Biquote · MT5 XAUUSD candles'}),null,'MT5-like third-party feed cannot impersonate calibrated broker');
assert.equal(predict({...args,source:'Exness/MT5 · XAUUSD'}),null,'broker symbol must match exactly');
assert.equal(predict({...args,now:t+120000}),null);
assert.equal(predict({...args,price:args.price+10}),null);
assert.equal(predict({...args,candles:bars.filter((_,i)=>i!==42)}),null,'gapped M1 fails closed');
assert.equal(predict({...args,artifact:{...artifact,status:'SHADOW'}}),null);
assert.equal(predict({...args,artifact:{...artifact,training:{...artifact.training,nonOverlapping:false}}}),null);
assert.equal(predict({...args,artifact:{...artifact,patterns:{'EU|UP|UP|NORMAL':{
  ...shape,holdout:{...shape.holdout,wilsonLower:.49}}}}}),null,
  'a high apparent accuracy with no significant OOS lower bound must not publish');
assert.equal(predict({...args,artifact:{...artifact,patterns:{'EU|UP|UP|NORMAL':{
  ...shape,holdout:{...shape.holdout,pairedMomentumBaseline:.66}}}}}),null,
  'outperformance versus paired momentum baseline must be demonstrated');
assert.equal(predict({...args,artifact:{...artifact,patterns:{'EU|UP|UP|NORMAL':{
  ...shape,holdout:{...shape.holdout,n:20}}}}}),null);
const ui=fs.readFileSync('components/ForecastIllustration.tsx','utf8');
assert.match(ui,/predictGoldTrainedShadow/);
assert.match(ui,/asset==='GOLD'\?predictGoldTrainedShadow/);
assert.match(ui,/const ghost=goldShadow\?\?buildGhostForecast/);
assert.match(ui,/source:String\(x\?\.candleSource\|\|''\)/);
const trainer=fs.readFileSync('mt5_bridge/train_gold_shape.py','utf8');
const exporter=fs.readFileSync('mt5_bridge/export_gold_history.py','utf8');
assert.match(trainer,/split_index/);
assert.match(trainer,/lower_wilson/);
assert.match(trainer,/sha256/);
assert.match(trainer,/pairedMomentumBaseline/);
assert.match(exporter,/copy_rates_range/);
assert.match(exporter,/gzip.open/);
assert.doesNotMatch(exporter,/order_send/);
console.log('PASS: genuine GOLD archive can enable 3 estimated OHLC candles only after broker, source, OOS and integrity gates');
