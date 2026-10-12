const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compiled={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/ScalpDesk.tsx','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
}).outputText,{exports:compiled,require});
const now=Date.now();
const plan={id:'paper-1',horizon:5,status:'WATCH',side:'WAIT',reason:'الشروط مش مكتملة',
  entry:null,stop:null,targets:[],blockers:[],cost:100};
const check={horizon:5,state:'WATCH',entryAudit:{approved:false,reason:'لم يتأكد بعد'}};
const desk=(p=plan,e=check,extra={})=>({
  asset:'BTC',checkedAt:now,plans:[p],entryConfirmations:[e],
  ledger:{lanes:[{horizon:5,current:null}]},...extra
});
const render=d=>renderToStaticMarkup(React.createElement(compiled.default,{desk:d,now}));
let html=render(desk());
assert.ok(html.includes('القرار في ثواني'));
assert.ok(html.includes('مفيش اتجاه سكالب مؤكد دلوقتي'));
assert.ok(!html.includes('دخول ورقي</small>'));
assert.ok(!html.includes('تفاصيل الإعداد'));
html=render(desk({...plan,status:'BLOCKED',blockers:['سعر متأخر']}));
assert.ok(html.includes('الدخول متوقف'));
assert.ok(!html.includes('scalp-seconds-levels'));
const armed={...plan,status:'ARMED',side:'BUY',entry:100,stop:99,
  targets:[{price:103}]};
html=render(desk(armed));
assert.ok(html.includes('شراء'));
assert.ok(html.includes('لسه مش إشارة دخول'));
assert.ok(!html.includes('scalp-seconds-levels'));
const confirmed={...check,state:'ENTRY',entry:100,stop:99,targets:[{price:103}],
  confirmedCandleAt:now-5000,entryAudit:{approved:true,reason:'إغلاق مؤكّد'}};
html=render(desk(armed,confirmed));
assert.ok(html.includes('10 ث'),'Confirmed paper signal expires after 15 seconds');
assert.ok(html.includes('scalp-seconds-levels'),'Only confirmed entry shows actual paper levels');
html=render(desk(armed,{...confirmed,confirmedCandleAt:now-16000}));
assert.ok(!html.includes('scalp-seconds-levels'),'Expired signal must not be actionable');
html=render(desk(armed,confirmed,{checkedAt:now-16000}));
assert.ok(!html.includes('scalp-seconds-levels'),'Stale prices block a previously confirmed signal');
html=render(desk({...armed,side:'SELL',stop:101,targets:[{price:97}]},
  {...confirmed,confirmedCandleAt:now-2000}));
assert.ok(html.includes('بيع'),'Sell direction stays visually explicit');
console.log('PASS: fast scalp BUY/SELL/WAIT, 15-second TTL, stale veto, no fake levels or setup clutter');
