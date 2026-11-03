import type {M15GuideBar,M15WatchGuide} from './sniper-m15-watch-guide';

export type HuntSide='BUY'|'SELL';
export type HuntSweep='HIGH_REJECTION'|'LOW_REJECTION'|'NONE';
export type HuntPreviewCandle={
  time:number;open:number;high:number;low:number;close:number;
  side:HuntSide;step:number;illustrative:true
};
export type HuntPool={kind:'HIGH_POOL'|'LOW_POOL';price:number;low:number;high:number};
export type M15HuntPreview={
  ready:boolean;reason:string;anchor:number|null;anchorTime:number|null;
  preferred:HuntSide|'WAIT';strength:number;sweep:HuntSweep;
  referenceOnly:boolean;atr:number|null;
  buy:HuntPreviewCandle[];sell:HuntPreviewCandle[];pools:HuntPool[];
};

const blank=(reason:string):M15HuntPreview=>({
  ready:false,reason,anchor:null,anchorTime:null,preferred:'WAIT',strength:0,
  sweep:'NONE',referenceOnly:true,atr:null,buy:[],sell:[],pools:[]
});
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const price=(v:number)=>Number(v.toFixed(6));
const offsets=[.18,.52,.43,.85,.70,1.52] as const;
const wicks=[.20,.14,.18,.16,.23,.19] as const;

/**
 * An educational what-if sequence from 16 *closed* contiguous M15 bars.
 * Both scenarios exist even when bias is WAIT. These are NOT future trades
 * or a model trained/calibrated to predict individual candle closes.
 *
 * Real values only: guide anchor, historical ATR, observed swing pools.
 * Hypothetical values: the 6 future candle bodies/wicks and touch order.
 */
export function buildM15HuntPreview(
  history:readonly M15GuideBar[],guide:M15WatchGuide,now:number
):M15HuntPreview{
  if(!guide.ready||guide.anchor==null||guide.anchorTime==null||
     guide.atr==null||guide.atr<=0||!Number.isFinite(now))
    return blank(guide.reason||'لا يوجد نطاق M15 صالح');
  const rows=history.slice(-16),last=rows.at(-1);
  if(!last||rows.length<16||last.time!==guide.anchorTime||
    last.close!==guide.anchor||last.time+900000>now)
    return blank('إغلاق M15 لا يطابق مرجع السيناريو');
  for(let i=1;i<rows.length;i++){
    if(rows[i].time-rows[i-1].time!==900000)return blank('فجوة بين شموع M15');
  }
  const atr=guide.atr,anchor=guide.anchor;
  const trailing=rows.slice(-13,-1);
  const previousHigh=Math.max(...trailing.map(b=>b.high));
  const previousLow=Math.min(...trailing.map(b=>b.low));
  // A sweep is only an observed wick past earlier highs/lows followed by
  // a CLOSED rejection. No access to hidden orders or institutional identity.
  const highRejection=last.high>previousHigh+atr*.04&&
    last.close<previousHigh&&last.close<last.open;
  const lowRejection=last.low<previousLow-atr*.04&&
    last.close>previousLow&&last.close>last.open;
  const sweep:HuntSweep=highRejection?'HIGH_REJECTION':
    lowRejection?'LOW_REJECTION':'NONE';
  const preferred:HuntSide|'WAIT'=highRejection?'SELL':
    lowRejection?'BUY':guide.bias;
  const relativeBody=Math.abs(last.close-last.open)/Math.max(atr,.000001);
  const momentum=Math.abs(rows.at(-1)!.close-rows.at(-5)!.close)/Math.max(atr,.000001);
  // Strength of price-action alignment only (NOT an empirical probability).
  const strength=preferred==='WAIT'?0:Math.round(clamp(
    32+Math.min(20,relativeBody*20)+Math.min(21,momentum*10)+
    (sweep!=='NONE'?18:0),30,89
  ));
  const make=(side:HuntSide):HuntPreviewCandle[]=>{
    const polarity=side==='BUY'?1:-1;
    let prior=anchor;
    return offsets.map((stepOffset,i)=>{
      const open=prior;
      const close=price(anchor+polarity*stepOffset*atr);
      const high=price(Math.max(open,close)+wicks[i]*atr);
      const low=price(Math.max(.000001,Math.min(open,close)-
        (wicks[i]+(i%2)*.05)*atr));
      prior=close;
      return {time:guide.anchorTime!+(i+1)*900000,
        open:price(open),high,low,close,side,step:i+1,illustrative:true};
    });
  };
  const buffer=Math.max(atr*.13,anchor*.00001);
  const pools:HuntPool[]=[
    {kind:'HIGH_POOL',price:price(previousHigh),
      low:price(previousHigh-buffer),high:price(previousHigh+buffer)},
    {kind:'LOW_POOL',price:price(previousLow),
      low:price(Math.max(.000001,previousLow-buffer)),
      high:price(previousLow+buffer)}
  ];
  return {ready:true,reason:guide.reason,anchor,anchorTime:guide.anchorTime,
    preferred,strength,sweep,referenceOnly:guide.referenceOnly,atr,
    buy:make('BUY'),sell:make('SELL'),pools};
}
