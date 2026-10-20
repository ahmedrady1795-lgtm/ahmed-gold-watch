/**
 * Read-only PRE-MOVE evidence from real venue-specific order-book observations.
 * Does NOT identify participants, detect hidden orders as facts, forecast the
 * GC futures venue, or grant trade execution authority.
 * No "score" here is a win-rate, probability, or calibration.
 */
import type {OrderFlowMicroEvidence} from './order-flow-microstructure';
import type {Mt5GoldDomReading} from './gold-mt5-dom';
export type PrepSide='BUY'|'SELL'|'WAIT';
export type PreparationPhase='UNAVAILABLE'|'OBSERVING'|'BUY_PREP'|'SELL_PREP'|'MIXED';
export type PreparationReading={
 available:boolean;phase:PreparationPhase;side:PrepSide;
 label:string;source:string;observations:string[];
 icebergCandidate:boolean;withdrawalWarning:boolean;
 gcConnected:false;actionable:false;
};
const EMPTY=(source:string,label:string):PreparationReading=>({
 available:false,phase:'UNAVAILABLE',side:'WAIT',label,source,
 observations:[],icebergCandidate:false,withdrawalWarning:false,
 gcConnected:false,actionable:false
});
const ready=(source:string,buy:string[],sell:string[],
 icebergCandidate:boolean,withdrawalWarning:boolean):PreparationReading=>{
 const phase:PreparationPhase=buy.length&&sell.length?'MIXED':
   buy.length?'BUY_PREP':sell.length?'SELL_PREP':'OBSERVING';
 const side:PrepSide=phase==='BUY_PREP'?'BUY':phase==='SELL_PREP'?'SELL':'WAIT';
 return {available:true,phase,side,source,
   label:phase==='BUY_PREP'?'تحضير صعود محتمل':
     phase==='SELL_PREP'?'تحضير هبوط محتمل':
     phase==='MIXED'?'أدلة متعارضة':'مراقبة السيولة',
   observations:[...buy,...sell],
   icebergCandidate,withdrawalWarning,gcConnected:false,actionable:false};
};
export function btcPreparation(input:{
 fresh:boolean;micro?:OrderFlowMicroEvidence|null;
 replenishments:number;side:PrepSide
}):PreparationReading{
 const source='Coinbase BTC-USD · دفتر L2 وصفقات منفذة';
 const m=input.micro;
 if(!input.fresh||!m?.ready||m.spanSeconds<6||m.snapshots<5)
   return EMPTY(source,'تدفق الأوامر غير متاح أو لم يكتمل');
 const buy:string[]=[],sell:string[]=[];
 if(m.possibleBidAbsorption)buy.push('امتصاص بيع هجومي مع ثبات الطلب والسعر');
 if(m.possibleAskAbsorption)sell.push('امتصاص شراء هجومي مع ثبات العرض والسعر');
 if(m.possibleAskPull)buy.push('انسحاب عروض معلنة أكبر من التنفيذ المرصود');
 if(m.possibleBidPull)sell.push('انسحاب طلبات معلنة أكبر من التنفيذ المرصود');
 if(m.buyQueuePressure)buy.push('ضغط طابور الطلب أعلى أفضل سعر');
 if(m.sellQueuePressure)sell.push('ضغط طابور العرض أعلى أفضل سعر');
 const refills=Number.isSafeInteger(input.replenishments)?
   Math.max(0,input.replenishments):0;
 const icebergCandidate=refills>=2&&
   (input.side==='BUY'&&m.possibleBidAbsorption||
     input.side==='SELL'&&m.possibleAskAbsorption);
 if(icebergCandidate)
   (input.side==='BUY'?buy:sell).push(
     'تجدد معلن بعد تنفيذات عند المستوى · بصمة Iceberg محتملة فقط');
 const withdrawalWarning=m.possibleAskPull||m.possibleBidPull;
 // Never infer intentional spoofing from removed displayed depth:
 // order cancel, quote refresh and unobserved fills are still possible.
 return ready(source,buy,sell,icebergCandidate,withdrawalWarning);
}
export function goldPreparation(input:{
 fresh:boolean;dom?:Mt5GoldDomReading|null;
 radarSide?:PrepSide;radarPhase?:string;radarFresh?:boolean
}):PreparationReading{
 const source='XAUUSD · دفتر وسيط MT5 فقط · عقود GC غير متصلة';
 const d=input.dom;
 if(!input.fresh||!d?.available||d.source!=='MT5_BROKER_DOM'||
   d.samples<3||d.spanMs<8000||
   (d.status!=='OBSERVING'&&d.status!=='POSSIBLE_WITHDRAWAL'))
   return EMPTY(source,'عمق MT5 غير متصل أو غير كافٍ لرصد التحضير');
 const buy:string[]=[],sell:string[]=[];
 if(d.possibleAskWithdrawal)buy.push('تراجع عروض الوسيط واستمرار استقرار الأسعار');
 if(d.possibleBidWithdrawal)sell.push('تراجع طلبات الوسيط واستمرار استقرار الأسعار');
 if(d.bidPersistent)buy.push('طلب معلن مستمر عند '+d.bidWall);
 if(d.askPersistent)sell.push('عرض معلن مستمر عند '+d.askWall);
 // Price-action on closed M1 is separate from a broker book snapshot, but
 // is explicitly NOT a GC lead, executed trade or maker identity.
 if(input.radarFresh&&input.radarPhase==='CONFIRMED'){
   if(input.radarSide==='BUY')buy.push('سحب قاع أو كسر من شموع M1 مغلقة');
   if(input.radarSide==='SELL')sell.push('سحب قمة أو كسر من شموع M1 مغلقة');
 }
 return ready(source,buy,sell,false,
   d.possibleBidWithdrawal||d.possibleAskWithdrawal);
}
