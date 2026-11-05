import type {SampledLiveCandle} from './sampled-live-candle';
import type {EveryM1Direction} from './sniper-m1-every-direction';

/**
 * A read-only, intra-minute observation of tick samples seen in this browser.
 * The prediction was frozen before this minute opened. Current quote movement
 * must never change its side, count as a closed-candle hit, or authorize a fill.
 * Prices are sampled mid/last quotes, not executable broker bid/ask.
 */
export type IntrabarPulseStatus='UNAVAILABLE'|'FIRST_TICK'|'NOISE'|
  'ALIGNED'|'COUNTER'|'FADING';
export type IntrabarPulse={
  status:IntrabarPulseStatus;
  forecastSide:'BUY'|'SELL'|null;
  observedSide:'BUY'|'SELL'|'FLAT'|null;
  ticks:number;sampledMove:number|null;moveAtr:number|null;
  maxFavorableAtr:number|null;pullbackAtr:number|null;
  issuedAt:number|null;reason:string;
};
const unavailable=(reason:string):IntrabarPulse=>({
  status:'UNAVAILABLE',forecastSide:null,observedSide:null,ticks:0,
  sampledMove:null,moveAtr:null,maxFavorableAtr:null,pullbackAtr:null,
  issuedAt:null,reason
});
export function inspectM1Intrabar(args:{
  forecast:EveryM1Direction|null;
  sampled:SampledLiveCandle|null;
  anchorClose:number|null;
  now:number;
}):IntrabarPulse{
  const {forecast,sampled,anchorClose,now}=args;
  if(!forecast)return unavailable('لم يصدر توقع جديد من شمعة مغلقة');
  const missing=unavailable('لا توجد تيكات حديثة متطابقة المصدر للشمعة الحالية');
  missing.forecastSide=forecast.side;
  missing.issuedAt=forecast.issuedAt;
  if(!sampled||!sampled.matchedVenue||sampled.time!==forecast.issuedAt||
    !Number.isFinite(anchorClose)||anchorClose===null||anchorClose<=0||
    !Number.isFinite(forecast.atr)||forecast.atr<=0||
    !Number.isFinite(now)||now<forecast.issuedAt||now>=forecast.issuedAt+60000||
    sampled.lastAt<forecast.issuedAt||sampled.lastAt>now+1000||
    now-sampled.lastAt>10000||
    ![sampled.open,sampled.high,sampled.low,sampled.close].every(
      n=>Number.isFinite(n)&&n>0)||
    sampled.high<Math.max(sampled.open,sampled.close)||
    sampled.low>Math.min(sampled.open,sampled.close)||
    !Number.isSafeInteger(sampled.count)||sampled.count<1)return missing;

  const atr=forecast.atr,sign=forecast.side==='BUY'?1:-1;
  const signedMove=sign*(sampled.close-anchorClose);
  const signedAtr=signedMove/atr;
  const favorable=(forecast.side==='BUY'?
    sampled.high-anchorClose:anchorClose-sampled.low)/atr;
  const retreat=(forecast.side==='BUY'?
    sampled.high-sampled.close:sampled.close-sampled.low)/atr;
  const observedDelta=sampled.close-anchorClose;
  const observedSide=Math.abs(observedDelta)<atr*.10?'FLAT':
    observedDelta>0?'BUY':'SELL';
  let status:IntrabarPulseStatus='NOISE',reason='الحركة المرصودة أقل من نطاق التأكيد النسبي';
  if(sampled.count<2){
    status='FIRST_TICK';
    reason='تيك واحد لا يكشف تسارعًا أو ارتدادًا داخل الشمعة';
  }else if(signedAtr<=-.12){
    status='COUNTER';
    reason='الحركة اللحظية عكس توقع ما قبل افتتاح الدقيقة';
  }else if(favorable>=.20&&retreat>=.15&&
    retreat/Math.max(favorable,1e-8)>=.55){
    status='FADING';
    reason='السعر تراجع بوضوح عن أفضل امتداد مرصود داخل الدقيقة';
  }else if(signedAtr>=.12){
    status='ALIGNED';
    reason='التيكات المرصودة تتحرك مع التوقع، دون إثبات الإغلاق أو التنفيذ';
  }
  return {
    status,forecastSide:forecast.side,observedSide,
    ticks:sampled.count,sampledMove:sampled.close-anchorClose,
    moveAtr:signedAtr,maxFavorableAtr:favorable,pullbackAtr:retreat,
    issuedAt:forecast.issuedAt,reason
  };
}
