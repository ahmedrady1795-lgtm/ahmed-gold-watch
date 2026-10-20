/**
 * Immutable BEFORE-the-event M15 projection verification.
 * No synthetic bar is an actual quote. Test ONLY subsequently closed,
 * same-source, exact-time M15 candles; never call a drawn TP a win.
 */
export type ForwardBar={open:number;high:number;low:number;close:number};
export type M15ForwardProof={
 asset:'GOLD'|'BTC';source:string;anchorTime:number;createdAt:number;
 anchorPrice:number;bars:ForwardBar[];
};
export type M15ObservedClose=ForwardBar&{time:number};
export function evaluateM15ForwardProof(record:M15ForwardProof,
 observed:readonly M15ObservedClose[],now:number){
 const M15=900000,blank={
   evaluated:0,directionMatches:0,meanAbsoluteCloseError:null as number|null,
   detail:'بانتظار شموع M15 مكتملة من نفس المصدر',missing:false
 };
 if(!record||!Number.isFinite(record.anchorTime)||record.anchorTime%M15!==0||
   !Number.isFinite(record.createdAt)||record.createdAt<record.anchorTime||
   record.createdAt>=record.anchorTime+M15||
   !Number.isFinite(record.anchorPrice)||record.anchorPrice<=0||
   !Array.isArray(record.bars)||!record.bars.length||
   record.bars.length>48||record.bars[0]?.open!==record.anchorPrice)
   return {...blank,detail:'لا يوجد سجل توقع مُثبت قبل بداية الشموع',missing:true};
 const byTime=new Map(observed.filter(b=>Number.isFinite(b.time)&&
   b.time%M15===0&&b.time+M15<=now&&
   [b.open,b.high,b.low,b.close].every(Number.isFinite)&&
   b.low>0&&b.high>=Math.max(b.open,b.close)&&
   b.low<=Math.min(b.open,b.close)).map(b=>[b.time,b]));
 let matches=0,evaluated=0,error=0,missing=false;
 for(let i=0;i<record.bars.length;i++){
   const expectedTime=record.anchorTime+M15*(i+1);
   if(expectedTime+M15>now)break;
   const real=byTime.get(expectedTime),forecast=record.bars[i];
   if(!real){missing=true;break;}
   if(![forecast.open,forecast.high,forecast.low,forecast.close].every(Number.isFinite)||
     forecast.low<=0||forecast.high<Math.max(forecast.open,forecast.close)||
     forecast.low>Math.min(forecast.open,forecast.close)){missing=true;break;}
   const forecastSign=Math.sign(forecast.close-forecast.open);
   const actualSign=Math.sign(real.close-real.open);
   if(forecastSign!==0&&forecastSign===actualSign)matches++;
   error+=Math.abs(forecast.close-real.close);
   evaluated++;
 }
 const mean=evaluated?error/evaluated:null;
 return {evaluated,directionMatches:matches,meanAbsoluteCloseError:mean,
   missing,detail:evaluated?
     'مقارنة '+evaluated+' شمعة M15 حقيقية أُغلقت بعد تثبيت التوقع؛ توافق اتجاه '+
     matches+' من '+evaluated+'؛ متوسط فرق الإغلاق '+mean!.toFixed(2)+
     (missing?'؛ توجد فجوة مصدر، أُوقف التقييم':'')+
     '؛ لا يثبت ذلك ربحية أو أفضلية على السوق':
     (missing?'نقص في شموع المصدر الحقيقي؛ لا يمكن إثبات السيناريو':
       'بانتظار إغلاق أول شمعة M15 مستقبلية كاملة')};
}
