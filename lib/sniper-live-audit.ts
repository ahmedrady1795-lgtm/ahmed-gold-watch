/**
 * Browser-local, forward-only audit for V1 live M1/M5 alerts.
 * It records ONLY alerts actually displayed while this browser is open.
 * Subsequent CLOSED M1 bars, from the same source, score outcomes.
 * A target+stop in one M1 candle is UNKNOWN, never claimed as a win.
 */
export type AlertSide='BUY'|'SELL';
export type AuditKind='PREPARE'|'BREAK';
export type AuditOutcome='PENDING'|'HIT'|'STOP'|'TIMEOUT'|'AMBIGUOUS'|'GAP'|'NO_TARGET'|'BREAK_OBSERVED';
export type LiveAuditRecord={
 key:string;asset:'GOLD'|'BTC';source:string;kind:AuditKind;side:AlertSide;
 issuedAt:number;sourceAt:number;trigger:number;stop:number;
 target:number|null;expireAt:number;checkedThrough:number;
 outcome:AuditOutcome;resolvedAt:number|null;
};
type Candle={time:number;open:number;high:number;low:number;close:number};
type Signal={phase:string;side:string;trigger:number|null;invalidation:number|null;
 targets:number[];sourceAt:number|null};
const MIN=60000;
const good=(c:Candle)=>c&&[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&
 c.time>0&&c.time%MIN===0&&c.low>0&&
 c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close);
const terminal=(x:AuditOutcome)=>x!=='PENDING';
const keyFor=(a:'GOLD'|'BTC',source:string,k:AuditKind,side:AlertSide,stamp:number)=>
  [a,source,k,side,stamp].join('|');
export function issueLiveAlertAudit(rows:LiveAuditRecord[],input:{
 asset:'GOLD'|'BTC';source:string;now:number;sourceReady:boolean;signal:Signal
}):LiveAuditRecord[]{
 const {now,asset,source,signal}=input;
 if(!input.sourceReady||!source||!Number.isFinite(now)||
  !Number.isFinite(signal.sourceAt)||signal.sourceAt==null||
  signal.sourceAt>now||now-signal.sourceAt>120000||
  !Number.isFinite(signal.trigger)||signal.trigger==null||signal.trigger<=0||
  !Number.isFinite(signal.invalidation)||signal.invalidation==null||signal.invalidation<=0||
  !(signal.side==='BUY'||signal.side==='SELL'))return rows;
 const side=signal.side as AlertSide;
 if(!(side==='BUY'?signal.trigger>signal.invalidation:signal.trigger<signal.invalidation))return rows;
 const kind:AuditKind|null=signal.phase==='PREPARE'?'PREPARE':
   signal.phase==='BREAK_CONFIRMED'?'BREAK':null;
 if(kind!=='BREAK'&&kind!=='PREPARE')return rows;
 if(kind==='PREPARE'&&rows.some(r=>r.kind==='PREPARE'&&r.asset===asset&&
   r.source===source&&r.side===side&&now-r.issuedAt<15*MIN&&now>=r.issuedAt))return rows;
 const key=keyFor(asset,source,kind,side,signal.sourceAt);
 if(rows.some(r=>r.key===key))return rows;
 const target=kind==='BREAK'?
   signal.targets.filter(Number.isFinite).find(v=>side==='BUY'?v>signal.trigger!:v<signal.trigger!)??null:null;
 return [...rows,{
   key,asset,source,kind,side,issuedAt:now,sourceAt:signal.sourceAt,
   trigger:signal.trigger,stop:signal.invalidation,target,expireAt:now+(kind==='PREPARE'?15:30)*MIN,
   checkedThrough:Math.ceil(now/MIN)*MIN-MIN,
   outcome:kind==='BREAK'&&target==null?'NO_TARGET':'PENDING',
   resolvedAt:kind==='BREAK'&&target==null?now:null
 }].slice(-100);
}
export function evaluateLiveAlertAudit(rows:LiveAuditRecord[],raw:unknown,now:number):LiveAuditRecord[]{
 if(!Number.isFinite(now))return rows;
 const candles=(Array.isArray(raw)?raw:[]).filter(good)
   .filter(c=>c.time+MIN<=now).sort((a,b)=>a.time-b.time);
 return rows.map(r=>{
   if(terminal(r.outcome))return r;
   const last=Math.min(now,r.expireAt);
   let expected=r.checkedThrough+MIN;
   let outcome:AuditOutcome=r.outcome, resolvedAt:number|null=null;
   const eligible=candles.filter(c=>c.time>=expected&&c.time+MIN<=last);
   let checkedThrough=r.checkedThrough;
   for(const c of eligible){
     if(c.time!==expected){outcome='GAP';resolvedAt=c.time;break;}
     const target=r.kind==='PREPARE'?
       (r.side==='BUY'?c.close>r.trigger:c.close<r.trigger):
       (r.side==='BUY'?c.high>=r.target!:c.low<=r.target!);
     const stop=r.side==='BUY'?c.low<=r.stop:c.high>=r.stop;
     if(target&&stop)outcome='AMBIGUOUS';
     else if(stop)outcome='STOP';
     else if(target)outcome=r.kind==='PREPARE'?'BREAK_OBSERVED':'HIT';
     checkedThrough=c.time;
     expected=c.time+MIN;
     if(terminal(outcome)){resolvedAt=c.time+MIN;break;}
   }
   if(!terminal(outcome)&&now>=r.expireAt+MIN){
      outcome=expected>=r.expireAt?'TIMEOUT':'GAP';
      resolvedAt=now;
   }
   if(outcome===r.outcome&&checkedThrough===r.checkedThrough)return r;
   return {...r,outcome,checkedThrough,resolvedAt};
 });
}
export function summarizeLiveAlertAudit(rows:LiveAuditRecord[]){
 const breaks=rows.filter(r=>r.kind==='BREAK');
 const eligible=breaks.filter(r=>['HIT','STOP','TIMEOUT'].includes(r.outcome));
 const hits=eligible.filter(r=>r.outcome==='HIT').length;
 const detectionSeconds=breaks.map(r=>Math.max(0,(r.issuedAt-r.sourceAt)/1000));
 const early=rows.filter(r=>r.kind==='PREPARE');
 const earlyResolved=early.filter(r=>['BREAK_OBSERVED','STOP','TIMEOUT'].includes(r.outcome));
 const earlyBreaks=early.filter(r=>r.outcome==='BREAK_OBSERVED');
 const leads=earlyBreaks.map(r=>(r.resolvedAt!-r.issuedAt)/1000);
 const avg=(a:number[])=>a.length?Math.round(a.reduce((p,c)=>p+c,0)/a.length):null;
 return {breakCount:breaks.length,targetEvaluated:eligible.length,
  targetHits:hits,targetHitRate:eligible.length?hits/eligible.length:null,
  missingTarget:breaks.filter(r=>r.outcome==='NO_TARGET').length,
  ambiguous:breaks.filter(r=>r.outcome==='AMBIGUOUS').length,
  gaps:breaks.filter(r=>r.outcome==='GAP').length,
  avgDetectionLagSeconds:avg(detectionSeconds),
  earlyCount:early.length,earlyResolved:earlyResolved.length,
  earlyBreaks:earlyBreaks.length,avgLeadSeconds:avg(leads)};
}
export function cleanLiveAuditStorage(raw:unknown,asset:'GOLD'|'BTC',source:string):LiveAuditRecord[]{
 if(!Array.isArray(raw))return [];
 return raw.filter((r:any)=>r&&r.asset===asset&&r.source===source&&
   (r.kind==='BREAK'||r.kind==='PREPARE')&&(r.side==='SELL'||r.side==='BUY')&&
   typeof r.key==='string'&&r.key.length<300&&
   ['PENDING','HIT','STOP','TIMEOUT','AMBIGUOUS','GAP','NO_TARGET','BREAK_OBSERVED'].includes(r.outcome)&&
   [r.issuedAt,r.sourceAt,r.trigger,r.stop,r.expireAt,r.checkedThrough].every(Number.isFinite)&&
   r.issuedAt>0&&r.expireAt>r.issuedAt).slice(-100);
}
