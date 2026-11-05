import fs from 'node:fs';
import type {M1Bar} from './sniper-mt5-m1';
import {everyM1Direction} from './sniper-m1-every-direction';
import {priceEveryM1Limit,EVERY_M1_EDGE_V4} from './scalp-every-m1-economics';
import {requiresM1TickConfirmation,m1BidAskEvidence,M1_CONFIRM_WINDOW_MS}
  from './scalp-m1-tick-evidence';
import type {ScalpQuote} from './scalp-opportunities';

// Separate, low-friction RESEARCH lane: one forecast and one attempted
// resting LIMIT on EACH new CLOSED M1 candle. Never called by MT5 bridge.
// It intentionally does NOT borrow the qualified trade's 1.25R entry gate.
// Missing quote/fill is a documented miss, not an imaginary winning trade.
export type EverySide='BUY'|'SELL';
export type EveryState='AWAIT_QUOTE'|'CONFIRMING'|'NO_EDGE'|'NO_BID_ASK'|'COST_UNVIABLE'|'PENDING'|'ACTIVE'|'QUICK_TP'|
  'STOP'|'TIME_EXIT'|'EXPIRED'|'UNKNOWN';
export type EveryAttempt={
  id:number;issuedAt:number;side:EverySide;pressure:number;
  weak:boolean;state:EveryState;entry:number|null;stop:number|null;
  atr?:number;anchorTime?:number;
  tp:number|null;cost:number;extraCost?:number;spreadAtQuote?:number;
  strategyVersion?:string;pattern?:string;directionModel?:string;
  seedMid?:number;seedAt?:number;seedSource?:string;confirmedAt?:number|null;
  targetNetR?:number;breakEvenWinPct?:number;retestDepth?:number;
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
const final=(x:EveryState)=>!['AWAIT_QUOTE','CONFIRMING','PENDING','ACTIVE'].includes(x);
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
/** A candle hypothesis can precede its first post-close Bid/Ask tick.
 * Don't throw that minute away; stage a frozen reference LIMIT only upon
 * the FIRST fresh quote with a timestamp after the issued hypothesis.
 * No quote/cost is invented, and the order cannot be backdated.
 */
function stageAfterQuote(t:EveryAttempt,raw:readonly M1Bar[],q:ScalpQuote,
  now:number,costEstimate:number):boolean{
  if(t.state!=='AWAIT_QUOTE'||now>=t.expiryAt||
    !validQuote(q,now)||!validBook(q)||
    q.at!<t.issuedAt||!q.source||q.source==='unavailable')return false;
  const cost=Number.isFinite(costEstimate)&&costEstimate>0?costEstimate:NaN;
  const last=raw.find(b=>b.time===(t.anchorTime??t.issuedAt-60000));
  const atr=Number(t.atr);
  if(!last||!Number.isFinite(atr)||atr<=0||!Number.isFinite(cost))return false;
  const spread=Number(q.ask)-Number(q.bid);
  const e=priceEveryM1Limit({
    side:t.side,bid:Number(q.bid),ask:Number(q.ask),atr,cost,
    previousOpen:last.open,previousClose:last.close
  });
  t.cost=cost;t.quoteSource=q.source;
  t.spreadAtQuote=round(spread);
  t.extraCost=Number.isFinite(spread)?round(Math.max(0,cost-spread)):undefined;
  t.lastQuoteAt=q.at!;
  if(!e){
    finish(t,'COST_UNVIABLE',now,null,
      'تم رصد سعر حديث لكن الهدف بعد التكلفة غير مناسب لحركة الدقيقة');
    return true;
  }
  t.state='PENDING';t.entry=e.entry;t.stop=e.stop;t.tp=e.tp;
  t.targetNetR=e.netRewardR;t.breakEvenWinPct=e.breakEvenWinPct;
  t.retestDepth=e.retestDepth;t.lastExecutable=t.side==='BUY'?Number(q.ask):Number(q.bid);
  t.note='تم وضع LIMIT ورقي بعد أول Bid/Ask جديد؛ لا تنفيذ Market أو Exness';
  return true;
}
function beginAfterFreshQuote(t:EveryAttempt,raw:readonly M1Bar[],q:ScalpQuote,
  now:number,costEstimate:number){
  if(t.state!=='AWAIT_QUOTE'||now>=t.expiryAt||
    !validQuote(q,now)||!validBook(q)||q.at!<t.issuedAt||
    !q.source||q.source==='unavailable')return false;
  const atr=Number(t.atr);
  if(!Number.isFinite(atr)||atr<=0)return false;
  if(!requiresM1TickConfirmation({side:t.side,weak:t.weak,
    pressure:t.pressure,atr,directionModel:t.directionModel}))
    return stageAfterQuote(t,raw,q,now,costEstimate);
  // Weak directional guesses are still saved and scored but do NOT create a
  // resting LIMIT until a later, genuinely new bid/ask confirms the movement.
  t.seedMid=(Number(q.bid)+Number(q.ask))/2;
  t.seedAt=q.at!;
  t.seedSource=q.source;
  t.lastQuoteAt=q.at!;
  t.state='CONFIRMING';
  t.note='رصد ضعيف؛ ننتظر حركة Bid/Ask جديدة تؤيد الاتجاه قبل أي LIMIT';
  return true;
}

export function advanceEveryM1(ledger:EveryLedger,raw:readonly M1Bar[],
  q:ScalpQuote,now:number,costEstimate:number):EveryLedger{
  const history=ledger.history;
  const book=validBook(q),fresh=validQuote(q,now);
  for(const t of history){
    if(final(t.state))continue;
    if(t.state==='AWAIT_QUOTE'){
      if(now>=t.expiryAt)
        finish(t,'NO_BID_ASK',now,null,
          'انتهت الدقيقة قبل وصول Bid/Ask صالح بعد إصدار التوقع');
      else beginAfterFreshQuote(t,raw,q,now,costEstimate);
      // A seed or a newly created LIMIT is never treated as an instant fill.
      continue;
    }
    if(t.state==='CONFIRMING'){
      if(now>=t.issuedAt+M1_CONFIRM_WINDOW_MS){
        finish(t,'NO_EDGE',now,null,
          'لم تظهر حركة تأكيد جديدة خلال أول 24 ثانية؛ التوقع محفوظ بلا LIMIT');
        continue;
      }
      if(now-t.lastQuoteAt>15000){
        finish(t,'UNKNOWN',now,null,
          'توقف وصول Bid/Ask أثناء اختبار اتجاه الدقيقة؛ لا إثبات تأكيد');
        continue;
      }
      if(!fresh||!book||!q.source||q.source!==t.seedSource||
        q.at!<=Number(t.seedAt))continue;
      const verdict=m1BidAskEvidence({
        side:t.side,weak:t.weak,pressure:t.pressure,atr:Number(t.atr),
        directionModel:t.directionModel
      },{mid:Number(t.seedMid),at:Number(t.seedAt),source:String(t.seedSource)},{
        bid:Number(q.bid),ask:Number(q.ask),at:q.at!,source:q.source
      });
      if(verdict==='REJECT'){
        finish(t,'NO_EDGE',now,null,
          'الحركة خالفت التوقع أو استهلكت امتداد الدقيقة قبل دخول Limit');
      }else if(verdict==='UNKNOWN'){
        finish(t,'UNKNOWN',now,null,
          'تغير مصدر السعر أو انقطعت متابعة اتجاه الشمعة؛ لا نقبل تأكيدًا');
      }else if(verdict==='CONFIRM'){
        t.state='AWAIT_QUOTE';t.confirmedAt=q.at!;
        if(!stageAfterQuote(t,raw,q,now,costEstimate)){
          finish(t,'UNKNOWN',now,null,
            'استُدل على اتجاه الشمعة لكن بيانات الهدف/التكلفة غير مكتملة');
        }else if(t.state==='PENDING'){
          t.note='تأكيد زخم من تيك لاحق، ثم LIMIT ورقي ثابت ينتظر الرجوع';
        }
      }else t.lastQuoteAt=q.at!;
      continue;
    }
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
    // Record the forecast immediately, even if the newest book quote is
    // from a few milliseconds BEFORE this minute began. Give the quote
    // provider the full current minute to supply a post-signal executable
    // bid/ask, rather than finalizing the opportunity as NO_BID_ASK.
    const t:EveryAttempt={
      id:signal.issuedAt,issuedAt:signal.issuedAt,side:signal.side,
      pressure:signal.pressure,weak:signal.weak,state:'AWAIT_QUOTE',
      atr:signal.atr,anchorTime:signal.anchorTime,
      strategyVersion:EVERY_M1_EDGE_V4,pattern:signal.pattern,
      directionModel:signal.adaptive?.model??'PRESSURE_SWEEP',
      entry:null,stop:null,tp:null,
      cost:Number.isFinite(costEstimate)&&costEstimate>0?costEstimate:0,
      quoteSource:'',limitType:signal.side==='BUY'?'BUY_LIMIT':'SELL_LIMIT',
      expiryAt:signal.issuedAt+60000,lastQuoteAt:0,lastExecutable:null,
      filledAt:null,closedAt:null,exit:null,netR:null,
      lastExitPrice:null,lastExitAt:null,
      note:'توقع صدر لهذه الدقيقة؛ بانتظار أول Bid/Ask بعد وقت التوقع لوضع LIMIT'
    };
    history.push(t);
    beginAfterFreshQuote(t,raw,q,now,costEstimate);
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
  const awaitingQuote=hist.filter(t=>t.state==='AWAIT_QUOTE').length;
  const confirming=hist.filter(t=>t.state==='CONFIRMING').length;
  // An *issued* LIMIT is not a directional prediction and not a fill.
  const limitsIssued=hist.filter(t=>t.entry!=null&&
    (t.limitType==='BUY_LIMIT'||t.limitType==='SELL_LIMIT')).length;
  const missedMinutes=hist.reduce((n,t,i)=>i>0?n+
    Math.max(0,Math.round((t.issuedAt-hist[i-1].issuedAt)/60000)-1):n,0);
  const completed=hist.filter(t=>t.netR!=null&&
    ['QUICK_TP','STOP','TIME_EXIT'].includes(t.state));
  // New geometry/reversal model gets a truly separate future cohort.
  // Old cost-corrected tests must not validate today's changed payoff.
  const settled=completed.filter(t=>t.strategyVersion===EVERY_M1_EDGE_V4);
  const legacyResults=completed.length-settled.length;
  const results=settled.map(t=>Number(t.netR));
  const net=results.reduce((a,b)=>a+b,0);
  const breakdown=(pattern:string)=>{
    const rows=settled.filter(t=>t.pattern===pattern);
    const sum=rows.reduce((a,t)=>a+Number(t.netR),0);
    return {resolved:rows.length,wins:rows.filter(t=>Number(t.netR)>0).length,
      netR:round(sum),meanNetR:rows.length?round(sum/rows.length):null};
  };
  return {mode:'EVERY_CANDLE_PAPER_LIMIT_SHADOW',enabled:true,
    storage:fs.existsSync(PERSIST)?'VOLUME':fs.existsSync(TEMP)?'EPHEMERAL':'MEMORY',
    proposals:hist.length,limitsIssued,awaitingQuote,confirming,missedMinutes,
    noEdge:hist.filter(t=>t.state==='NO_EDGE').length,
    tickConfirmed:hist.filter(t=>t.confirmedAt!=null).length,
    pending:pending.length,active:active.length,
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
    version:EVERY_M1_EDGE_V4,
    nominalNetRMin:.55,
    breakEvenWinPctNominal:64.52,
    reversalSetups:hist.filter(t=>t.pattern==='SWEEP_REJECTION').length,
    byPattern:{reversal:breakdown('SWEEP_REJECTION'),momentum:breakdown('MOMENTUM')},
    latest:hist.at(-1)??null,
    recent:hist.slice(-8).reverse(),
    note:'كل شمعة تحتفظ بتوقع واتجاه. التوقع الضعيف ينتظر حركة Bid/Ask مؤيدة خلال 24 ثانية قبل محاولة LIMIT. عدم التفعيل ليس خسارة أو ربحًا، والنتائج الجديدة V4 فقط؛ بدون تنفيذ MT5 أو ادعاء ربح مضمون.'};
}
