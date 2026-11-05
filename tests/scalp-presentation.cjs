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
assert.ok(html.includes('انتظار · لا دخول'));
assert.ok(!html.includes('scalp-seconds-direction green'),'Unconfirmed monitoring cannot use confirmed entry styling');
assert.ok(!html.includes('scalp-seconds-levels'));
const earlyWatch={...plan,id:'pre-60',status:'WATCH',side:'SELL',score:60,
 entry:99,stop:101,targets:[],reason:'هدف غير مؤهل بعد التكلفة'};
html=render(desk(earlyWatch,check,{quote:{price:100,at:now}}));
assert.ok(html.includes('رصد فني · بيع'),'valid 60-grade setup is visible, not a blank WAIT');
assert.ok(html.includes('تجهيز قبل التفعيل'),'watch is ahead of reference quote');
assert.ok(html.includes('مستوى ترقب')&&html.includes('هدف محتمل'));
assert.ok(html.includes('الهدف غير مؤهل'),'unverified targets cannot become entry predictions');
assert.ok(!html.includes('scalp-seconds-levels'),
 'technical WATCH never presents execution-grade levels');
assert.ok(!html.includes('شراء مؤكد')&&!html.includes('بيع مؤكد'));
html=render(desk(earlyWatch,check,{quote:{price:98,at:now}}));
assert.ok(html.includes('لم يثبت السبق'),
 'crossed watch cannot be called pre-move signal');
html=render(desk(earlyWatch,check,{checkedAt:now-30000,quote:{price:100,at:now}}));
assert.ok(!html.includes('scalp-early-watch'),
 'stale quote cannot continue advertising an early setup');

const confirmed={...check,state:'ENTRY',entry:100,stop:99,targets:[{price:103}],
  confirmedCandleAt:now-5000,entryAudit:{approved:true,reason:'إغلاق مؤكّد'}};
// ENTRY approval alone is NOT a fill. With LIMIT-only execution the UI
// must wait for a verified reference bid/ask touch before a 15s entry badge.
html=render(desk(armed,confirmed));
assert.ok(!html.includes('scalp-seconds-levels'),
 'an unfilled pending limit must never appear as an executed paper entry');
const openAt=(p,activatedAt,extra={})=>desk(p,confirmed,{ledger:{lanes:[{
 horizon:5,current:{state:'ACTIVE',activatedAt,plan:p}}]},...extra});
html=render(openAt(armed,now-5000));
assert.ok(html.includes('10 ث'),'Confirmed LIMIT touch has a 15-second badge window');
assert.ok(html.includes('scalp-seconds-levels'),'Only activated pending limit shows paper levels');
html=render(openAt(armed,now-16000));
assert.ok(!html.includes('scalp-seconds-levels'),'Expired activation badge must not be actionable');
html=render(openAt(armed,now-5000,{checkedAt:now-16000}));
assert.ok(!html.includes('scalp-seconds-levels'),'Stale prices block a filled paper signal');
html=render(openAt(armed,now-5000,{checkedAt:now+60000}));
assert.ok(!html.includes('scalp-seconds-levels'),'Future-dated feed must not qualify as fresh');
const pending={state:'ARMED',limitType:'BUY_LIMIT',limitExpiresAt:now+30000,
 activatedAt:null,plan:armed};
html=render(desk(armed,confirmed,{ledger:{lanes:[{horizon:5,current:pending}]}}));
assert.ok(html.includes('BUY LIMIT معلّق')&&html.includes('scalp-pending-limit'));
assert.ok(!html.includes('scalp-seconds-levels'),'pending LIMIT is never confirmed');
const closed={state:'STOPPED',activatedAt:now-60000,
 plan:{...armed,side:'SELL',entry:999,stop:1000,targets:[{price:998}]}};
html=render(desk(armed,confirmed,{ledger:{lanes:[{horizon:5,current:closed}]}}));
assert.ok(!html.includes('شراء مؤكد'),'closed paper positions never renew a limit entry');
assert.ok(!html.includes('999.00'),'Closed trade levels must not leak into a new signal');
html=render(openAt(armed,now-60000));
assert.ok(html.includes('متابعة فقط'));
assert.ok(!html.includes('scalp-seconds-levels'),'An old paper entry does not renew a confirmed window');
const sellArmed={...armed,side:'SELL',stop:101,targets:[{price:97}]};
html=render(openAt(sellArmed,now-2000));
assert.ok(html.includes('بيع'),'Sell direction stays visually explicit');
console.log('PASS: fast scalp BUY/SELL/WAIT, 15-second TTL, stale veto, no fake levels or setup clutter');
