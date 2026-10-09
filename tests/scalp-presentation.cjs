const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const exports_={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/ScalpDesk.tsx','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
}).outputText,{exports:exports_,require});
const now=Date.now(),plan={horizon:5,status:'WATCH',side:'WAIT',reason:'لا توجد خطة',blockers:[],cost:115,costEstimated:true};
const check={horizon:5,state:'HOLDING',confirmationSource:'SCENARIO_ONLY',heldSeconds:42,trigger:81000,entryAudit:{code:'NO_SETUP',reason:'لا توجد خطة سعرية مؤهلة حاليًا'}};
const render=(p=plan,e=check,extra={})=>renderToStaticMarkup(React.createElement(exports_.default,{now,desk:{asset:'BTC',checkedAt:now,plans:[p],entryConfirmations:[e],...extra}}));
let html=render();
assert.ok(html.includes('لا يوجد إعداد دخول حاليًا'));
assert.ok(html.includes(check.entryAudit.reason));
assert.ok(!html.includes('scalp-entry-progress'));
assert.ok(!html.includes('المستوى المرصود'));
assert.ok(!html.includes('جارٍ تأكيد الثبات'));
assert.ok(html.includes('تكلفة تقديرية / 1 BTC'));
html=render({...plan,status:'BLOCKED'}, {...check,entryAudit:{reason:'شموع السكالب متأخرة'}});
assert.ok(html.includes('الدخول متوقف بسبب شروط السوق أو البيانات'));
assert.ok(html.includes('شموع السكالب متأخرة'));
const armed={...plan,status:'ARMED',side:'BUY',entry:100,stop:99,targets:[{price:103}],cost:.1};
const exact={...check,confirmationSource:'EXACT_PLAN'};
html=render(armed,exact);
assert.ok(html.includes('جارٍ تأكيد الثبات: 42 / 60 ثانية'));
assert.ok(html.includes('scalp-entry-progress'));
html=render(armed,exact,{checkedAt:now-16000});
assert.ok(html.includes('الأسعار متأخرة'));assert.ok(!html.includes('scalp-entry-progress'));
html=render(armed,exact,{ledger:{lanes:[{horizon:5,current:{state:'ACTIVE',plan:armed}}]}});
assert.ok(html.includes('صفقة تجريبية قيد المتابعة'));assert.ok(!html.includes('scalp-entry-progress'));
console.log('PASS: rendered NO_SETUP, market-blocked, exact-plan hold, stale and active states');
