import type {RadarView} from './order-flow-radar';

/**
 * One-venue BTC order flow is secondary evidence for the NEXT candle only.
 * A scanner event never changes the frozen M15 forecast, TP or stop and
 * never constitutes an executable order or a calibrated win probability.
 */
export type RadarNextCandlePhase=
  'UNAVAILABLE'|'WATCH'|'PREPARE'|'WAIT_M1'|'VERIFIED'|'CONFLICT'|'CANCELLED';
type Side='BUY'|'SELL'|'WAIT';
export type RadarNextCandleDecision={
 phase:RadarNextCandlePhase;label:string;reason:string;
 side:Side;confirm:number|null;invalidate:number|null;
 actionable:false;
};
export function assessRadarNextCandle(input:{
 asset:'GOLD'|'BTC';candleSource:string;side:Side;price:number|null;
 priceFresh:boolean;now:number;radar:RadarView|null;
 m1:{qualified:boolean;lastClosedAt:number|null;reason:string}|null;
}):RadarNextCandleDecision{
 const status=(phase:RadarNextCandlePhase,label:string,reason:string,
   side:Side='WAIT',confirm:number|null=null,invalidate:number|null=null):
   RadarNextCandleDecision=>({phase,label,reason,side,confirm,invalidate,
     actionable:false});
 if(input.asset!=='BTC')return status('UNAVAILABLE','رادار BTC فقط',
   'الذهب لا يملك هنا دفتر أوامر مركزيًا موثقًا');
 // Comparing Kraken OHLC with Coinbase microstructure creates false confirmations.
 const venue=String(input.candleSource||'');
 if(!/coinbase/i.test(venue)||/kraken|okx|binance/i.test(venue))
   return status('UNAVAILABLE','المصدر مختلف',
     'تأكيد Coinbase متوقف حتى يطابق مصدر شموع وسعر BTC');
 if(!input.priceFresh||input.price==null||!Number.isFinite(input.price)||
    input.price<=0||!Number.isFinite(input.now))
   return status('UNAVAILABLE','انتظار سعر حديث',
     'التأكيد ممنوع عندما يكون السعر أو التاريخ غير صالح');
 const r=input.radar;
 if(!r||r.phase==='WARMUP'||r.phase==='OFFLINE')
   return status('UNAVAILABLE','الرادار غير جاهز',
     'انتظار تدفق صفقات ودفتر أوامر Coinbase المتصل');
 if(r.phase==='WATCH'||r.side==='WAIT')
   return status('WATCH','مراقبة',
     'لم يثبت امتصاص مستمر أو مستويات تفعيل حتى الآن');
 const buy=r.side==='BUY';
 const levelsValid=Number.isFinite(r.confirm)&&Number.isFinite(r.invalidate)&&
   r.confirm!=null&&r.invalidate!=null&&r.confirm>0&&r.invalidate>0&&
   (buy?r.confirm>r.invalidate:r.confirm<r.invalidate);
 if(!levelsValid||!Number.isFinite(r.since)||r.since<=0||
   r.since>input.now+2000)
   return status('UNAVAILABLE','مستويات غير مكتملة',
     'لا نعتمد إشارة دون مستويات وساعة بداية صحيحة');
 if(r.phase==='INVALIDATED'||r.phase==='EXPIRED'||
   input.now-r.since>120000||
   (buy?input.price<=r.invalidate!:input.price>=r.invalidate!))
   return status('CANCELLED','إلغاء تأكيد الأولى',
     'مستوى الإبطال لُمِس أو انتهت صلاحية الرصد؛ السيناريو لا يُعاد رسمه',
     r.side,r.confirm,r.invalidate);
 if(input.side==='WAIT')
   return status('WATCH','اتجاه القناص معلّق',
     'الرادار وحده لا ينشئ سيناريو أو صفقة',r.side,r.confirm,r.invalidate);
 if(input.side!==r.side)
   return status('CONFLICT','تعارض الاتجاه',
     'الرادار يعارض السيناريو؛ لا نعتمد أول شمعة',r.side,r.confirm,r.invalidate);
 if(r.phase==='PREPARE')
   return status('PREPARE','استعداد الأولى',
     'امتصاص محتمل، لكن الكسر والسيولة وإغلاق M1 لم يجتمعوا بعد',
     r.side,r.confirm,r.invalidate);
 if(r.phase!=='CONFIRMED')
   return status('WATCH','انتظار تأكيد','حالة الرادار ليست مؤهلة',
     r.side,r.confirm,r.invalidate);
 if(!input.m1?.qualified||input.m1.lastClosedAt==null||
    input.m1.lastClosedAt<r.since)
   return status('WAIT_M1','بانتظار إغلاق M1',
     input.m1?.qualified?
      'الشمعة المؤيدة أغلقت قبل تنبيه الرادار؛ ننتظر إغلاقًا لاحقًا':
      (input.m1?.reason||'نحتاج شمعة M1 مغلقة مؤيدة للاتجاه'),
     r.side,r.confirm,r.invalidate);
 return status('VERIFIED','تأكيد مشترك للأولى',
   'كسر الرادار + إغلاق M1 لاحق مؤيد، رصد فقط وليس نسبة نجاح أو تنفيذًا',
   r.side,r.confirm,r.invalidate);
}
