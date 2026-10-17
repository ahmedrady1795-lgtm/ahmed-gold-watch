/**
 * Observational BTC path from the server's EXISTING structural forecast.
 * The UI previously rendered a server path only when a broker trade plan
 * passed; that erased useful directional analysis throughout WAIT sessions.
 * This module NEVER authorizes an entry, synthesizes a zone or predicts
 * individual future candles. No uncalibrated confidence percentage is used.
 */
type Side='BUY'|'SELL'|'WAIT';
type Zone={low:number;high:number};
type Status='STALE'|'NO_PATH'|'CONFLICT'|'SINGLE_FRAME'|'ALIGNED';
export type BtcStructuralScenario={
 status:Status;side:Side;title:string;detail:string;
 destination:Zone|null;destinationMid:number|null;invalidation:number|null;
 alignment:string;sourceAt:number|null;actionable:false;
};
const finite=(x:unknown):number|null=>typeof x==='number'&&Number.isFinite(x)?x:null;
const zone=(raw:any):Zone|null=>{
 const low=finite(raw?.low),high=finite(raw?.high);
 return low!=null&&high!=null&&low>0&&high>=low?{low,high}:null;
};
const direction=(x:unknown):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
export function assessBtcStructuralScenario(input:{
 now:number;sourceAt:number;price:number|null;priceFresh:boolean;
 m5:unknown;forecast:any;radar?:{status:string;side:Side};
}):BtcStructuralScenario{
 const none=(status:Status,title:string,detail:string):BtcStructuralScenario=>({
   status,side:'WAIT',title,detail,destination:null,destinationMid:null,
   invalidation:null,alignment:'لا يوجد تأكيد متاح',sourceAt:null,actionable:false
 });
 const now=input.now,at=input.sourceAt,price=input.price;
 if(!input.priceFresh||price==null||!Number.isFinite(price)||price<=0||
   !Number.isFinite(at)||at<=0||at>now+2000||now-at>120000)
   return none('STALE','انتظار قراءة السوق الحديثة','السعر أو التوقع المحسوب من الخادم غير حديث');
 // Require genuinely CLOSED M5 candles, with valid timestamps. A model snapshot
 // by itself cannot substitute for genuine observable market context.
 const m5=Array.isArray(input.m5)?input.m5:[];
 const recent=m5.filter((b:any)=>Number.isFinite(b?.time)&&
   b.time%300000===0&&b.time+300000<=now&&
   [b.open,b.high,b.low,b.close].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0)&&
   b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close))
   .sort((a:any,b:any)=>a.time-b.time).slice(-18);
 if(recent.length<18||recent.some((b:any,i:number)=>
    i>0&&b.time-recent[i-1].time!==300000)||
   now-(recent.at(-1)!.time+300000)>13*60000)
   return none('STALE','إغلاقات M5 غير كافية','المسار لا يظهر من شموع قديمة أو غير متصلة');
 const raw=input.forecast?.pathForecast;
 const side=direction(raw?.side);
 const dest=zone(raw?.destination);
 if(side==='WAIT'||!dest)
   return none('NO_PATH','لا يوجد مسار هيكلي مكتمل','السوق قيد المسح بدون وجهة سعرية صالحة');
 // The structural objective must be genuinely ahead of the current quote.
 const mid=(dest.low+dest.high)/2,delta=side==='BUY'?dest.high-price:price-dest.low;
 if(delta<=price*.00002||delta>price*.04||
   (side==='BUY'&&dest.low<price-price*.0006)||
   (side==='SELL'&&dest.high>price+price*.0006))
   return none('NO_PATH','الهدف لم يعد صالحًا للسعر الحالي',
     'منطقة المسار وصلت بالفعل أو أصبحت على الجانب الخطأ أو بعيدة بصورة غير موثوقة');
 const guard=raw?.consensusGuard;
 const h1=guard?.m1,h5=guard?.m5;
 const validVote=(h:any)=>h?.gate==='PASSED'&&direction(h?.side)!=='WAIT'?direction(h.side):'WAIT';
 const m1=validVote(h1),m5Side=validVote(h5);
 if((m1!=='WAIT'&&m1!==side)||(m5Side!=='WAIT'&&m5Side!==side)||
   input.radar?.status==='CONFLICT')
   return none('CONFLICT','تعارض الأدلة على الاتجاه',
     'أحد الأطر يرفض المسار أو M1 وM5 متعارضان؛ لا ترجيح اتجاهي');
 const aligned=m1===side&&m5Side===side;
 const single=(m1===side?1:0)+(m5Side===side?1:0)===1;
 if(!aligned&&!single)return none('NO_PATH','المسار غير مؤكد بالأطر',
   'لم يجتز أي إطار زمني التحقق المطلوب');
 // An existing server path may have been reset to unqualified due to
 // structural trigger changes. It remains a watch, not an execution plan.
 const invalid=finite(raw?.invalidation?.price);
 const invalidation=invalid!=null&&invalid>0&&
   (side==='BUY'?invalid<price:invalid>price)&&
   Math.abs(invalid-price)<price*.06?invalid:null;
 const name=side==='BUY'?'صاعد':'هابط';
 return {
   status:aligned?'ALIGNED':'SINGLE_FRAME',side,
   title:'توقع '+name+' · '+(aligned?'توافق M1/M5':'تأييد إطار واحد'),
   detail:aligned?
     'مسار هيكلي مرصود من الخادم مع توافق إطارين؛ لا يعني أن الصفقة صالحة':
     'مسار هيكلي للمراقبة فقط؛ تأكيد الإطار الآخر غير مكتمل',
   destination:dest,destinationMid:mid,invalidation,
   alignment:aligned?'توافق M1 وM5':'توافق جزئي · لا إشارة دخول',
   sourceAt:at,actionable:false
 };
}
