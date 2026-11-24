import type {PaxgFlow} from './paxg-flow';
export type GoldLiquidityMeter={state:'BUY'|'SELL'|'BALANCED'|'CONFLICT'|'UNAVAILABLE';
 delta:number|null;strength:number|null;label:string;source:string;ageSeconds:number|null;detail:string;dynamic?:string};
const sources=['Bybit XAUUSDT perpetual','Binance XAUUSDT perpetual','Binance PAXG/USDT proxy','Kraken PAXG/USD proxy'];
/** Finite aggressive execution sample, not net capital inflow, resting
 * orders or global XAUUSD liquidity. A missing or old sample is never 0%. */
export function goldLiquidityMeter(perp:PaxgFlow|null|undefined,token:PaxgFlow|null|undefined,now:number,open:boolean):GoldLiquidityMeter{
 const blank=(label:string):GoldLiquidityMeter=>({state:'UNAVAILABLE',delta:null,strength:null,label,source:'—',ageSeconds:null,detail:'لا توجد عينة تنفيذ حديثة؛ لا يتم افتراض التوازن'});
 if(!open||!Number.isFinite(now))return blank('السوق مغلق');
 const valid=(f:PaxgFlow|null|undefined,allowed:string[])=>Boolean(f&&allowed.includes(f.source||'')&&
   f.side!=='UNAVAILABLE'&&Number.isSafeInteger(f.observedAt)&&Number.isSafeInteger(f.tradeAt)&&
   f.tradeAt>0&&f.tradeAt<=f.observedAt&&f.observedAt<=now&&now-f.observedAt<=12000&&
   now-f.tradeAt<=15000&&Number.isSafeInteger(f.count)&&f.count>=3&&
   Number.isFinite(f.tradeDeltaPct)&&Math.abs(f.tradeDeltaPct!)<=100);
 const f=valid(perp,sources.slice(0,2))?perp!:valid(token,sources.slice(2))?token!:null;
 if(!f)return blank('لا بيانات حية');
 const delta=Math.round(f.tradeDeltaPct!);
 const source=f.source!.startsWith('Bybit')?'Bybit XAU':f.source!.startsWith('Kraken')?'Kraken PAXG':
   f.source!.includes('XAUUSDT')?'Binance XAU':'Binance PAXG';
 const conflict=f===perp&&f.crossFlow?.consensus==='CONFLICT'&&
   f.crossFlow.actionable===false&&f.crossFlow.venues.length===2&&
   new Set(f.crossFlow.venues.map(v=>v.source)).size===2&&
   f.crossFlow.venues.every(v=>sources.slice(0,2).includes(v.source)&&Number.isFinite(v.asOf)&&v.asOf<=now&&now-v.asOf<=8000);
 const state=conflict?'CONFLICT':delta>=10?'BUY':delta<=-10?'SELL':'BALANCED';
 const freshDynamics=!conflict&&now-f.tradeAt<=8000&&f.count>=12;
 const absorption=freshDynamics&&Number.isFinite(f.priceChangeBps)?
   f.absorptionWatch==='BUY'&&f.tradeDeltaPct!<=-45&&f.priceChangeBps!>=1?'امتصاص بيع محتمل ↑':
   f.absorptionWatch==='SELL'&&f.tradeDeltaPct!>=45&&f.priceChangeBps!<=-1?'امتصاص شراء محتمل ↓':undefined:undefined;
 const accelerating=freshDynamics&&Number.isFinite(f.shortDeltaPct)&&Number.isFinite(f.priorDeltaPct)&&
   Math.abs(f.shortDeltaPct!)<=100&&Math.abs(f.priorDeltaPct!)<=100?
   f.accelerationSide==='BUY'&&f.shortDeltaPct!>=45&&f.shortDeltaPct!-f.priorDeltaPct!>=25?'تسارع شراء ↑':
   f.accelerationSide==='SELL'&&f.shortDeltaPct!<=-45&&f.priorDeltaPct!-f.shortDeltaPct!>=25?'تسارع بيع ↓':undefined:undefined;
 return {state,delta,strength:Math.abs(delta),
   label:conflict?'تعارض المصادر':state==='BUY'?'ضخ شراء ↑':state==='SELL'?'ضغط بيع ↓':'متوازن',
   source,ageSeconds:Math.floor((now-f.tradeAt)/1000),dynamic:absorption??accelerating,
   detail:'صافي حجم التنفيذ الهجومي ÷ إجمالي الحجم × 100، عينة '+f.count+' تنفيذ حتى 30ث · '+f.source+
     ' · ليس صافي إيداعات أو سحب رؤوس أموال ولا دفتر XAUUSD المباشر'+(conflict?' · النسبة تخص المصدر المعروض فقط':'')};
}
