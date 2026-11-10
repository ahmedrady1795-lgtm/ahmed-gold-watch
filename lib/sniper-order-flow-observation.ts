import type {FlowProfileDecision,FlowSide} from './flow-profile-decision';
import type {Mt5GoldDomReading} from './gold-mt5-dom';
import type {M1Bar} from './sniper-mt5-m1';

/** Display-only source hierarchy. A candle body is NOT a broker order
 * or an executed buy/sell. Never promote a price proxy to a flow vote. */
export type OrderFlowObservation={
 status:'EXECUTED_TRADES'|'BROKER_DOM'|'QUOTE_ACTIVITY'|'PRICE_PROXY'|'UNAVAILABLE';
 side:FlowSide;actionable:false;source:string;
 label:string;reason:string;
 deltaPct:number|null;depthPct:number|null;
 bidSharePct:number|null;askSharePct:number|null;
 bidLots:number|null;askLots:number|null;
 poc:number|null;vah:number|null;val:number|null;
 quotePressurePct:number|null;
 proxyPressurePct:number|null;proxyBars:number;
 withdrawal:'BID'|'ASK'|'BOTH'|null;
 freshnessSeconds:number|null;brokerExecutedVolume:false;
};
const blank=(reason:string):OrderFlowObservation=>({
 status:'UNAVAILABLE',side:'WAIT',actionable:false,
 source:'NONE',label:'تدفق الأوامر غير متصل',reason,
 deltaPct:null,depthPct:null,bidSharePct:null,askSharePct:null,
 bidLots:null,askLots:null,poc:null,vah:null,val:null,
 quotePressurePct:null,proxyPressurePct:null,proxyBars:0,
 withdrawal:null,freshnessSeconds:null,brokerExecutedVolume:false
});
const sanePct=(x:unknown):number|null=>
 typeof x==='number'&&Number.isFinite(x)&&x>=-100&&x<=100?x:null;
const sanePrice=(x:unknown):number|null=>
 typeof x==='number'&&Number.isFinite(x)&&x>0?x:null;
const age=(at:unknown,now:number,maxMs:number):number|null=>
 typeof at==='number'&&Number.isFinite(at)&&Number.isFinite(now)&&
 at>0&&at<=now&&now-at<=maxMs?(now-at)/1000:null;
export function closedM1PricePressure(bars:readonly M1Bar[]|null|undefined,now:number):{
 pressure:number|null;bars:number
}{
 if(!Array.isArray(bars)||!Number.isFinite(now))return {pressure:null,bars:0};
 const tail=bars.slice(-8);
 if(tail.length!==8||tail.some((b,i)=>
   !b||!Number.isSafeInteger(b.time)||b.time%60000!==0||
   b.time+60000>now||
   ![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||
   b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||
   (i>0&&b.time-tail[i-1].time!==60000))||
   now-(tail[7].time+60000)>120000)
   return {pressure:null,bars:0};
 // Body / candle range is a price-action descriptive statistic only.
 const bodies=tail.map(b=>(b.close-b.open)/Math.max(b.high-b.low,.00001));
 return {pressure:Number((bodies.reduce((s,v)=>s+v,0)/8*100).toFixed(1)),bars:8};
}
export function observeSniperOrderFlow(input:{
 asset:'GOLD'|'BTC';now:number;flow:FlowProfileDecision|null|undefined;
 marketFresh:boolean;sourceMatches:boolean;m1?:readonly M1Bar[]|null;
 brokerDepth?:Mt5GoldDomReading|null
}):OrderFlowObservation{
 const {asset,now}=input;
 const result=blank('يلزم مصدر مطابق وحديث؛ لا يمكن استنتاج الصفقات المنفذة من الشموع');
 const fallback=()=>{
   const p=closedM1PricePressure(input.m1,now);
   if(p.pressure==null)return result;
   return {...result,status:'PRICE_PROXY' as const,
     source:'M1 closed OHLC',label:'ضغط سعري من الشموع فقط',
     proxyPressurePct:p.pressure,proxyBars:p.bars,
     reason:'ضغط أجسام 8 شموع M1 مغلقة؛ ليس Order Flow ولا حجم تنفيذ أو دفتر أوامر'};
 };
 if(!input.marketFresh||!input.sourceMatches)return fallback();
 const f=input.flow;
 // Even a server-cached profile is not a LIVE flow measurement after expiry.
 const fresh=age(f?.asOf,now,asset==='GOLD'?8000:12000);
 if(f&&fresh!=null&&f.quality==='EXECUTED_SAMPLE'&&
   asset==='BTC'&&f.ready&&f.orderFlowReady&&
   f.profileBasis==='EXECUTED_TRADES'){
   const delta=sanePct(f.flowPct);
   if(delta!=null)return {...result,status:'EXECUTED_TRADES',
     source:f.source,label:'دلتا صفقات Coinbase المنفذة',
     side:f.side,deltaPct:delta,poc:sanePrice(f.poc),
     vah:sanePrice(f.vah),val:sanePrice(f.val),
     freshnessSeconds:fresh,reason:f.reason,
     // An executed BTC tape is not Exness/MT5 GOLD executed volume.
     brokerExecutedVolume:false};
 }
 // Broker book contains displayed limit orders, not market trade prints.
 // Require the same broker mode, validated flow source and timestamps.
 if(asset==='GOLD'&&f&&f.profileBasis==='QUOTE_UPDATES'&&
   f.quality==='INDICATIVE_BROKER'&&fresh!=null){
   const d=input.brokerDepth;
   const domAge=age(d?.asOf,now,7000);
   const dom=Boolean(d?.available&&domAge!=null&&
     d?.source==='MT5_BROKER_DOM'&&f.orderFlowReady);
   const depth=dom?sanePct(d?.imbalancePct):null;
   const bid=dom?sanePrice(d?.bidDepthLots):null;
   const ask=dom?sanePrice(d?.askDepthLots):null;
   const withdrawal=dom&&d?.possibleBidWithdrawal&&d?.possibleAskWithdrawal?'BOTH':
     dom&&d?.possibleBidWithdrawal?'BID':
     dom&&d?.possibleAskWithdrawal?'ASK':null;
   return {...result,status:dom?'BROKER_DOM':'QUOTE_ACTIVITY',
     label:dom?'عمق الطلب والعرض لدى وسيط MT5':'نشاط تحديثات أسعار MT5 فقط',
     source:f.source,side:dom&&f.ready?f.side:'WAIT',
     bidSharePct:depth!=null?Number(((100+depth)/2).toFixed(1)):null,
     askSharePct:depth!=null?Number(((100-depth)/2).toFixed(1)):null,
     depthPct:depth,bidLots:bid,askLots:ask,
     quotePressurePct:sanePct(f.flowPct),
     poc:sanePrice(f.poc),vah:sanePrice(f.vah),val:sanePrice(f.val),
     withdrawal,freshnessSeconds:dom?Math.max(fresh,domAge!):fresh,
     reason:dom?
       'أوامر معلنة لدى وسيط Exness؛ ليست تداولات منفذة أو دفتر COMEX. '+f.reason:
       'بروفايل تحديثات أسعار Bid/Ask؛ لا يوجد DOM مؤهل، ولا دلتا صفقات منفذة'};
 }
 return fallback();
}
