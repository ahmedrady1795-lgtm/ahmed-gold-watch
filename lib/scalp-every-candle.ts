import fs from 'node:fs';
import type {M1Bar} from './sniper-mt5-m1';
import {everyM1Direction} from './sniper-m1-every-direction';
import type {ScalpQuote} from './scalp-opportunities';

// Separate, low-friction RESEARCH lane: one forecast and one attempted
// resting LIMIT on EACH new CLOSED M1 candle. Never called by MT5 bridge.
// It intentionally does NOT borrow the qualified trade's 1.25R entry gate.
// Missing quote/fill is a documented miss, not an imaginary winning trade.
export type EverySide='BUY'|'SELL';
export type EveryState='NO_BID_ASK'|'COST_UNVIABLE'|'PENDING'|'ACTIVE'|'QUICK_TP'|
  'STOP'|'TIME_EXIT'|'EXPIRED'|'UNKNOWN';
export type EveryAttempt={
  id:number;issuedAt:number;side:EverySide;pressure:number;
  weak:boolean;state:EveryState;entry:number|null;stop:number|null;
  tp:number|null;cost:number;extraCost?:number;spreadAtQuote?:number;
  quoteSource:string;limitType:'BUY_LIMIT'|'SELL_LIMIT';
  expiryAt:number;lastQuoteAt:number;lastExecutable:number|null;
  filledAt:number|null;closedAt:number|null;exit:number|null;netR:number|null;
  note:string
};
export type EveryLedger={version:1;history:EveryAttempt[]};
const EMPTY=():EveryLedger=>({version:1,history:[]});
const PERSIST='/data/scalp-every-m1-v1.json';
const TEMP='/tmp/scalp-every-m1-v1.json';
declare global{var __scalpEveryM1Ledger:EveryLedger|undefined;}
let lastSaved=0;
const round=(v:number)=>Number(v.toFixed(3));
const lo=(v:number)=>Math.floor(v*100+1e-7)/100;
const hi=(v:number)=>Math.ceil(v*100-1e-7)/100;
const final=(x:EveryState)=>!['PENDING','ACTIVE'].includes(x);
const validQuote=(q:ScalpQuote,now:number)=>q.at!=null&&Number.isFinite(q.at)&&
  q.at>0&&now>=q.at&&now-q.at<=10000&&q.price!=null&&q.price>0;
const validBook=(q:ScalpQuote)=>q.bid!=null&&q.ask!=null&&
  Number.isFinite(q.bid)&&Number.isFinite(q.ask)&&q.bid>0&&q.ask>q.bid;

function load():EveryLedger{
  if(globalThis.__scalpEveryM1Ledger)return globalThis.__scalpEveryM1Ledger;
  let ledger=EMPTY();
  for(const file of [PERSIST,TEMP]){
    try{
      const raw=fs.readFileSync(file,'utf8');
      if(raw.length>1_500_000)continue;
      const d=JSON.parse(raw);
      if(d?.version===1&&Array.isArray(d.history)){
        ledger={version:1,history:d.history.slice(-360)};
        break;
      }
    }catch{}
  }
  globalThis.__scalpEveryM1Ledger=ledger;
  return ledger;
}
function save(ledger:EveryLedger,now:number){
  if(now-lastSaved<12000)return;
  const file=fs.existsSync('/data')?PERSIST:TEMP;
  try{
    fs.writeFileSync(file+'.tmp',JSON.stringify(ledger));
    fs.renameSync(file+'.tmp',file);lastSaved=now;
  }catch{}
}
function priceAfterEntry(t:EveryAttempt,px:number):number{
  const risk=Math.abs(Number(t.entry)-Number(t.stop));
  // The entry is an observed ASK (buy) / BID (sell) LIMIT touch and
  // the exit uses the opposite executable side. That difference ALREADY
  // pays the spread. Only subtract fees/slippage once, not spread twice.
  // Legacy records without extraCost keep their old conservative formula.
  const remaining=t.extraCost??t.cost;
  return round(((t.side==='BUY'?px-Number(t.entry):Number(t.entry)-px)-remaining)/
    Math.max(.01,risk+remaining));
}
function finish(t:EveryAttempt,state:EveryState,now:number,quote:number|null=null,note=''){
  t.state=state;t.closedAt=now;t.exit=quote;
  t.netR=quote!=null?priceAfterEntry(t,quote):null;
  t.note=note;return t;
}
export function advanceEveryM1(ledger:EveryLedger,raw:readonly M1Bar[],
  q:ScalpQuote,now:number,costEstimate:number):EveryLedger{
  const history=ledger.history;
  const book=validBook(q),fresh=validQuote(q,now);
  for(const t of history){
    if(final(t.state))continue;
    if(t.state==='PENDING'&&now>=t.expiryAt){
      // A missing quote is not evidence that a pending LIMIT never filled.
      const sawExpiry=book&&fresh&&q.source===t.quoteSource&&
        q.at!>=t.expiryAt-5000&&q.at!>t.lastQuoteAt&&
        q.at!-t.lastQuoteAt<=15000;
      finish(t,sawExpiry?'EXPIRED':'UNKNOWN',now,null,sawExpiry?
        'انتهى Limit ولم يُرصد لمس في المتابعة الحديثة':
        'انتهى Limit خلال فجوة اقتباسات؛ لا يمكن إثبات عدم التنفيذ');continue;
    }
    if(t.state==='ACTIVE'&&now>=Number(t.filledAt)+60000){
      const px=book?(t.side==='BUY'?Number(q.bid):Number(q.ask)):null;
      if(fresh&&book&&q.source===t.quoteSource&&q.at!>t.lastQuoteAt&&
         q.at!-t.lastQuoteAt<=15000&&px!=null){
        finish(t,'TIME_EXIT',q.at!,px,'خروج زمني بعد دقيقة بسعر Bid/Ask المرصود');
      }else finish(t,'UNKNOWN',now,null,'لا توجد عينة سعر صالحة عند انتهاء دقيقة الاحتفاظ');
      continue;
    }
    if(!fresh||!book||q.source!==t.quoteSource||q.at!<=t.lastQuoteAt){
      if(now-t.lastQuoteAt>15000)
        finish(t,'UNKNOWN',now,null,
          'انقطاع أسعار Bid/Ask موثوقة لأكثر من 15 ثانية؛ لا نتيجة محسوبة');
      continue;
    }
    if(q.at!-t.lastQuoteAt>15000){
      finish(t,'UNKNOWN',now,null,'فجوة تحديث أسعار؛ ترتيب الوقف والهدف مجهول');
      continue;
    }
    const px=t.side==='BUY'?Number(q.ask):Number(q.bid);
    if(t.state==='PENDING'){
      const wasOutside=t.side==='BUY'?Number(t.lastExecutable)>Number(t.entry):
        Number(t.lastExecutable)<Number(t.entry);
      const touched=wasOutside&&(t.side==='BUY'?px<=Number(t.entry):
        px>=Number(t.entry));
      if(touched){
        if(Math.abs(px-Number(t.entry))>Math.abs(Number(t.entry)-Number(t.stop))*.35||
          (t.side==='BUY'?px<=Number(t.stop):px>=Number(t.stop))){
          finish(t,'UNKNOWN',now,null,'سعر قفز فوق Limit ولا يمكن إثبات تنفيذ');
        }else{
          t.state='ACTIVE';t.filledAt=q.at!;
          t.note='لمس Limit ورقي؛ ليس تأكيد تنفيذ وسيط';
        }
      }
      t.lastExecutable=px;t.lastQuoteAt=q.at!;
      continue;
    }
    const exit=t.side==='BUY'?Number(q.bid):Number(q.ask);
    if(t.side==='BUY'?exit<=Number(t.stop):exit>=Number(t.stop))
      finish(t,'STOP',q.at!,exit,'وقف مرصود بالـ Bid/Ask');
    else if(t.side==='BUY'?exit>=Number(t.tp):exit<=Number(t.tp))
      finish(t,'QUICK_TP',q.at!,exit,'مكسب سريع مرصود بعد تكلفة تقديرية');
    t.lastQuoteAt=q.at!;
  }
  const signal=everyM1Direction(raw,now);
  if(signal&&!history.some(x=>x.id===signal.issuedAt)){
    const cost=Number.isFinite(costEstimate)&&costEstimate>0?costEstimate:NaN;
    const spread=book?Number(q.ask)-Number(q.bid):NaN;
    // Requiring a quote sampled AFTER signal issuance prevents placing a
    // hypothetical LIMIT using a price known only before the forecast.
    const usable=fresh&&book&&q.at!>=signal.issuedAt&&Number.isFinite(cost)&&
      Number.isFinite(spread)&&spread>=0&&spread<=cost+.01;
    const risk=Math.max(signal.atr*.65,(Number.isFinite(spread)?spread:0)*2.2,.14);
    const offset=Math.max(.02,(Number.isFinite(spread)?spread:0)*.5,signal.atr*.05);
    const entry=usable?signal.side==='BUY'?
      lo(Number(q.bid)-offset):hi(Number(q.ask)+offset):null;
    const stop=entry==null?null:signal.side==='BUY'?lo(entry-risk):hi(entry+risk);
    const extraCost=usable?Math.max(0,cost-spread):NaN;
    const move=extraCost+Math.max(.05,risk*.25);
    const tp=entry==null?null:signal.side==='BUY'?hi(entry+move):lo(entry-move);
    // A tiny profit is not reachable when the bid/ask-adjusted gross target
    // exceeds almost all the recent one-minute true range. Still record the
    // candle prediction, but not a fictional fill or executable paper plan.
    const feasible=Number.isFinite(move)&&move>extraCost&&
      move<=signal.atr*.85&&Number.isFinite(extraCost);
    const state:EveryState=entry==null?'NO_BID_ASK':
      !feasible?'COST_UNVIABLE':
      tp!=null&&tp>0&&stop!=null&&stop>0?'PENDING':'COST_UNVIABLE';
    history.push({id:signal.issuedAt,issuedAt:signal.issuedAt,side:signal.side,
      pressure:signal.pressure,weak:signal.weak,state,
      entry:state==='PENDING'?entry:null,stop:state==='PENDING'?stop:null,
      tp:state==='PENDING'?tp:null,cost:Number.isFinite(cost)?cost:0,
      extraCost:Number.isFinite(extraCost)?round(extraCost):undefined,
      spreadAtQuote:Number.isFinite(spread)?round(spread):undefined,
      quoteSource:q.source,
      limitType:signal.side==='BUY'?'BUY_LIMIT':'SELL_LIMIT',
      expiryAt:signal.issuedAt+60000,lastQuoteAt:q.at??0,
      lastExecutable:state==='PENDING'?(signal.side==='BUY'?Number(q.ask):Number(q.bid)):null,
      filledAt:null,closedAt:state==='NO_BID_ASK'||state==='COST_UNVIABLE'?now:null,
      exit:null,netR:null,
      note:state==='NO_BID_ASK'?
        'توقع الشمعة موجود لكن بدون Bid/Ask بعد الإصدار وتكلفة موثوقة لا يوجد Limit':
        state==='COST_UNVIABLE'?
        'الهدف الصغير بعد التكلفة أكبر من نطاق الحركة المعتاد للدقيقة؛ تخطي المحاولة':
        'Limit بحثي مشروط لكل شمعة، لا يجيز تنفيذ MT5 أو يثبت الربحية'});
  }
  ledger.history=history.slice(-360);
  return ledger;
}
export function observeEveryM1(raw:readonly M1Bar[],q:ScalpQuote,now:number,cost:number){
  const l=load();
  advanceEveryM1(l,raw,q,now,cost);
  save(l,now);
  const hist=l.history;
  const active=hist.filter(t=>t.state==='ACTIVE');
  const pending=hist.filter(t=>t.state==='PENDING');
  const settled=hist.filter(t=>t.netR!=null&&
    ['QUICK_TP','STOP','TIME_EXIT'].includes(t.state));
  const results=settled.map(t=>Number(t.netR));
  const net=results.reduce((a,b)=>a+b,0);
  return {mode:'EVERY_CANDLE_PAPER_LIMIT_SHADOW',enabled:true,
    storage:fs.existsSync(PERSIST)?'VOLUME':fs.existsSync(TEMP)?'EPHEMERAL':'MEMORY',
    proposals:hist.length,pending:pending.length,active:active.length,
    noQuote:hist.filter(t=>t.state==='NO_BID_ASK').length,
    costUnviable:hist.filter(t=>t.state==='COST_UNVIABLE').length,
    expired:hist.filter(t=>t.state==='EXPIRED').length,
    unknown:hist.filter(t=>t.state==='UNKNOWN').length,
    filled:hist.filter(t=>t.filledAt!=null).length,
    quickWins:hist.filter(t=>t.state==='QUICK_TP').length,
    stops:hist.filter(t=>t.state==='STOP').length,
    timeExits:hist.filter(t=>t.state==='TIME_EXIT').length,
    resolved:settled.length,netR:round(net),
    observedWinPct:settled.length?round(results.filter(v=>v>0).length/settled.length*100):null,
    meanNetR:settled.length?round(net/settled.length):null,
    weakCount:hist.filter(t=>t.weak).length,
    strongCount:hist.filter(t=>!t.weak).length,
    latest:hist.at(-1)??null,
    recent:hist.slice(-8).reverse(),
    note:'كل شمعة لها توقع اتجاه، ومحاولة Limit فقط إذا كان هدفها الصغير بعد التكلفة قابلًا للمراقبة. قياسات مرجعية غير مؤكدة ولا أوامر MT5.'};
}
