/**
 * BTC movement outlook for the CHART, not order execution. An unqualified
 * forecast never inherits authority from a strong technical M1/M5 bias.
 * Shows contradictory historical price-destination paths explicitly.
 */
type Side='BUY'|'SELL'|'WAIT';
type Horizon={
 side?:Side;confidence?:number;independentFamilies?:number;
 gateReason?:string;learning?:{recentKill?:boolean;quality?:string;
   directional?:number;last8Accuracy?:number;recentAccuracy?:number};
};
export type BtcForwardObservation={
 status:'STALE'|'SCANNING'|'CONFLICT'|'M1_WATCH'|'M5_WATCH'|'ALIGNED_WATCH';
 side:Side;m1:Side;m5:Side;legacySide:Side;conflict:boolean;
 title:string;reason:string;horizonSummary:string;
 modelQualified:false;entryQualified:false;
};
const side=(x:unknown):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
const label=(s:Side)=>s==='BUY'?'الصعود':s==='SELL'?'الهبوط':'الحياد';
function accepted(raw:Horizon|undefined):Side{
 if(!raw||raw.gateReason!=='PASSED')return 'WAIT';
 if(raw.learning?.recentKill===true)return 'WAIT';
 if(!Number.isFinite(Number(raw.confidence))||Number(raw.confidence)<48)return 'WAIT';
 if(!Number.isFinite(Number(raw.independentFamilies))||Number(raw.independentFamilies)<2)return 'WAIT';
 return side(raw.side);
}
export function assessBtcForwardObservation(input:{
 now:number;modelAt:number;priceFresh:boolean;historyFresh:boolean;
 observationFresh:boolean;horizons:any;zone:any;
}):BtcForwardObservation{
 const h=input.horizons||{},zone=input.zone||{};
 const m1Raw:Horizon=h.oneMinute??h.m1??{},m5Raw:Horizon=h.fiveMinute??h.m5??{};
 const legacySide=side(zone?.path?.side);
 const empty=(status:BtcForwardObservation['status'],title:string,reason:string):
 BtcForwardObservation=>({status,side:'WAIT',m1:'WAIT',m5:'WAIT',legacySide,
   conflict:false,title,reason,horizonSummary:'التحليل الفني غير مؤهل',
   modelQualified:false,entryQualified:false});
 // Unlike price freshness, model freshness comes ONLY from the inference
 // timestamp, not the separately updated chart-history endpoint.
 if(!input.priceFresh||!input.historyFresh||!input.observationFresh||
   !Number.isFinite(input.modelAt)||input.modelAt<=0||
   input.modelAt>input.now+2000||input.now-input.modelAt>90000)
   return empty('STALE','تحليل الحركة ينتظر بيانات حديثة',
     'شموع M1 أو السعر أو حساب AI غير حديث؛ لا اتجاه مباشر');
 const m1=accepted(m1Raw),m5=accepted(m5Raw);
 let status:BtcForwardObservation['status']='SCANNING',resolved:Side='WAIT';
 if(m1!=='WAIT'&&m5!=='WAIT'){
   if(m1===m5){status='ALIGNED_WATCH';resolved=m5;}
   else status='CONFLICT';
 }else if(m5!=='WAIT'){status='M5_WATCH';resolved=m5;}
 else if(m1!=='WAIT'){status='M1_WATCH';resolved=m1;}
 const conflict=legacySide!=='WAIT'&&resolved!=='WAIT'&&legacySide!==resolved;
 const horizonSummary='M1: '+(m1==='WAIT'?'غير مؤهل':label(m1))+
   ' · M5: '+(m5==='WAIT'?'غير مؤهل':label(m5));
 const title=status==='ALIGNED_WATCH'?'توافق فني '+label(resolved)+' على M1/M5':
   status==='M5_WATCH'?'رصد '+label(resolved)+' على M5 فقط':
   status==='M1_WATCH'?'رصد '+label(resolved)+' على M1 فقط':
   status==='CONFLICT'?'تعارض مباشر بين M1 وM5':
   'مراقبة الحركة · لا توافق اتجاه مؤهل';
 const base=status==='ALIGNED_WATCH'?
   'توافق عائلات المؤشرات الفنية؛ لا دليل بعد على دقة التنبؤ المستقبلية':
   status==='M5_WATCH'||status==='M1_WATCH'?
   'اتجاه فني على إطار واحد فقط؛ تأكيد الإطار الآخر ناقص':
   status==='CONFLICT'?'اتجاها M1 وM5 متعارضان؛ لا ترجيح':
   'المحركات غير مؤهلة أو تتطلب مزيدًا من الإغلاقات';
 const reason=conflict?
   base+' · مسار الأهداف القديم يرجّح '+label(legacySide)+
   ' عكس '+label(resolved)+'؛ تم إبقاؤه غير مؤهل':base;
 return {status,side:resolved,m1,m5,legacySide,conflict,title,reason,
   horizonSummary,modelQualified:false,entryQualified:false};
}
