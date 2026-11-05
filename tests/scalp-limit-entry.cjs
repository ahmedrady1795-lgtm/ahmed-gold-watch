const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const modules={};
function load(file){
 file=path.resolve(file);if(modules[file])return modules[file];
 const out={};modules[file]=out;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
    esModuleInterop:true}
 }).outputText,{exports:out,require:name=>name.startsWith('.')?
   load(path.resolve(path.dirname(file),name+'.ts')):require(name),globalThis:{},console});
 return out;
}
const {planScalpLimit,limitTouch}=load('lib/scalp-limit-entry.ts');
const {updateScalpLedger,advancePaperTrade}=load('lib/scalp-paper-ledger.ts');
const T=Date.now();
const quote=(price,bid,ask,at=T,source='MT5-TEST')=>({price,bid,ask,at,source});
const plan=(side='BUY')=>({
 id:'limit-'+side,asset:'GOLD',horizon:1,at:T-1000,expiresAt:T+65000,
 side,status:'ARMED',setup:'PULLBACK',score:90,blockers:[],
 entry:100,stop:side==='BUY'?99:101,
 targets:[{price:side==='BUY'?103:97,kind:'STRUCTURE'}],
 cost:.1,netRR:2.6,costEstimated:false,
 reason:'test',evidence:[],strategyReview:[]
});
const buy=plan(),sell=plan('SELL');
const b=planScalpLimit(buy,quote(100.225,100.20,100.25),T);
assert.equal(b.type,'BUY_LIMIT');assert.equal(b.price,100);
assert.ok(b.price<100.20,'BUY limit must sit beneath real bid');
assert.equal(limitTouch({plan:buy,limitType:b.type,
 limitSource:b.quoteSource,limitExpiresAt:b.expiresAt,
 lastExecutable:b.initialExecutable},
 quote(99.99,99.95,99.98,T+1000),T+1000),'FILLED');
assert.equal(limitTouch({plan:buy,limitType:b.type,
 limitSource:b.quoteSource,limitExpiresAt:b.expiresAt,
 lastExecutable:b.initialExecutable},
 quote(100,99.95,99.98,T+1000,'SECOND_PROVIDER'),T+1000),'UNKNOWN');
assert.equal(planScalpLimit({...buy,blockers:['news']},quote(100.225,100.20,100.25),T),null);
assert.equal(planScalpLimit(buy,quote(100.2,null,null),T),null,'no mid-price fills');
assert.equal(planScalpLimit(buy,quote(100.2,100.20,100.25,T-11000),T),null,'stale quote');
assert.equal(planScalpLimit({...buy,targets:[{price:100.15}]},quote(100.225,100.20,100.25),T),null,'fee/cost veto');
assert.equal(planScalpLimit({...buy,entry:101},quote(100.225,100.20,100.25),T),null,'too distant technical setup cannot be moved toward limit');
assert.ok(planScalpLimit(sell,quote(99.775,99.75,99.80),T));
const sp=planScalpLimit(sell,quote(99.775,99.75,99.80),T);
assert.equal(sp.type,'SELL_LIMIT');assert.equal(sp.price,100);
assert.ok(sp.price>99.80,'SELL limit must sit above real ask');
const first=updateScalpLedger('GOLD',[buy],quote(100.225,100.20,100.25),T,[]);
const pending=first.lanes[0].current;
assert.equal(first.mode,'PAPER_LIMIT_REFERENCE');
assert.equal(pending.state,'ARMED','qualified plan must not fill at current market price');
assert.equal(pending.limitType,'BUY_LIMIT');
assert.equal(pending.activatedAt,null);
assert.equal(pending.plan.entry,100);
assert.equal(first.lanes[0].stats.samples,0,'pending is not a trade');
const retrace=quote(99.965,99.95,99.98,T+1000);
const touched=updateScalpLedger('GOLD',[{...buy,status:'WATCH'}],retrace,T+1000,[]);
const open=touched.lanes[0].current;
assert.equal(open.state,'ACTIVE');
assert.equal(open.activatedAt,T+1000);
assert.equal(open.plan.entry,100,'frozen limit is the simulated fill, NOT ask or midpoint');
assert.equal(open.limitType,'BUY_LIMIT');
assert.equal(touched.lanes[0].stats.samples,0,'unclosed paper fill not profitable history');
const closed=updateScalpLedger('GOLD',[{...buy,status:'WATCH'}],
 quote(100.55,100.52,100.58,T+2000),T+2000,[]);
assert.equal(closed.lanes[0].current,null);
assert.equal(closed.lanes[0].stats.samples,1);
assert.equal(closed.lanes[0].recent[0].state,'QUICK_TP');
const freshNoQuotes=planScalpLimit(buy,{price:100.25,at:T,source:'MID'},T);
assert.equal(freshNoQuotes,null);
const bridge=fs.readFileSync('mt5_bridge/bridge.py','utf8');
assert.match(bridge,/mt5\.TRADE_ACTION_PENDING/);
assert.match(bridge,/mt5\.ORDER_TYPE_BUY_LIMIT/);
assert.match(bridge,/mt5\.ORDER_TYPE_SELL_LIMIT/);
assert.doesNotMatch(bridge,/mt5\.TRADE_ACTION_DEAL/,'bridge must not send MARKET deals');
assert.match(bridge,/SCALP DEMO LIMIT PENDING/);
assert.match(bridge,/SCALP DEMO LIMIT FILLED/);
const page=fs.readFileSync('components/ScalpDesk.tsx','utf8');
assert.match(page,/BUY LIMIT معلّق/);
assert.match(page,/scalp-pending-limit/);
const engine=fs.readFileSync('lib/scalp-desk.ts','utf8');
assert.match(engine,/entry\.state='LIMIT_PENDING'/);
console.log('PASS: pending BUY/SELL LIMIT, bid/ask-only touch, no market entries, quick exits after fill');
