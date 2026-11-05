import {sourceVenue} from './sampled-live-candle';

/** Prospective, read-only M1 tick study. A first meaningful two-tick signal
 * is FROZEN when observed, at most 20 seconds after candle start. It never
 * changes the original forecast, entry/exit logic or claimed broker fills.
 */
export type ForwardPulseSide='BUY'|'SELL';
export type ForwardPulse={
  source:string;firstAt:number;lastAt:number;firstMid:number;
  highMid:number;lowMid:number;count:number;valid:boolean;
  firstSide:ForwardPulseSide|null;firstAtSignal:number|null;
  firstAgree:boolean|null;firstMoveAtr:number|null;
};
export type ForwardPulseQuote={
  at:number|null|undefined;bid:number|null|undefined;
  ask:number|null|undefined;source:string|null|undefined
};
export type ForwardPulseArgs={
  previous:ForwardPulse|null|undefined;quote:ForwardPulseQuote;
  now:number;issuedAt:number;anchorClose:number|null|undefined;
  atr:number|null|undefined;forecastSide:ForwardPulseSide;
  historicalSource?:string
};
export const FORWARD_PULSE_WINDOW_MS=20_000;
export const M1_FORWARD_PULSE_V1='M1_FORWARD_TICK_EARLY_V1';
const good=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export function advanceForwardM1Pulse(a:ForwardPulseArgs):ForwardPulse|null{
  const {previous:q0,quote:q,now,issuedAt,anchorClose,atr}=a;
  if(!good(now)||!good(issuedAt)||!good(anchorClose)||anchorClose<=0||
     !good(atr)||atr<=0||!good(q.at)||!good(q.bid)||!good(q.ask)||
     q.bid<=0||q.ask<=q.bid||typeof q.source!=='string'||!q.source||
     q.source==='unavailable'||q.at<issuedAt||q.at>=issuedAt+60_000||
     now<q.at||now-q.at>10_000||now<issuedAt)return q0??null;
  // Never combine feed venues, even when Bid/Ask values look similar.
  const venue=sourceVenue(q.source);
  const historyVenue=sourceVenue(a.historicalSource||'');
  if(a.historicalSource&&
     (venue==='UNKNOWN'||venue!==historyVenue))return q0??null;
  const mid=(q.bid+q.ask)/2,spread=q.ask-q.bid;
  if(!q0)return {
    source:q.source,firstAt:q.at,lastAt:q.at,firstMid:mid,highMid:mid,lowMid:mid,
    count:1,valid:true,firstSide:null,firstAtSignal:null,
    firstAgree:null,firstMoveAtr:null
  };
  if(!q0.valid)return q0;
  if(q.source!==q0.source)return {...q0,valid:false};
  if(q.at<=q0.lastAt)return q0; // ignore duplicated/out-of-order quotes
  if(q.at-q0.lastAt>15_000)return {...q0,valid:false}; // gap: ordered path unknown
  const updated:ForwardPulse={...q0,lastAt:q.at,
    highMid:Math.max(q0.highMid,mid),
    lowMid:Math.min(q0.lowMid,mid),count:q0.count+1};
  if(q0.firstSide!==null||q.at-issuedAt>FORWARD_PULSE_WINDOW_MS)
    return updated;
  const displacement=mid-anchorClose;
  const minimum=Math.max(atr*.12,spread*1.15);
  if(Math.abs(displacement)<minimum)return updated;
  const firstSide:ForwardPulseSide=displacement>0?'BUY':'SELL';
  return {...updated,firstSide,firstAtSignal:q.at,
    firstAgree:firstSide===a.forecastSide,firstMoveAtr:
      Math.round(Math.abs(displacement/atr)*1000)/1000};
}
export type PulseAuditRow={
  issuedAt:number;side:ForwardPulseSide;
  directionObserved?:'BUY'|'SELL'|'FLAT'|'UNKNOWN'|null;
  pulse?:ForwardPulse|null;
};
export function auditForwardM1Pulse(rows:readonly PulseAuditRow[]){
  const total=rows.length;
  const observed=rows.filter(t=>t.pulse?.count&&t.pulse.count>=2);
  const locked=rows.filter(t=>t.pulse?.valid&&t.pulse.firstSide&&
    t.pulse.firstAtSignal!=null&&t.pulse.firstAtSignal>=t.issuedAt&&
    t.pulse.firstAtSignal<=t.issuedAt+FORWARD_PULSE_WINDOW_MS);
  const resolved=locked.filter(t=>t.directionObserved==='BUY'||
    t.directionObserved==='SELL');
  const earlyHits=resolved.filter(t=>t.pulse!.firstSide===t.directionObserved).length;
  const originalHits=resolved.filter(t=>t.side===t.directionObserved).length;
  const agree=resolved.filter(t=>t.pulse!.firstAgree===true);
  const counter=resolved.filter(t=>t.pulse!.firstAgree===false);
  const grade=(items:typeof resolved)=>({
    graded:items.length,earlyHits:items.filter(t=>
      t.pulse!.firstSide===t.directionObserved).length,
    originalHits:items.filter(t=>t.side===t.directionObserved).length
  });
  return {
    issued:total,sampled:observed.length,earlySignals:locked.length,
    graded:resolved.length,earlyHits,originalHits,
    earlyAccuracyPct:resolved.length?
      Math.round(earlyHits/resolved.length*1000)/10:null,
    originalAccuracySameCohortPct:resolved.length?
      Math.round(originalHits/resolved.length*1000)/10:null,
    agree:grade(agree),counter:grade(counter),
    unknown:locked.filter(t=>t.directionObserved==='UNKNOWN').length,
    flat:locked.filter(t=>t.directionObserved==='FLAT').length,
    waiting:locked.filter(t=>t.directionObserved==null).length,
    insufficient:total-locked.length,
    // This is NOT independent OOS or a profitability claim.
    note:'فحص أمامي لتيكين جديدين داخل أول 20 ثانية، من نفس المصدر؛ النتيجة بعد إغلاق M1 فقط. لا يغيّر التنفيذ.'
  };
}
