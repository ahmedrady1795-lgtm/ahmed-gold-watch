import fs from 'node:fs';
import type {M1Bar} from './sniper-mt5-m1';
import {everyM1Direction} from './sniper-m1-every-direction';
import {priceEveryM1Limit,EVERY_M1_EDGE_V2} from './scalp-every-m1-economics';
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
  strategyVersion?:string;pattern?:string;targetNetR?:number;breakEvenWinPct?:number;retestDepth?:number;
  quoteSource:string;limitType:'BUY_LIMIT'|'SELL_LIMIT';
  expiryAt:number;lastQuoteAt:number;lastExecutable:number|null;
  filledAt:number|null;closedAt:number|null;exit:number|null;netR:number|null;
  lastExitPrice?:number|null;lastExitAt?:number|null;
  note:string
};
export type EveryLedger={version:1;history:EveryAttempt[]};
const EMPTY=():EveryLedger=>({version:1,history:[]});
const PERSIST='/data/scalp-every-m1-v1.json';
const TEMP='/tmp/scalp-every-m1-v1.json';
declare global{var __scalpEveryM1Ledger:EveryLedger|undefined;}
let lastSaved=0;
const round=(v:number)=>Number(v.toFixed(3));
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
      const cutoff=Number(t.filledAt)+60000;
      const px=book?(t.side==='BUY'?Number(q.bid):Number(q.ask)):null;
      // Never use a quote AFTER the minute as a supposed pre-expiry exit.
      const currentAt=fresh&&book&&q.source===t.quoteSource?q.at!:null;
      const currentEligible=currentAt!=null&&currentAt>=cutoff-5000&&
        currentAt<=cutoff&&px!=null&&currentAt>t.lastQuoteAt&&
        currentAt-t.lastQuoteAt<=15000;
      const priorAt=Number(t.lastExitAt);
      const priorEligible=Number.isFinite(priorAt)&&priorAt>0&&
        priorAt>=cutoff-5000&&priorAt<=cutoff&&
        t.lastExitPrice!=null&&Number.isFinite(t.lastExitPrice);
      if(currentEligible)
        finish(t,'TIME_EXIT',cutoff,px,'خروج مرجعي بآخر Bid/Ask صالح قبل نهاية الدقيقة');
      else if(priorEligible)
        finish(t,'TIME_EXIT',cutoff,Number(t.lastExitPrice),
          'خروج مرجعي بآخر Bid/Ask قبل انتهاء الدقيقة بخمس ثوانٍ');
      else finish(t,'UNKNOWN',cutoff,null,
        'لا يوجد سعر Bid/Ask موثوق قبل انتهاء الدقيقة؛ لا نحسب سعرًا متأخرًا');
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
        // The quote may have touched the entry and stop in the same gap.
        // Check the executable *exit* side, not the entry ask/bid alone.
        const executableExit=t.side==='BUY'?Number(q.bid):Number(q.ask);
        if(Math.abs(px-Number(t.entry))>Math.abs(Number(t.entry)-Number(t.stop))*.35||
          (t.side==='BUY'?executableExit<=Number(t.stop):
            executableExit>=Number(t.stop))){
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
    t.lastExitPrice=exit;t.lastExitAt=q.at!;
  }
  const signal=everyM1Direction(raw,now);
  if(signal&&!history.some(x=>x.id===signal.issuedAt)){
    const cost=Number.isFinite(costEstimate)&&costEstimate>0?costEstimate:NaN;
    const spread=book?Number(q.ask)-Number(q.bid):NaN;
    // Requiring a quote sampled AFTER signal issuance prevents placing a
    // hypothetical LIMIT using a price known only before the forecast.
    const usable=fresh&&book&&q.at!>=signal.issuedAt&&Number.isFinite(cost)&&
      Number.isFinite(spread)&&spread>=0&&spread<=cost+.01;
    const last=raw.find(x=>x.time===signal.anchorTime);
    const economics=usable&&last?priceEveryM1Limit({
      side:signal.side,bid:Number(q.bid),ask:Number(q.ask),
      atr:signal.atr,cost,previousOpen:last.open,previousClose:last.close
    }):null;
    // Still produce a prediction on every valid closed candle. Never fake a
    // resting limit when the observed spread/cost geometry cannot support it.
    const entry=economics?.entry??null,stop=economics?.stop??null;
    const tp=economics?.tp??null;
    const extraCost=usable?Math.max(0,cost-spread):NaN;
    const state:EveryState=!usable?'NO_BID_ASK':
      economics?'PENDING':'COST_UNVIABLE';
    history.push({id:signal.issuedAt,issuedAt:signal.issuedAt,side:signal.side,
      pressure:signal.pressure,weak:signal.weak,state,
      strategyVersion:EVERY_M1_EDGE_V2,pattern:signal.pattern,
      targetNetR:economics?.netRewardR,
      breakEvenWinPct:economics?.breakEvenWinPct,
      retestDepth:economics?.retestDepth,
      entry:state==='PENDING'?entry:null,stop:state==='PENDING'?stop:null,
      tp:state==='PENDING'?tp:null,cost:Number.isFinite(cost)?cost:0,
      extraCost:Number.isFinite(extraCost)?round(extraCost):undefined,
      spreadAtQuote:Number.isFinite(spread)?round(spread):undefined,
      quoteSource:q.source,
      limitType:signal.side==='BUY'?'BUY_LIMIT':'SELL_LIMIT',
      expiryAt:signal.issuedAt+60000,lastQuoteAt:q.at??0,
      lastExecutable:state==='PENDING'?(signal.side==='BUY'?Number(q.ask):Number(q.bid)):null,
      filledAt:null,closedAt:state==='NO_BID_ASK'||state==='COST_UNVIABLE'?now:null,
      exit:null,netR:null,lastExitPrice:null,lastExitAt:null,
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
  const completed=hist.filter(t=>t.netR!=null&&
    ['QUICK_TP','STOP','TIME_EXIT'].includes(t.state));
  // New geometry/reversal model gets a truly separate future cohort.
  // Old cost-corrected tests must not validate today's changed payoff.
  const settled=completed.filter(t=>t.strategyVersion===EVERY_M1_EDGE_V2);
  const legacyResults=completed.length-settled.length;
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
    quickWins:settled.filter(t=>t.state==='QUICK_TP').length,
    stops:settled.filter(t=>t.state==='STOP').length,
    timeExits:settled.filter(t=>t.state==='TIME_EXIT').length,
    legacyResults,
    resolved:settled.length,netR:round(net),
    observedWinPct:settled.length?round(results.filter(v=>v>0).length/settled.length*100):null,
    meanNetR:settled.length?round(net/settled.length):null,
    weakCount:hist.filter(t=>t.weak).length,
    strongCount:hist.filter(t=>!t.weak).length,
    version:EVERY_M1_EDGE_V2,
    nominalNetRMin:.45,
    breakEvenWinPctNominal:69,
    reversalSetups:hist.filter(t=>t.pattern==='SWEEP_REJECTION').length,
    latest:hist.at(-1)??null,
    recent:hist.slice(-8).reverse(),
    note:'كل M1 لها توقع؛ محاولات Limit البحثية بتراجع سعري وهدف صافي 0.45R تقديري على الأقل، دون تفعيل MT5. V2 منفصل عن أي نتائج أقدم.'};
}
