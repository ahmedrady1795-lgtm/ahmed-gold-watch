const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(path){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:n=>n==='./SniperOpportunityHistory'?load('components/SniperOpportunityHistory.tsx'):require(n)});return m.exports;}
const Markers=load('components/SniperOpportunityMarkers.tsx').default;
const records=Array.from({length:20},(_,i)=>({id:String(i),asset:'GOLD',source:'test',kind:'FOLLOW',issuedAt:1000+i*1000,priceAt:100+i,side:i%2?'BUY':'SELL',m5Outcome:'PENDING'}));
const html=renderToStaticMarkup(React.createElement('svg',null,React.createElement(Markers,{signal:{phase:'WATCH'},records,asset:'GOLD',source:'test',from:0,now:30000,left:0,split:1000,end:1100,top:0,bottom:500,py:x=>x,timeX:t=>t/30})));
assert.equal((html.match(/data-kind="FOLLOW"/g)||[]).length,20,'every visible historical point survives, including older than last twelve');
assert.ok(html.includes('data-issued-at="1000"'),'oldest original timestamp remains visible');
console.log('PASS: all visible historical M5 points rendered without rewriting timestamps');
