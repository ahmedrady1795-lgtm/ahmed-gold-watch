import fs from 'node:fs';
import type {M1Bar} from './sniper-mt5-m1';
import {everyM1Direction} from './sniper-m1-every-direction';
import type {ScalpQuote} from './scalp-opportunities';

// Separate, low-friction RESEARCH lane: one forecast and one attempted
// resting LIMIT on EACH new CLOSED M1 candle. Never called by MT5 bridge.
// It intentionally does NOT borrow the qualified trade's 1.25R entry gate.
// Missing quote/fill is a documented miss, not an imaginary winning trade.
export type EverySide='BUY'|'SELL';
export type EveryState='NO_BID_ASK'|'PENDING'|'ACTIVE'|'QUICK_TP'|
  'STOP'|'TIME_EXIT'|'EXPIRED'|'UNKNOWN';
export type EveryAttempt={
  id:number;issuedAt:number;side:EverySide;pressure:number;
  weak:boolean;state:EveryState;entry:number|null;stop:number|null;
  tp:number|null;cost:number;quoteSource:string;limitType:'BUY_LIMIT'|'SELL_LIMIT';
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
  return round(((t.side==='BUY'?px-Number(t.entry):Number(t.entry)-px)-t.cost)/
    Math.max(.01,risk+t.cost));
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
      finish(t,'EXPIRED',now,null,'Limit انتهى دون لمس مرصود');continue;
    }
    if(t.state==='ACTIVE'&&now>=Number(t.filledAt)+60000){
      const px=book?(t.side==='BUY'?Number(q.bid):Number(q.ask)):null;
      if(fresh&&book&&q.source===t.quoteSource&&q.at!>t.lastQuoteAt&&px!=null){
        finish(t,'TIME_EXIT',q.at!,px,'خروج زمني بعد دقيقة بسعر Bid/Ask المرصود');
      }else finish(t,'UNKNOWN',now,null,'لا توجد عينة سعر صالحة عند انتهاء دقيقة الاحتفاظ');
      continue;
    }
    if(!fresh||!book||q.source!==t.quoteSource||q.at!<=t.lastQuoteAt)
      continue;
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
    const cost=Number.isFinite(costEstimate)&&costEstimate>0?costEstimate:.58;
    const spread=book?Number(q.ask)-Number(q.bid):0;
    const risk=Math.max(signal.atr*.65,spread*2.2,.14);
    const offset=Math.max(.02,spread*.5,signal.atr*.05);
    const entry=fresh&&book?
      signal.side==='BUY'?lo(Number(q.bid)-offset):hi(Number(q.ask)+offset):null;
    const stop=entry==null?null:signal.side==='BUY'?lo(entry-risk):hi(entry+risk);
    const move=cost+Math.max(.05,risk*.25);
    const tp=entry==null?null:signal.side==='BUY'?hi(entry+move):lo(entry-move);
    const state:EveryState=entry!=null&&tp!=null&&tp>0&&stop!=null&&stop>0?
      'PENDING':'NO_BID_ASK';
    history.push({id:signal.issuedAt,issuedAt:signal.issuedAt,side:signal.side,
      pressure:signal.pressure,weak:signal.weak,state,
      entry:state==='PENDING'?entry:null,stop:state==='PENDING'?stop:null,
      tp:state==='PENDING'?tp:null,cost,quoteSource:q.source,
      limitType:signal.side==='BUY'?'BUY_LIMIT':'SELL_LIMIT',
      expiryAt:signal.issuedAt+60000,lastQuoteAt:q.at??0,
      lastExecutable:state==='PENDING'?(signal.side==='BUY'?Number(q.ask):Number(q.bid)):null,
      filledAt:null,closedAt:state==='NO_BID_ASK'?now:null,exit:null,netR:null,
      note:state==='NO_BID_ASK'?
        'اتجاه كل شمعة صادر؛ لكن بدون Bid/Ask حديث لا نزعم تعليق Limit':
        'Limit ورقي لكل شمعة، دون فلتر ربح 1.25R؛ في مسار بحث مستقل'});
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
    expired:hist.filter(t=>t.state==='EXPIRED').length,
    unknown:hist.filter(t=>t.state==='UNKNOWN').length,
    filled:hist.filter(t=>t.filledAt!=null).length,
    quickWins:hist.filter(t=>t.state==='QUICK_TP').length,
    stops:hist.filter(t=>t.state==='STOP').length,
    timeExits:hist.filter(t=>t.state==='TIME_EXIT').length,
    resolved:settled.length,netR:round(net),
    observedWinPct:settled.length?round(results.filter(v=>v>0).length/settled.length*100):null,
    latest:hist.at(-1)??null,
    recent:hist.slice(-8).reverse(),
    note:'كل شمعة لها اتجاه ومحاولة Limit ورقية؛ عدم اللمس/غياب Bid-Ask لا يحسب نجاحًا. لا أوامر MT5.'};
}
