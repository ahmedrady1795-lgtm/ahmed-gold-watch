import type {M1Bar} from './sniper-mt5-m1';
export type M1PreBreak={
  ready:boolean;side:'BUY'|'SELL'|'WAIT';compression:number;
  reason:string;sourceAt:number|null;
  evidence:'RISING_LOWS'|'FALLING_HIGHS'|'NONE';
};
/**
 * Local closed-M1 setup BEFORE range expansion: 3 rising lows / falling
 * highs, contracting 4-bar range, close-location confirmation.
 * No fabricated quotes, volume or certainty. No broker execution.
 */
export function detectM1PreBreak(rows:readonly M1Bar[],now:number):M1PreBreak{
 const empty=(reason:string):M1PreBreak=>({
   ready:false,side:'WAIT',compression:0,reason,sourceAt:null,evidence:'NONE'
 });
 const xs=rows.slice(-32);
 if(xs.length<32||!Number.isFinite(now))return empty('مطلوب 32 إغلاق دقيقة متجاور');
 if(xs.some((v,i)=>!Number.isSafeInteger(v.time)||v.time%60000!==0||
     v.time+60000>now||[v.open,v.high,v.low,v.close].some(x=>!Number.isFinite(x)||x<=0)||
     v.high<Math.max(v.open,v.close)||v.low>Math.min(v.open,v.close)||
     i>0&&v.time-xs[i-1].time!==60000))
   return empty('فجوات أو شموع M1 غير صالحة');
 const last=xs.at(-1)!,age=now-last.time-60000;
 if(age<0||age>=60000)return empty('لا توجد شمعة M1 مغلقة حديثة');
 const baseline=xs.slice(4,-8),short=xs.slice(-4),prior=xs.slice(-8,-4);
 const mean=(a:readonly M1Bar[])=>a.reduce((sum,v)=>sum+v.high-v.low,0)/a.length;
 const width=mean(short),reference=mean(baseline),atr=Math.max(reference,1e-9);
 const compression=Math.max(0,Math.min(100,
   Math.round((1-width/Math.max(reference,1e-9))*100)));
 if(!Number.isFinite(width)||!Number.isFinite(reference)||reference<=0||
     width>reference*.78||width<atr*.055)
   return {ready:true,side:'WAIT',compression,reason:'الانضغاط غير مكتمل',sourceAt:last.time+60000,evidence:'NONE'};
 const final=short.slice(-3);
 const rising=final.every((v,i)=>i===0||v.low>final[i-1].low+atr*.012);
 const falling=final.every((v,i)=>i===0||v.high<final[i-1].high-atr*.012);
 const rangeHigh=Math.max(...short.map(v=>v.high)),
   rangeLow=Math.min(...short.map(v=>v.low));
 const pos=(last.close-rangeLow)/Math.max(1e-9,rangeHigh-rangeLow);
 const prevHigh=Math.max(...prior.map(v=>v.high)),
   prevLow=Math.min(...prior.map(v=>v.low));
 // A pre-break hypothesis is NOT formed after price already broke the
 // prior box; that would be chasing an observed move.
 const beforeBreak=last.close<=prevHigh&&last.close>=prevLow;
 const rise=beforeBreak&&rising&&!falling&&pos>.56;
 const fall=beforeBreak&&falling&&!rising&&pos<.44;
 const side=rise?'BUY':fall?'SELL':'WAIT';
 return {ready:true,side,compression,
   reason:side==='BUY'?'انضغاط M1 وقيعان صاعدة قبل خروج السعر من النطاق':
     side==='SELL'?'انضغاط M1 وقمم هابطة قبل خروج السعر من النطاق':
       'ضغط متعارض؛ لا استباق اتجاه بلا دليل',
   sourceAt:last.time+60000,
   evidence:rise?'RISING_LOWS':fall?'FALLING_HIGHS':'NONE'};
}
