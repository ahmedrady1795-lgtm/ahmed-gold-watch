/**
 * Causal liquidity-sweep evidence shared by the chart and paper scalp engine.
 * A wick through a previously observable level is a candidate; the NEXT fully
 * closed M1 candle must confirm rejection before it may qualify any setup.
 * Price-derived stop-pool inference, not measured resting orders or a win rate.
 */
export type SweepSide='BUY'|'SELL';
export type SweepStatus='PENDING'|'CONFIRMED'|'TRAP';
export type SweepBar={time:number;open:number;high:number;low:number;close:number;volume?:number;realVolume?:number;tickVolume?:number};
export type LiquiditySweep={
  id:string;side:SweepSide;status:SweepStatus;sweepAt:number;
  confirmedAt:number|null;level:number;extreme:number;invalidation:number;
  trigger:number|null;wickRatio:number;penetrationAtr:number;
  volumeRatio:number|null;reason:string;reference:'CLOSED_M1_PRICE_ACTION';
};
export type SweepScan={ok:boolean;reason:string;latestClosedAt:number|null;events:LiquiditySweep[]};
const round=(x:number)=>Number(x.toFixed(5));
function usable(c:SweepBar){
  return c&&[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&
    c.time>0&&c.time%60000===0&&c.low>0&&
    c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close);
}
function avg(x:number[]){return x.reduce((s,v)=>s+v,0)/Math.max(1,x.length);}
export function detectLiquiditySweeps(raw:readonly SweepBar[],now:number,lookback=12):SweepScan{
  const empty=(reason:string):SweepScan=>({ok:false,reason,latestClosedAt:null,events:[]});
  if(!Array.isArray(raw)||!Number.isFinite(now)||now<=0)return empty('INVALID_SOURCE');
  const dedup=new Map<number,SweepBar>();
  for(const c of raw)if(usable(c)&&c.time+60000<=now)dedup.set(c.time,c);
  const rows=[...dedup.values()].sort((a,b)=>a.time-b.time).slice(-320);
  if(rows.length<Math.max(30,lookback+16))return empty('INSUFFICIENT_CLOSED_M1');
  const latestClosedAt=rows.at(-1)!.time+60000;
  if(now-latestClosedAt>120000)return {ok:false,reason:'STALE_M1',latestClosedAt,events:[]};
  const recent=rows.slice(-24);
  if(recent.some((c,i)=>i>0&&c.time-recent[i-1].time!==60000))
    return {ok:false,reason:'M1_GAP',latestClosedAt,events:[]};
  const events:LiquiditySweep[]=[];
  const offset=Math.max(8,Math.min(24,Math.floor(lookback)));
  // Restrict to recent history to avoid expensive scans on each refresh.
  for(let i=Math.max(offset,rows.length-90);i<rows.length;i++){
    const previous=rows.slice(i-offset,i),c=rows[i],next=rows[i+1];
    if(previous.length!==offset||previous.some((v,j)=>j>0&&v.time-previous[j-1].time!==60000)||
      c.time-previous.at(-1)!.time!==60000||
      next&&next.time-c.time!==60000)continue;
    const atr=Math.max(.000001,avg(previous.slice(-14).map(x=>x.high-x.low)));
    const upper=Math.max(...previous.map(x=>x.high)),lower=Math.min(...previous.map(x=>x.low));
    const range=c.high-c.low;
    if(range<=0)continue;
    const realVol=Number(c.realVolume??c.tickVolume??c.volume??0);
    const priorVol=previous.map(x=>Number(x.realVolume??x.tickVolume??x.volume??0)).filter(x=>x>0);
    const volumeRatio=realVol>0&&priorVol.length>=8?round(realVol/avg(priorVol)):null;
    const create=(side:SweepSide,level:number,extreme:number,wickRatio:number)=>{
      const isBuy=side==='BUY';
      const penetrationAtr=Math.abs(extreme-level)/atr;
      // A genuine sweep rejects the broken level, but entry needs a SECOND
      // separately closed minute, not the wick candle itself.
      const confirmed=Boolean(next&&(isBuy
        ?next.close>c.close+atr*.03&&next.close>level&&next.low>extreme
        :next.close<c.close-atr*.03&&next.close<level&&next.high<extreme));
      const status:SweepStatus=!next?'PENDING':confirmed?'CONFIRMED':'TRAP';
      const confirmedAt=confirmed?next!.time+60000:null;
      events.push({
        id:side+'-'+c.time+'-'+round(level),side,status,sweepAt:c.time,
        confirmedAt,level:round(level),extreme:round(extreme),
        invalidation:round(extreme+(isBuy?-1:1)*atr*.12),
        trigger:confirmed?round(next!.close):null,
        wickRatio:round(wickRatio),penetrationAtr:round(penetrationAtr),
        volumeRatio,reference:'CLOSED_M1_PRICE_ACTION',
        reason:confirmed?'اختراق ذيل ثم استرداد المستوى وتأكيد M1 مغلق':
          status==='PENDING'?'سحب محتمل؛ انتظار إغلاق M1 التالي':
          'رفض مبدئي دون تأكيد الشمعة التالية؛ فخ غير مؤهل'
      });
    };
    const penetration=Math.max(atr*.055,c.close*.000005);
    if(c.low<lower-penetration&&c.close>lower+atr*.045&&
      (Math.min(c.open,c.close)-c.low)/range>=.28)
      create('BUY',lower,c.low,(Math.min(c.open,c.close)-c.low)/range);
    if(c.high>upper+penetration&&c.close<upper-atr*.045&&
      (c.high-Math.max(c.open,c.close))/range>=.28)
      create('SELL',upper,c.high,(c.high-Math.max(c.open,c.close))/range);
  }
  return {ok:true,reason:'CLOSED_M1_CAUSAL',latestClosedAt,
    events:events.slice(-24)};
}
export function activeConfirmedSweep(scan:SweepScan,now:number,withinMs=180000):LiquiditySweep|null{
  if(!scan.ok||!Number.isFinite(now))return null;
  return scan.events.filter(e=>e.status==='CONFIRMED'&&e.confirmedAt!=null&&
    e.confirmedAt<=now&&now-e.confirmedAt<=withinMs).at(-1)??null;
}
