const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(path){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:n=>n==='./SniperOpportunityHistory'?load('components/SniperOpportunityHistory.tsx'):n==='../lib/sniper-movement-proof'?load('lib/sniper-movement-proof.ts'):require(n)});return m.exports;}
const Markers=load('components/SniperOpportunityMarkers.tsx').default;
const records=Array.from({length:20},(_,i)=>({id:String(i),asset:'GOLD',source:'test',kind:'FOLLOW',issuedAt:1000+i*1000,priceAt:100+i,side:i%2?'BUY':'SELL',m5Outcome:'PENDING'}));
const html=renderToStaticMarkup(React.createElement('svg',null,React.createElement(Markers,{signal:{phase:'WATCH'},records,asset:'GOLD',source:'test',from:0,now:30000,left:0,split:1000,end:1100,top:0,bottom:500,py:x=>x,timeX:t=>t/30})));
assert.equal((html.match(/data-kind="FOLLOW"/g)||[]).length,20,'every visible historical point survives, including older than last twelve');
assert.ok(html.includes('data-issued-at="1000"'),'oldest original timestamp remains visible');
console.log('PASS: all visible historical M5 points rendered without rewriting timestamps');
const props={signal:{phase:'WATCH'},asset:'GOLD',source:'test',from:0,now:30000,left:0,split:1000,end:1100,top:0,bottom:500,py:x=>x,timeX:t=>t/30};
for(const outcome of ['WRONG','CORRECT']){
 const rendered=renderToStaticMarkup(React.createElement('svg',null,React.createElement(Markers,{...props,records:[{...records[19],m5Outcome:outcome}]})));
 const captions=[...rendered.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(x=>x[1]);
 assert.ok(captions.includes('متابعة صعود'),'closed-bar continuation must not masquerade as a qualified BUY');
 assert.ok(captions.every(x=>!/[✓✕]/.test(x)),'candle direction cannot masquerade as trade success/failure');
}
const History=load('components/SniperOpportunityHistory.tsx').default;
const history=renderToStaticMarkup(React.createElement(History,{asset:'GOLD',records:[{...records[0],kind:'EARLY',status:'NO_TARGET',m5Outcome:'WRONG',target:null,invalidation:null}]}));
assert.ok(history.includes('ترقب قبل الكسر'),'pre-break warning appears in audit history');
assert.ok(history.includes('الإغلاق خالف الاتجاه'),'direction outcome remains visible and explicitly identified');
assert.ok(history.includes('لا توجد خطة هدف'),'no target is invented for old records');
console.log('PASS: honest directional labels and retained pre-break audit');
const render=(extra)=>renderToStaticMarkup(React.createElement('svg',null,
 React.createElement(Markers,{...props,...extra})));
const current={phase:'BREAK_CONFIRMED',side:'SELL',trigger:119,targets:[],quality:'SETUP',reason:'test'};
const live=render({records:[records[19]],signal:current,confirmedPrice:119});
assert.ok(live.includes('data-phase="BREAK_CONFIRMED"'),
 'nearby historical M5 observation cannot hide the current confirmed setup');
const earlyRows=records.map(r=>({...r,kind:'EARLY',setupLifecycle:'PENDING'}));
const earlyHtml=render({records:earlyRows});
assert.equal((earlyHtml.match(/data-kind="EARLY"/g)||[]).length,20,
 'caption limits must not remove earlier pre-break observation points');
const crowded=[...records,{...records[19],id:'qualified',kind:'BREAK',
 side:'SELL',quality:'SETUP',status:'PENDING'}];
const qualified=render({records:crowded});
assert.match(qualified,/>بيع<\/text>/,
 'qualified entry reserves a caption before nearby observation labels');
const nearbyBreak={...records[19],id:'observed-break',kind:'BREAK',
 side:'SELL',quality:'OBSERVATION',status:'PENDING'};
const nearby=render({records:[records[19],nearbyBreak]});
assert.equal((nearby.match(/<circle /g)||[]).length,2,
 'an omitted nearby caption must retain the original breakout dot');
console.log('PASS: current setup visibility, qualified caption priority, all early/break points retained');
const clustered=records.slice(0,5).map((r,i)=>({...r,kind:'BREAK',quality:'SETUP',
 side:i%2?'SELL':'BUY',priceAt:118,status:i%2?'STOP':'TARGET'}));
const retained=render({records:clustered,compactObservations:true});
assert.equal((retained.match(/>شراء ✓<\/text>/g)||[]).length,3);
assert.equal((retained.match(/>بيع ×<\/text>/g)||[]).length,2);
