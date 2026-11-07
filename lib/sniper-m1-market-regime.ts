import type {M1Bar} from './sniper-mt5-m1';
export type M1MarketRegime='TREND'|'RANGE'|'SQUEEZE'|'MIXED'|'LOW_ACTIVITY'|'INVALID';
export type M1RegimeSignal={
 regime:M1MarketRegime;ready:boolean;at:number|null;
 efficiency:number;compression:number;flatCount:number;atr:number;
 reason:string;brokerAuthorized:false;
};
/** Regime from ONLY 32 consecutive, already CLOSED M1 bars.
 * Each 'flat' is zero open/close movement; it can reflect a genuine
 * quiet market OR bad upstream aggregation. Neither is called a trade.
 */
export function classifyM1MarketRegime(raw:readonly M1Bar[],now:number):M1RegimeSignal{
 const empty=(reason:string):M1RegimeSignal=>({
  regime:'INVALID',ready:false,at:null,efficiency:0,
  compression:0,flatCount:0,atr:0,reason,brokerAuthorized:false
 });
 const rows=raw.slice(-32);
 if(rows.length!==32||!Number.isFinite(now))return empty('32 closed M1 required');
 for(let i=0;i<rows.length;i++){
  const b=rows[i];
  if(!Number.isSafeInteger(b.time)||b.time%60000!==0||
    b.time+60000>now||[b.open,b.high,b.low,b.close].some(v=>!Number.isFinite(v)||v<=0)||
    b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||
    i>0&&b.time-rows[i-1].time!==60000)
   return empty('M1 source gap, invalid OHLC or unclosed bar');
 }
 const last=rows.at(-1)!,closedAt=last.time+60000;
 if(now-closedAt>=60000||now<closedAt)
   return empty('stale closed M1');
 const tr=rows.slice(-15).map((b,i,a)=>i===0?b.high-b.low:
   Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),
     Math.abs(b.low-a[i-1].close)));
 const atr=tr.reduce((sum,v)=>sum+v,0)/tr.length;
 if(!Number.isFinite(atr)||atr<=0)return empty('zero measured range');
 const last8=rows.slice(-8),older=rows.slice(-24,-8);
 const avgRange=(a:readonly M1Bar[])=>
   a.reduce((sum,b)=>sum+b.high-b.low,0)/a.length;
 const olderRange=avgRange(older),recentRange=avgRange(last8);
 const compression=olderRange>0?Math.max(0,Math.min(100,
   Math.round((1-recentRange/olderRange)*100))):0;
 const flatCount=last8.filter(b=>b.open===b.close).length;
 const impulse=last8.reduce((sum,b,i)=>i>0?
   sum+Math.abs(b.close-last8[i-1].close):sum,0);
 const delta=Math.abs(last8.at(-1)!.close-last8[0].close);
 const efficiency=impulse>0?Math.max(0,Math.min(1,delta/impulse)):0;
 const regime:M1MarketRegime=flatCount>=5||recentRange<atr*.10?
   'LOW_ACTIVITY':compression>=34?'SQUEEZE':
   efficiency>=.65?'TREND':efficiency<=.26?'RANGE':'MIXED';
 return {regime,ready:true,at:closedAt,
   efficiency:Number(efficiency.toFixed(3)),compression,flatCount,
   atr:Number(atr.toFixed(6)),brokerAuthorized:false,
   reason:regime==='LOW_ACTIVITY'?'Low-body activity; check market vs feed quality':
     regime==='SQUEEZE'?'Past range contraction before any breakout':
     regime==='TREND'?'Past M1 closes directional and efficient':
     regime==='RANGE'?'Past closes overlap; momentum unreliable':
     'Mixed historical M1 regime'};
}
