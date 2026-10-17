/**
 * Coinbase BTC-USD executed trade tape (single venue, finite recent sample).
 * Exchange REST trade.side is MAKER side, so aggressor is its OPPOSITE.
 * Never present this as full-session volume, centralized futures volume or
 * a statistically validated BUY/SELL trade signal.
 */
export type ExecutedTrade={
 id:number;time:number;price:number;size:number;aggressor:'BUY'|'SELL';
};
export type FlowBin={
 price:number;buyBtc:number;sellBtc:number;totalBtc:number;
 trades:number;deltaBtc:number;imbalance:'BUY'|'SELL'|'BALANCED';
};
export type FlowMinute={time:number;totalBtc:number;deltaBtc:number;
  buyBtc:number;sellBtc:number;trades:number;rows:FlowBin[];partial:true};
export type BtcOrderflow={
 ok:boolean;source:'Coinbase Exchange BTC-USD';asOf:number;fetchedAt:number;
 status:'LIVE_SAMPLE'|'STALE'|'INSUFFICIENT';
 reason:string;coverage:{from:number|null;to:number|null;trades:number;
  seconds:number;completeSession:false;completeMinutes:false;maxPerRequest:number};
 profile:null|{poc:number;vah:number;val:number;vwap:number;binSize:number;
   valueAreaPct:70;volumeBtc:number;rows:FlowBin[]};
 footprint:FlowMinute[];
 flow:null|{buyBtc:number;sellBtc:number;deltaBtc:number;deltaPct:number;
  imbalance:'BUY'|'SELL'|'BALANCED';priceChangePct:number;
  absorptionWatch:'BUY_ABSORPTION_POSSIBLE'|'SELL_ABSORPTION_POSSIBLE'|null};
 actionable:false;venueComplete:false;
};
const fixed=(x:number,n=6)=>Number(x.toFixed(n));
const symbol='Coinbase Exchange BTC-USD' as const;
const isSide=(s:unknown)=>s==='buy'||s==='sell';
export function normalizeCoinbaseTrades(rows:unknown,now:number):ExecutedTrade[]{
 const seen=new Map<number,ExecutedTrade>();
 if(!Array.isArray(rows))return [];
 for(const x of rows.slice(0,4200)){
  if(!x||typeof x!=='object')continue;
  const id=Number(x.trade_id),time=Date.parse(String(x.time||'')),
    price=Number(x.price),size=Number(x.size),maker=x.side;
  if(!Number.isSafeInteger(id)||id<=0||!Number.isFinite(time)||
    time<=0||time>now+2000||now-time>12*60000||
    !Number.isFinite(price)||price<=0||!Number.isFinite(size)||
    size<=0||size>500||!isSide(maker))continue;
  // Conflicted duplicate IDs cannot be counted as independent real fills.
  const trade={id,time,price,size,aggressor:(maker==='sell'?'BUY':'SELL') as 'BUY'|'SELL'};
  const previous=seen.get(id);
  if(previous&&(previous.price!==trade.price||previous.time!==trade.time||
    previous.size!==trade.size||previous.aggressor!==trade.aggressor)){
    seen.delete(id);
    continue;
  }
  seen.set(id,trade);
 }
 return [...seen.values()].sort((a,b)=>a.time-b.time||a.id-b.id);
}
const empty=(now:number,reason:string,status:'STALE'|'INSUFFICIENT'):BtcOrderflow=>({
 ok:false,source:symbol,asOf:0,fetchedAt:now,status,reason,
 coverage:{from:null,to:null,trades:0,seconds:0,completeSession:false,
   completeMinutes:false,maxPerRequest:1000},
 profile:null,footprint:[],flow:null,actionable:false,venueComplete:false
});
function gridBin(price:number,step:number){return fixed(Math.round(price/step)*step,2)}
function aggregate(rows:ExecutedTrade[],step:number):FlowBin[]{
 const map=new Map<number,{buy:number;sell:number;count:number}>();
 for(const t of rows){
  const p=gridBin(t.price,step);
  const prev=map.get(p)||{buy:0,sell:0,count:0};
  if(t.aggressor==='BUY')prev.buy+=t.size;else prev.sell+=t.size;
  prev.count++;map.set(p,prev);
 }
 return [...map.entries()].sort(([a],[b])=>a-b).map(([price,v])=>{
  const total=v.buy+v.sell,delta=v.buy-v.sell;
  return {price,buyBtc:fixed(v.buy),sellBtc:fixed(v.sell),
    totalBtc:fixed(total),deltaBtc:fixed(delta),trades:v.count,
    imbalance:total>=.035&&v.count>=3&&v.buy>=v.sell*3?'BUY' as const:
      total>=.035&&v.count>=3&&v.sell>=v.buy*3?'SELL' as const:
        'BALANCED' as const};
 });
}
export function buildBtcOrderflow(
 rows:ExecutedTrade[],now:number,sourceLimit=1000):BtcOrderflow{
 const trades=rows.filter(t=>Number.isSafeInteger(t.id)&&Number.isFinite(t.time)&&
  t.time<=now+2000&&now-t.time<=12*60000&&Number.isFinite(t.price)&&t.price>0&&
  Number.isFinite(t.size)&&t.size>0&&(t.aggressor==='BUY'||t.aggressor==='SELL'))
  .sort((a,b)=>a.time-b.time||a.id-b.id).slice(-4200);
 const earliest=trades[0]?.time??0,newest=trades.at(-1)?.time??0;
 if(trades.length<25||newest===0)return empty(now,'عينة الصفقات المنفذة غير كافية','INSUFFICIENT');
 if(now-newest>20000||newest>now+2000)
  return empty(now,'آخر صفقة منفذة من المصدر متأخرة','STALE');
 const lastPrice=trades.at(-1)!.price;
 const step=Math.max(1,Math.round(lastPrice*.00012/5)*5);
 const buckets=aggregate(trades,step);
 if(buckets.length<2)return empty(now,'لا توجد مستويات سعرية متنوعة في عينة الصفقات','INSUFFICIENT');
 const buy=trades.reduce((s,t)=>s+(t.aggressor==='BUY'?t.size:0),0);
 const sell=trades.reduce((s,t)=>s+(t.aggressor==='SELL'?t.size:0),0);
 const total=buy+sell;
 if(total<=0)return empty(now,'حجم الصفقات المنفذة غير صالح','INSUFFICIENT');
 let pocIndex=0;
 for(let i=1;i<buckets.length;i++)if(buckets[i].totalBtc>buckets[pocIndex].totalBtc)
  pocIndex=i;
 let left=pocIndex,right=pocIndex,covered=buckets[pocIndex].totalBtc;
 while(covered<total*.70&&(left>0||right<buckets.length-1)){
  const lo=left>0?buckets[left-1].totalBtc:-1;
  const hi=right<buckets.length-1?buckets[right+1].totalBtc:-1;
  if(hi>=lo&&right<buckets.length-1)covered+=buckets[++right].totalBtc;
  else if(left>0)covered+=buckets[--left].totalBtc;
  else break;
 }
 const vwap=trades.reduce((s,t)=>s+t.price*t.size,0)/total;
 const delta=buy-sell,deltaPct=delta/total*100;
 const change=(lastPrice-trades[0].price)/trades[0].price*100;
 // Contradiction is a WATCH label, never proof of manipulation/absorption.
 const absorptionWatch=trades.length>=60&&deltaPct>=30&&change<=-.025?
   'SELL_ABSORPTION_POSSIBLE' as const:
   trades.length>=60&&deltaPct<=-30&&change>=.025?
   'BUY_ABSORPTION_POSSIBLE' as const:null;
 const minutes=new Map<number,ExecutedTrade[]>();
 for(const t of trades){
  const minute=Math.floor(t.time/60000)*60000;
  const a=minutes.get(minute)||[];a.push(t);minutes.set(minute,a);
 }
 const footprint=[...minutes.entries()].sort(([a],[b])=>b-a).slice(0,3).map(([time,t])=>{
  const buyV=t.reduce((s,r)=>s+(r.aggressor==='BUY'?r.size:0),0);
  const sellV=t.reduce((s,r)=>s+(r.aggressor==='SELL'?r.size:0),0);
  const bins=aggregate(t,step).sort((a,b)=>b.totalBtc-a.totalBtc).slice(0,12)
    .sort((a,b)=>b.price-a.price);
  return {time,totalBtc:fixed(buyV+sellV),deltaBtc:fixed(buyV-sellV),
    buyBtc:fixed(buyV),sellBtc:fixed(sellV),trades:t.length,
    rows:bins,partial:true as const};
 });
 const sample:BtcOrderflow={
  ok:true,source:symbol,asOf:newest,fetchedAt:now,status:'LIVE_SAMPLE',
  reason:'حجم صفقات منفذة في عينة Coinbase فقط؛ لا تمثل جلسة كاملة أو السوق كله',
  coverage:{from:earliest,to:newest,trades:trades.length,
    seconds:fixed((newest-earliest)/1000,1),completeSession:false,
    completeMinutes:false,maxPerRequest:sourceLimit},
  profile:{poc:buckets[pocIndex].price,val:buckets[left].price,
    vah:buckets[right].price,vwap:fixed(vwap,2),binSize:step,
    valueAreaPct:70,volumeBtc:fixed(total),rows:buckets
      .sort((a,b)=>b.totalBtc-a.totalBtc).slice(0,48).sort((a,b)=>a.price-b.price)},
  footprint,flow:{buyBtc:fixed(buy),sellBtc:fixed(sell),deltaBtc:fixed(delta),
    deltaPct:fixed(deltaPct,1),imbalance:Math.abs(deltaPct)>=20&&trades.length>=50?
      deltaPct>0?'BUY':'SELL':'BALANCED',priceChangePct:fixed(change,3),
    absorptionWatch},actionable:false,venueComplete:false
 };
 return sample;
}
