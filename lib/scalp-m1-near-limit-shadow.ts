import {priceEveryM1Limit} from './scalp-every-m1-economics';
import {sourceVenue} from './sampled-live-candle';

/** A parallel, read-only near-price LIMIT lifecycle. It cannot submit an
 * order, change V5's direction/stop/exit or use hindsight OHLC to claim fills.
 * Every transition requires a NEW timestamped executable bid/ask snapshot.
 */
export const NEAR_M1_LIMIT_SHADOW_V1='NEAR_M1_LIMIT_SHADOW_V1';
export const NEAR_M1_FIRST_QUOTE_MS=12_000;
export type NearM1State='WATCH'|'PENDING'|'ACTIVE'|'QUICK_TP'|'STOP'|
  'TIME_EXIT'|'EXPIRED'|'COST_UNVIABLE'|'NO_EARLY_QUOTE'|'UNKNOWN';
export type NearM1Shadow={
  version:typeof NEAR_M1_LIMIT_SHADOW_V1;
  state:NearM1State;issuedAt:number;side:'BUY'|'SELL';
  placedAt:number|null;entry:number|null;stop:number|null;tp:number|null;
  estimatedNetRewardR:number|null;retestDepth:number|null;
  extraCost:number|null;source:string;lastAt:number;
  lastExecutable:number|null;filledAt:number|null;
  lastExitAt:number|null;lastExitPrice:number|null;
  closedAt:number|null;exit:number|null;netR:number|null;
  note:string
};
export type NearM1Inputs={
  side:'BUY'|'SELL';issuedAt:number;atr:number;
  previousOpen:number;previousClose:number;
  costEstimate:number;historicalSource?:string;
  now:number;quote:{bid?:number|null;ask?:number|null;
    at?:number|null;source?:string|null}
};
const rounded=(x:number)=>Number(x.toFixed(3));
const finished=(s:NearM1State)=>!['WATCH','PENDING','ACTIVE'].includes(s);
const done=(s:NearM1Shadow,state:NearM1State,at:number,exit:number|null,
 note:string):NearM1Shadow=>{
  const risk=Math.abs(Number(s.entry)-Number(s.stop));
  const extra=Number(s.extraCost);
  const net=exit!=null&&Number.isFinite(exit)&&risk>0?
    rounded(((s.side==='BUY'?exit-Number(s.entry):Number(s.entry)-exit)-extra)/
      (risk+extra)):null;
  return {...s,state,closedAt:at,exit,netR:net,note};
};
export function newNearM1Shadow(side:'BUY'|'SELL',issuedAt:number):NearM1Shadow{
  return {version:NEAR_M1_LIMIT_SHADOW_V1,state:'WATCH',issuedAt,side,
    placedAt:null,entry:null,stop:null,tp:null,
    estimatedNetRewardR:null,retestDepth:null,extraCost:null,
    source:'',lastAt:0,lastExecutable:null,filledAt:null,
    lastExitAt:null,lastExitPrice:null,closedAt:null,exit:null,netR:null,
    note:'انتظار أول Bid/Ask مطابق للمصدر خلال 12 ثانية بعد افتتاح M1'};
}
export function advanceNearM1Shadow(s:NearM1Shadow,a:NearM1Inputs):NearM1Shadow{
  if(!s||s.version!==NEAR_M1_LIMIT_SHADOW_V1||
     s.side!==a.side||s.issuedAt!==a.issuedAt||finished(s.state))return s;
  const q=a.quote||{},at=q.at,bid=q.bid,ask=q.ask;
  const basic=Number.isFinite(a.now)&&Number.isFinite(at)&&
    typeof at==='number'&&at>=a.issuedAt&&at<=a.now&&
    a.now-at<=10_000&&typeof bid==='number'&&typeof ask==='number'&&
    Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>bid&&
    typeof q.source==='string'&&q.source.length>0&&q.source!=='unavailable';
  const venue=sourceVenue(String(q.source||''));
  const historicalVenue=sourceVenue(a.historicalSource||'');
  const matching=venue!=='UNKNOWN'&&(!a.historicalSource||
    (historicalVenue!=='UNKNOWN'&&venue===historicalVenue));
  const usable=basic&&matching;
  const expiresAt=s.issuedAt+60_000;
  if(s.state==='WATCH'){
    // An offer 30 seconds into the bar is not a pre-positioned early order.
    if(a.now>=a.issuedAt+NEAR_M1_FIRST_QUOTE_MS)
      return done(s,'NO_EARLY_QUOTE',a.now,null,
        'لا يوجد عرض سعر مبكر حديث مطابق للمصدر خلال أول 12 ثانية');
    if(!usable)return s;
    if(at!>=a.issuedAt+NEAR_M1_FIRST_QUOTE_MS)
      return done(s,'NO_EARLY_QUOTE',a.now,null,
        'أول سعر صالح جاء بعد نافذة الدخول المبكر');
    const econ=priceEveryM1Limit({side:s.side,bid:bid!,ask:ask!,
      atr:a.atr,cost:a.costEstimate,
      previousOpen:a.previousOpen,previousClose:a.previousClose,
      retestProfile:'NEAR_TICK'});
    if(!econ)return done(s,'COST_UNVIABLE',a.now,null,
      'السبريد أو الهدف الصافي لا يسمحان بـ Near LIMIT قصير');
    return {...s,state:'PENDING',placedAt:at!,entry:econ.entry,stop:econ.stop,
      tp:econ.tp,retestDepth:econ.retestDepth,
      extraCost:econ.extraCost,estimatedNetRewardR:econ.netRewardR,
      source:q.source!,lastAt:at!,
      lastExecutable:s.side==='BUY'?ask!:bid!,
      note:'NEAR LIMIT افتراضي غير قابل للتنفيذ على Exness؛ لم يحدث لمس بعد'};
  }
  const last=s.lastAt,expired=s.state==='PENDING'?expiresAt:
    Number(s.filledAt)+60_000;
  // Do not use quotes after expiry to infer what happened before expiry.
  if(a.now>=expired){
    if(s.state==='PENDING'){
      const safelyObserved=usable&&q.source===s.source&&
        at!>=expired-5000&&at!<=expired&&at!>last&&at!-last<=15_000;
      const px=s.side==='BUY'?ask:bid;
      const crossed=safelyObserved&&
        (s.side==='BUY'?
          Number(s.lastExecutable)>Number(s.entry)&&px!<=Number(s.entry):
          Number(s.lastExecutable)<Number(s.entry)&&px!>=Number(s.entry));
      // A sampled crossing seen only after expiry cannot be counted as
      // either a fill or a definite unfilled order.
      return done(s,safelyObserved&&!crossed?'EXPIRED':'UNKNOWN',a.now,null,
        safelyObserved&&!crossed?'انتهت الدقيقة دون لمس مرصود للـ Limit':
          'انتهت الدقيقة أو ظهر كسر متأخر؛ ترتيب التنفيذ مجهول');
    }
    const currentEligible=usable&&q.source===s.source&&
      at!>=expired-5000&&at!<=expired&&at!>last&&at!-last<=15_000;
    if(currentEligible){
      const exit=s.side==='BUY'?bid!:ask!;
      const stopHit=s.side==='BUY'?exit<=Number(s.stop):exit>=Number(s.stop);
      const tpHit=s.side==='BUY'?exit>=Number(s.tp):exit<=Number(s.tp);
      if(stopHit)return done(s,'STOP',at!,exit,'وقف على آخر عرض صالح قبل انتهاء المدة');
      if(tpHit)return done(s,'QUICK_TP',at!,exit,'هدف على آخر عرض صالح قبل انتهاء المدة');
      return done(s,'TIME_EXIT',expired,exit,'خروج زمني بأحدث Bid/Ask قبل نهاية المدة');
    }
    const observedNearCutoff=Number(s.lastExitAt)>=expired-5000&&
      Number(s.lastExitAt)<=expired&&
      s.lastExitPrice!=null&&Number.isFinite(s.lastExitPrice);
    return observedNearCutoff?
      done(s,'TIME_EXIT',expired,Number(s.lastExitPrice),
        'خروج زمني على آخر Bid/Ask مسجل قبل نهاية 60 ثانية'):
      done(s,'UNKNOWN',expired,null,
        'لا يوجد Bid/Ask موثوق قرب نهاية مدة الصفقة');
  }
  if(basic&&q.source!==s.source)
    return done(s,'UNKNOWN',a.now,null,'مصدر السعر تغير بعد تجهيز Limit');
  if(!usable||at!<=last){
    if(a.now-last>15_000)
      return done(s,'UNKNOWN',a.now,null,
        'فجوة رصد تيكات أطول من 15 ثانية؛ ترتيب الأحداث مجهول');
    return s;
  }
  if(at!-last>15_000)
    return done(s,'UNKNOWN',a.now,null,'انقطاع تيكات يمنع إثبات ترتيب اللمس');
  const executableEntry=s.side==='BUY'?ask!:bid!;
  const executableExit=s.side==='BUY'?bid!:ask!;
  if(s.state==='PENDING'){
    const approached=s.side==='BUY'?
      Number(s.lastExecutable)>Number(s.entry)&&executableEntry<=Number(s.entry):
      Number(s.lastExecutable)<Number(s.entry)&&executableEntry>=Number(s.entry);
    if(!approached)return {...s,lastAt:at!,lastExecutable:executableEntry};
    const risk=Math.abs(Number(s.entry)-Number(s.stop));
    const jumped=Math.abs(executableEntry-Number(s.entry))>risk*.35;
    const pastStop=s.side==='BUY'?
      executableExit<=Number(s.stop):executableExit>=Number(s.stop);
    if(jumped||pastStop)
      return done(s,'UNKNOWN',at!,null,
        'قفزة سعر بين تيكين لا تثبت تنفيذ Limit قبل الوقف');
    return {...s,state:'ACTIVE',lastAt:at!,lastExecutable:executableEntry,
      filledAt:at!,note:'لمس ورقي عند عرض سعر لاحق؛ ليس تأكيد تنفيذ وسيط'};
  }
  const stopped=s.side==='BUY'?
    executableExit<=Number(s.stop):executableExit>=Number(s.stop);
  const targeted=s.side==='BUY'?
    executableExit>=Number(s.tp):executableExit<=Number(s.tp);
  if(stopped)return done(s,'STOP',at!,executableExit,'وقف ورقي مرصود بالجهة القابلة للتنفيذ');
  if(targeted)return done(s,'QUICK_TP',at!,executableExit,'هدف ورقي مرصود بعد تكلفة تقديرية');
  return {...s,lastAt:at!,lastExitAt:at!,lastExitPrice:executableExit};
}
export type NearM1AuditRow={
  strategyVersion?:string;state?:string;netR?:number|null;
  nearLimitShadow?:NearM1Shadow|null
};
export function auditNearM1Shadow(rows:readonly NearM1AuditRow[],baselineVersion:string){
  const cohort=rows.filter(r=>r.strategyVersion===baselineVersion&&
    r.nearLimitShadow?.version===NEAR_M1_LIMIT_SHADOW_V1);
  const near=cohort.map(r=>r.nearLimitShadow!);
  const finishedNear=near.filter(r=>r.netR!=null&&
    ['QUICK_TP','STOP','TIME_EXIT'].includes(r.state));
  const same=cohort.filter(r=>r.nearLimitShadow?.netR!=null&&
    Number.isFinite(r.netR)&&
    ['QUICK_TP','STOP','TIME_EXIT'].includes(r.state||''));
  const sum=(xs:readonly number[])=>rounded(xs.reduce((n,x)=>n+x,0));
  const sameNear=sum(same.map(r=>Number(r.nearLimitShadow!.netR)));
  const sameBase=sum(same.map(r=>Number(r.netR)));
  return {issued:cohort.length,placed:near.filter(x=>x.placedAt!=null).length,
    touched:near.filter(x=>x.filledAt!=null).length,
    resolved:finishedNear.length,
    wins:finishedNear.filter(x=>Number(x.netR)>0).length,
    netR:sum(finishedNear.map(x=>Number(x.netR))),
    noEarlyQuote:near.filter(x=>x.state==='NO_EARLY_QUOTE').length,
    costUnviable:near.filter(x=>x.state==='COST_UNVIABLE').length,
    expired:near.filter(x=>x.state==='EXPIRED').length,
    unknown:near.filter(x=>x.state==='UNKNOWN').length,
    sameCohort:{resolved:same.length,nearNetR:sameNear,
      originalNetR:sameBase,nearMinusOriginalR:rounded(sameNear-sameBase)},
    note:'Near LIMIT ورقي خلال أول 12 ثانية؛ لا Market، ولا ضمان لمس وسيط. مقارنة الصافي فقط عند اكتمال نفس الصفقة للطرفين.'};
}
