/**
 * Last-CLOSED-M1 checkpoint before STARTING a new paper sniper scenario.
 * No future bars, no intrabar wick as confirmation, no probability claims.
 * This is an additional quality filter; it NEVER issues trading orders.
 */
type Side='BUY'|'SELL'|'WAIT';
type Bar={time:number;open:number;high:number;low:number;close:number};
const finite=(x:any)=>x!=null&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const med=(xs:number[])=>{
 const v=xs.filter(Number.isFinite).sort((a,b)=>a-b);
 return v.length?v[Math.floor(v.length/2)]:0;
};
export function assessSniperEntryCandle(input:{
 history:any;now:number;side:Side;price:number|null;sourceReady:boolean
}){
 const no=(status:'UNAVAILABLE'|'BUILDING'|'BLOCKED',reason:string,atr:number|null=null,lastClosedAt:number|null=null)=>
   ({qualified:false,status,reason,atr,lastClosedAt,bodyAtr:null as number|null,
     closePosition:null as number|null,firstTargetSignal:false,executionAuthority:false as const});
 if(input.side==='WAIT')return no('BUILDING','لا يوجد اتجاه مؤهل لفحص شمعة الدخول');
 if(!input.sourceReady)return no('UNAVAILABLE','السعر أو مصدر شموع M1 غير حديث');
 const now=input.now,price=finite(input.price);
 if(!Number.isFinite(now)||price==null||price<=0)return no('UNAVAILABLE','سعر التأكيد غير صالح');
 const unique=new Map<number,Bar>(),conflicts=new Set<number>();
 for(const c of Array.isArray(input.history)?input.history:[]){
   const time=finite(c?.time),open=finite(c?.open),high=finite(c?.high),
     low=finite(c?.low),close=finite(c?.close);
   if(time==null||open==null||high==null||low==null||close==null||
     time<=0||time%60000!==0||time+60000>now||open<=0||low<=0||
     high<Math.max(open,close)||low>Math.min(open,close))continue;
   const old=unique.get(time);
   if(old&&(old.open!==open||old.high!==high||old.low!==low||old.close!==close))
     conflicts.add(time);
   unique.set(time,{time,open,high,low,close});
 }
 const rows=[...unique.values()].sort((a,b)=>a.time-b.time);
 const tail=rows.slice(-24),last=tail.at(-1),previous=tail.at(-2);
 if(tail.length<24||!last||!previous)return no('UNAVAILABLE','نحتاج 24 شمعة M1 مغلقة للتحقق');
 const closedAt=last.time+60000;
 if(now<closedAt||now-closedAt>90000)return no('UNAVAILABLE','آخر شمعة M1 مغلقة متأخرة',null,closedAt);
 if(tail.some((bar,i)=>conflicts.has(bar.time)||(i>0&&bar.time-tail[i-1].time!==60000)))
   return no('UNAVAILABLE','فجوة أو تضارب في شموع M1؛ لا نعتمد التأكيد',null,closedAt);
 const tr=tail.slice(1).map((bar,i)=>Math.max(bar.high-bar.low,
   Math.abs(bar.high-tail[i].close),Math.abs(bar.low-tail[i].close)));
 const atr=med(tr);
 if(!Number.isFinite(atr)||atr<=0||atr>last.close*.035)
   return no('UNAVAILABLE','تقلب M1 غير صالح للقياس',null,closedAt);
 if(Math.abs(price-last.close)>atr*1.25)
   return no('BLOCKED','ابتعاد السعر عن آخر إغلاق M1؛ تجنب مطاردة الشمعة',atr,closedAt);
 if(Math.max(last.high-last.low,previous.high-previous.low)>atr*3.4)
   return no('BLOCKED','شمعة صدمة سعرية؛ انتظار استقرار التأكيد',atr,closedAt);
 const sign=input.side==='BUY'?1:-1,range=last.high-last.low,
   body=sign*(last.close-last.open),
   closePosition=range>0?(sign===1?(last.close-last.low)/range:
     (last.high-last.close)/range):0;
 const bodyAtr=body/atr;
 const twoBarProgress=sign*(last.close-previous.open);
 const qualified=range>=atr*.12&&bodyAtr>=.12&&closePosition>=.57&&
   twoBarProgress>=atr*.06;
 return {qualified,status:qualified?'CONFIRMED' as const:'BUILDING' as const,
   reason:qualified?'آخر M1 أغلقت مع الاتجاه وبجسم واضح دون مطاردة السعر':
     body<=0?'آخر M1 عكس اتجاه القنص؛ ننتظر إغلاقًا مؤيدًا':
     closePosition<.57?'إغلاق M1 بعيد عن طرف الحركة؛ احتمال رفض المستوى قائم':
     'جسم M1 أو امتداد آخر شمعتين غير كافٍ لتفعيل القنص',
   atr,lastClosedAt:closedAt,
   bodyAtr:Number(bodyAtr.toFixed(2)),closePosition:Number(closePosition.toFixed(2)),
   firstTargetSignal:qualified,executionAuthority:false as const};
}
