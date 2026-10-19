/** Gold XAUUSD market-structure radar. OHLC is NOT an order book:
 * we observe price rejection, confirmed liquidity sweeps and breakout after
 * compression from fully CLOSED same-feed M1 candles only.
 */
export type GoldSide='BUY'|'SELL'|'WAIT';
export type GoldBar={time:number;open:number;high:number;low:number;close:number;
 volume?:number;volumeBasis?:string};
export type GoldRadarReading={ready:boolean;
 phase:'UNAVAILABLE'|'BALANCE'|'COMPRESSION'|'WATCH'|'CONFIRMED';
 side:GoldSide;label:string;reason:string;eventAt:number|null;
 price:number|null;confirm:number|null;invalidate:number|null;
 evidence:string[];source:string;method:'CLOSED_M1_PRICE_ACTION';
 actionable:false;};
const NONE=(reason:string,source=''):GoldRadarReading=>({
 ready:false,phase:'UNAVAILABLE',side:'WAIT',label:'الذهب: تجهيز',
 reason,eventAt:null,price:null,confirm:null,invalidate:null,
 evidence:[],source,method:'CLOSED_M1_PRICE_ACTION',actionable:false
});
export const trustedSpotGoldSource=(source:string)=>
 /^(Biquote · MT5 XAUUSD candles|Massive · C:XAUUSD|Twelve Data · XAU\/USD|Exness\/MT5 · [A-Za-z0-9_.-]+)$/i.test(source)
 &&!/proxy|comex|GC=F/i.test(source);
export function readGoldLiquidityRadar(input:{
 now:number;source:string;bars:readonly GoldBar[];marketOpen:boolean
}):GoldRadarReading{
 const {now,source,marketOpen}=input;
 if(!marketOpen)return NONE('سوق الذهب مغلق',source);
 if(!trustedSpotGoldSource(source))return NONE('بيانات الذهب الفوري غير موثوقة أو مصدر عقود بديلة',source);
 const series=[...input.bars].sort((a,b)=>a.time-b.time).slice(-44);
 if(series.length<36||series.some((b,i)=>
   !Number.isSafeInteger(b.time)||b.time%60000!==0||
   b.time+60000>now||!([b.open,b.high,b.low,b.close].every(Number.isFinite))||
   b.open<=0||b.low<=0||b.high<Math.max(b.open,b.close)||
   b.low>Math.min(b.open,b.close)||
   (i>0&&b.time-series[i-1].time!==60000)))
   return NONE('شموع M1 غير مكتملة أو غير متصلة',source);
 const last=series.at(-1)!,at=last.time+60000;
 if(now-at<0||now-at>90000)return NONE('شموع M1 مغلقة لكنها غير حديثة',source);
 const ranges=series.slice(-22).map((b,i,a)=>i?
   Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),
     Math.abs(b.low-a[i-1].close)):b.high-b.low).slice(1);
 const tr=[...ranges].sort((a,b)=>a-b);
 const atr=tr[Math.floor(tr.length/2)]||0;
 if(!(atr>0)||atr>last.close*.012)
   return NONE('تقلب M1 غير قابل للقياس',source);
 const ref=series.slice(-15,-1),near=series.slice(-6,-1);
 const upper=Math.max(...ref.map(b=>b.high)),lower=Math.min(...ref.map(b=>b.low));
 const recentUpper=Math.max(...near.map(b=>b.high)),recentLower=Math.min(...near.map(b=>b.low));
 const range=last.high-last.low;
 const body=Math.abs(last.close-last.open);
 const smallRange=Math.max(...series.slice(-9,-1).map(b=>b.high))-
   Math.min(...series.slice(-9,-1).map(b=>b.low));
 const closePosition=range?(last.close-last.low)/range:0;
 const base={ready:true,phase:'BALANCE' as const,side:'WAIT' as const,
   label:'توازن سعري',reason:'لا توجد إشارة مكتملة بعد',
   eventAt:at,price:last.close,confirm:null,invalidate:null,
   evidence:[] as string[],source,method:'CLOSED_M1_PRICE_ACTION' as const,
   actionable:false as const};
 if(range<=0||range>atr*4.5)
   return {...base,phase:'WATCH',label:'شمعة صدمة أو بلا مدى',
     reason:'نستبعد شمعة M1 شاذة قبل قراءة السيولة'};
 const pad=Math.max(atr*.13,last.close*.000012);
 const lowerSweep=last.low<Math.min(recentLower,lower)-pad&&
   last.close>recentLower+pad*.25&&closePosition>=.65&&
   last.low<last.open&&range>=atr*.7&&body>=atr*.10;
 const upperSweep=last.high>Math.max(recentUpper,upper)+pad&&
   last.close<recentUpper-pad*.25&&closePosition<=.35&&
   last.high>last.open&&range>=atr*.7&&body>=atr*.10;
 if(lowerSweep&&!upperSweep)
   return {...base,phase:'CONFIRMED',side:'BUY',label:'سحب سيولة قاع',
     reason:'سحب قاع M1 سابق ثم إغلاق راجع أعلى المستوى؛ السعر فقط وليس أوامر بنوك',
     confirm:last.close+pad,invalidate:last.low-pad,
     evidence:['سحب قاع مغلق','رفض هبوط','إغلاق عائد للنطاق']};
 if(upperSweep&&!lowerSweep)
   return {...base,phase:'CONFIRMED',side:'SELL',label:'سحب سيولة قمة',
     reason:'سحب قمة M1 سابق ثم إغلاق راجع أسفل المستوى؛ السعر فقط وليس أوامر بنوك',
     confirm:last.close-pad,invalidate:last.high+pad,
     evidence:['سحب قمة مغلقة','رفض صعود','إغلاق عائد للنطاق']};
 const narrow=smallRange<=atr*3.6;
 const breakUp=narrow&&last.close>Math.max(...series.slice(-9,-1).map(b=>b.high))+pad&&
   closePosition>=.72&&last.close-last.open>=atr*.48&&
   range<=atr*2.8;
 const breakDown=narrow&&last.close<
   Math.min(...series.slice(-9,-1).map(b=>b.low))-pad&&
   closePosition<=.28&&last.open-last.close>=atr*.48&&
   range<=atr*2.8;
 if(breakUp)
   return {...base,phase:'CONFIRMED',side:'BUY',label:'كسر ضغط لأعلى',
     reason:'بعد نطاق M1 مضغوط، إغلاق قوي خارج النطاق لأعلى',
     confirm:last.close+pad,invalidate:Math.min(...series.slice(-9,-1).map(b=>b.low))-pad,
     evidence:['ضغط سعري','كسر بإغلاق M1','جسم قوي']};
 if(breakDown)
   return {...base,phase:'CONFIRMED',side:'SELL',label:'كسر ضغط لأسفل',
     reason:'بعد نطاق M1 مضغوط، إغلاق قوي خارج النطاق لأسفل',
     confirm:last.close-pad,invalidate:Math.max(...series.slice(-9,-1).map(b=>b.high))+pad,
     evidence:['ضغط سعري','كسر بإغلاق M1','جسم قوي']};
 return narrow?{...base,phase:'COMPRESSION',
   label:'انضغاط سعري',reason:'نطاق ضيق حقيقي، الاتجاه لم يتأكد'}:
   {...base,phase:'BALANCE',label:'توازن سعري',
     reason:'لا يوجد سحب سيولة أو كسر مؤكّد من الشموع المغلقة'};
}
