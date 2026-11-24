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

// Equal-normalized venue ratios (not raw contract quantities). Perpetual
// samples receive weight 2, token spot 1. A 60-second deduplicated perpetual
// history can stabilize its own 30-second sample; never smooth across sources.
export type GoldCombinedLiquidity={buyPct:number|null;sellPct:number|null;delta:number|null;
 sources:string[];asOf:number|null;state:'BUY'|'SELL'|'BALANCED'|'CONFLICT'|'UNAVAILABLE';
 strongSide:'BUY'|'SELL'|'WAIT';ageSeconds:number|null;detail:string;actionable:false;
 fastBuyPct?:number;coverage?:'PARTIAL'|'MULTI';stableSources?:number};
export function combineGoldLiquidity(perp:PaxgFlow|null|undefined,token:PaxgFlow|null|undefined,now:number,open:boolean):GoldCombinedLiquidity{
 const blank:GoldCombinedLiquidity={buyPct:null,sellPct:null,delta:null,sources:[],asOf:null,
   state:'UNAVAILABLE',strongSide:'WAIT',ageSeconds:null,detail:'لا توجد عينات تنفيذ حديثة',actionable:false};
 if(!open||!Number.isFinite(now))return blank;
 const eligible=(f:PaxgFlow,allowed:string[])=>allowed.includes(f.source||'')&&f.side!=='UNAVAILABLE'&&
   Number.isSafeInteger(f.observedAt)&&Number.isSafeInteger(f.tradeAt)&&f.tradeAt>0&&
   f.tradeAt<=f.observedAt&&f.observedAt<=now&&now-f.observedAt<=12000&&now-f.tradeAt<=10000&&
   Number.isInteger(f.count)&&f.count>=3&&Number.isFinite(f.tradeDeltaPct)&&Math.abs(f.tradeDeltaPct!)<=100;
 const rows=new Map<string,{source:string;delta:number;raw:number;weight:number;at:number;count:number;stable:boolean}>();
 for(const [packet,allowed,weight] of [[perp,sources.slice(0,2),2],[token,sources.slice(2),1]] as const){
   if(!packet)continue;
   for(const f of [...(packet.venueSamples??[]),packet]){
     if(!eligible(f,allowed))continue;
     const source=f.source!,old=rows.get(source);if(old&&old.at>=f.tradeAt)continue;
     let d=f.tradeDeltaPct!,stabilized=false;
     const history=weight===2?packet.crossFlow?.venues.find(v=>v.source===source):null;
     if(history&&Number.isFinite(history.asOf)&&history.asOf<=now&&now-history.asOf<=10000&&
       history.asOf>=f.tradeAt&&history.count>=20&&history.spanSeconds>=30&&
       [history.buy60s,history.sell60s].every(v=>Number.isFinite(v)&&v>=0)&&history.buy60s+history.sell60s>0){
       const stable=100*(history.buy60s-history.sell60s)/(history.buy60s+history.sell60s);
       d=.20*d+.80*stable;stabilized=true;
     }
     rows.set(source,{source,delta:d,raw:f.tradeDeltaPct!,weight,at:f.tradeAt,count:f.count,stable:stabilized});
   }
 }
 const v=[...rows.values()];if(!v.length)return blank;
 const total=v.reduce((s,r)=>s+r.weight,0);
 const d=v.reduce((s,r)=>s+r.delta*r.weight,0)/total;
 const buy=Math.round((100+d)/2),sell=100-buy;
 const rawDelta=v.reduce((s,r)=>s+r.raw*r.weight,0)/total;
 const stableSources=v.filter(r=>r.stable).length;
 const conflict=v.some(r=>r.raw>=35)&&v.some(r=>r.raw<=-35);
 const recent=v.filter(r=>now-r.at<=8000&&r.count>=8);
 const buyAgree=recent.filter(r=>r.raw>=25),sellAgree=recent.filter(r=>r.raw<=-25);
 // At least two recent independent markets, including a gold perpetual,
 // support a strong direction; a single source is still displayed honestly.
 const strongSide=conflict?'WAIT':d>=35&&rawDelta>=25&&buyAgree.length>=2&&buyAgree.some(r=>r.weight===2)?'BUY':
   d<=-35&&rawDelta<=-25&&sellAgree.length>=2&&sellAgree.some(r=>r.weight===2)?'SELL':'WAIT';
 const asOf=Math.min(...v.map(r=>r.at));
 return {buyPct:buy,sellPct:sell,delta:Math.round(d),sources:v.map(r=>r.source),asOf,
   state:conflict?'CONFLICT':d>=10?'BUY':d<=-10?'SELL':'BALANCED',strongSide,
   ageSeconds:Math.floor((now-asOf)/1000),actionable:false,
   fastBuyPct:Math.round((100+rawDelta)/2),coverage:v.length>=2?'MULTI':'PARTIAL',stableSources,
   detail:v.map(r=>r.source+' Δ '+r.raw.toFixed(1)+'%').join(' | ')+
     ' · متوسط نسب التنفيذ (وزن العقود 2 وPAXG 1؛ 80% سجل 60ث و20% العينة القصيرة عند اكتمال عينة مرصودة كافية) · ليس سيولة XAUUSD العالمية أو تدفق رؤوس الأموال'};
}


// Display continuity is separate from live trading evidence.
export type GoldLiquidityDisplay=GoldCombinedLiquidity&{displayStatus:'LIVE'|'PARTIAL'|'LAST'|'UNAVAILABLE';liveSources:number};
export function goldLiquidityDisplay(live:GoldCombinedLiquidity,last:GoldCombinedLiquidity|null,now:number,open:boolean):GoldLiquidityDisplay{
 const liveSources=live.sources.length;
 if(!open)return {...live,displayStatus:'UNAVAILABLE',liveSources:0};
 if(liveSources>=2)return {...live,displayStatus:'LIVE',liveSources};
 if(liveSources===1)return {...live,displayStatus:'PARTIAL',liveSources};
 if(last?.asOf!=null&&last.asOf<=now&&now-last.asOf<=60000&&last.buyPct!=null)
   return {...last,state:'UNAVAILABLE',strongSide:'WAIT',actionable:false,fastBuyPct:undefined,
     ageSeconds:Math.floor((now-last.asOf)/1000),displayStatus:'LAST',liveSources:0,
     detail:'آخر عينة محفوظة، ليست بيانات حية ولا تستخدم في القنص · '+last.detail};
 return {...live,displayStatus:'UNAVAILABLE',liveSources};
}
// Retain independently recent samples across failed polls, with original timestamps.
export function retainGoldVenueSamples(next:PaxgFlow|null,previous:PaxgFlow|null,now:number):PaxgFlow|null{
 const map=new Map<string,PaxgFlow>();
 for(const packet of [previous,next]){
   if(!packet)continue;
   for(const sample of [packet,...(packet.venueSamples??[])]){
     if(!sources.includes(sample.source||'')||sample.side==='UNAVAILABLE'||
       !Number.isSafeInteger(sample.tradeAt)||sample.tradeAt<=0||sample.tradeAt>now||
       !Number.isSafeInteger(sample.observedAt)||sample.observedAt>now||sample.tradeAt>sample.observedAt||
       now-sample.tradeAt>10000||now-sample.observedAt>12000)continue;
     const key=sample.source!,old=map.get(key);
     if(!old||sample.tradeAt>old.tradeAt||(sample.tradeAt===old.tradeAt&&sample.observedAt>=old.observedAt))
       map.set(key,{...sample,venueSamples:undefined,crossFlow:undefined});
   }
 }
 const primary=next?.side!=='UNAVAILABLE'&&next?.source&&map.has(next.source)?map.get(next.source):[...map.values()][0];
 if(!primary)return next??null;
 return {...primary,venueSamples:[...map.values()],crossFlow:next?.crossFlow};
}
