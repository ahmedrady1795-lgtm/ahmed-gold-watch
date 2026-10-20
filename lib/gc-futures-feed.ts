/**
 * Public GC=F front-month continuation quote + optional licensed COMEX GC
 * contract feed. Yahoo chart quotes are delayed/reference data by design:
 * timestamps never upgrade them to a true realtime exchange lead.
 */
export type GcFuturesSnapshot={
 available:boolean;symbol:string;exchange:string;source:string;
 status:'UNAVAILABLE'|'DELAYED'|'STALE'|'LIVE';contract:string|null;
 price:number|null;previous:number|null;change5mPct:number|null;
 quoteAt:number|null;checkedAt:number;ageSeconds:number|null;
 directContract:boolean;orderBook:false;executedTrades:false;
 eligibleForLead:boolean;reason:string;
};
const unavailable=(now:number,reason:string):GcFuturesSnapshot=>({
 available:false,symbol:'GC',exchange:'COMEX',source:'GC futures reference',
 status:'UNAVAILABLE',contract:null,price:null,previous:null,
 change5mPct:null,quoteAt:null,checkedAt:now,ageSeconds:null,
 directContract:false,orderBook:false,executedTrades:false,
 eligibleForLead:false,reason
});
const numberPrice=(x:unknown):number|null=>typeof x==='number'&&
 Number.isFinite(x)&&x>0&&x<100000?x:null;
const age=(now:number,ms:number)=>Math.max(0,Math.floor((now-ms)/1000));
function validAt(now:number,ms:number){
 return Number.isSafeInteger(ms)&&ms>0&&ms<=now+120000&&now-ms<=5*86400000;
}
export function parseYahooGC(raw:unknown,now:number):GcFuturesSnapshot{
 const body=raw as any;
 const entry=body?.chart?.result?.[0];
 if(body?.chart?.error||entry?.meta?.symbol!=='GC=F')
   return unavailable(now,'مزود أسعار GC=F رفض الطلب أو غيّر صيغة الرد');
 const stamps=entry?.timestamp,closes=entry?.indicators?.quote?.[0]?.close;
 if(!Array.isArray(stamps)||!Array.isArray(closes)||
   stamps.length!==closes.length||stamps.length<2||stamps.length>2000)
   return unavailable(now,'لا توجد شموع دقيقة لعقود GC موثقة زمنياً');
 const bars:{at:number;close:number}[]=[];
 for(let i=0;i<stamps.length;i++){
   const at=Number(stamps[i])*1000,close=numberPrice(closes[i]);
   if(close!=null&&validAt(now,at)&&at%60000===0&&
     (bars.length===0||at>bars.at(-1)!.at))
     bars.push({at,close});
 }
 const last=bars.at(-1);
 if(!last)return unavailable(now,'مواعيد GC غير متحققة');
 const seconds=age(now,last.at);
 const prev=bars.findLast(b=>b.at<=last.at-5*60000&&
   last.at-b.at<=12*60000);
 const change=prev?
   Number(((last.close/prev.close-1)*100).toFixed(3)):null;
 // GC=F is a vendor front-month CONTINUATION, not an exact expiry
 // and NOT the CME real-time order book.
 return {available:seconds<=5400,symbol:'GC=F',exchange:'COMEX',
   source:'Yahoo Finance · GC=F (تغذية متأخرة)',
   status:seconds<=5400?'DELAYED':'STALE',contract:null,
   price:last.close,previous:prev?.close??null,change5mPct:change,
   quoteAt:last.at,checkedAt:now,ageSeconds:seconds,
   directContract:false,orderBook:false,executedTrades:false,
   eligibleForLead:false,
   reason:seconds<=5400?'سعر مرجعي متأخر؛ لا نستخدمه لإثبات قيادة GC للسبوت':
     'آخر شمعة GC قديمة، لا نعرضها كمصدر حي'};
}
/** A licensed connector must identify the SPECIFIC front-month contract;
 * GCUSD and synthetic commodity indices are NOT COMEX GC contracts.
 * Contract feed payload: {exchange:"COMEX",symbol:"GCZ26",price:...,at:epochMs}.
 */
export function parseLicensedGC(raw:unknown,now:number):GcFuturesSnapshot{
 const r=raw as Record<string,unknown>|null;
 const symbol=typeof r?.symbol==='string'?r.symbol:'';
 const price=numberPrice(r?.price),at=r?.at;
 if(r?.exchange!=='COMEX'||!/^GC[FGHJKMNQUVXZ][0-9]{1,2}$/.test(symbol)||
   price==null||typeof at!=='number'||!validAt(now,at))
   return unavailable(now,'مصدر العقود المرخّص: الرمز أو السعر أو التوقيت غير صالح');
 const seconds=age(now,at),live=now-at<=10000;
 return {available:live,symbol,exchange:'COMEX',
   source:'موصل بيانات GC المرخّص',status:live?'LIVE':'STALE',
   contract:symbol,price,previous:null,change5mPct:null,
   quoteAt:at,checkedAt:now,ageSeconds:seconds,directContract:true,
   orderBook:false,executedTrades:false,
   eligibleForLead:false, // price alone cannot prove venue leadership
   reason:live?'سعر عقد GC محدد، لكن قيادة السوق تحتاج مقارنة تنفيذات متزامنة':
     'آخر رسالة من العقد المرخّص قديمة'};
}
