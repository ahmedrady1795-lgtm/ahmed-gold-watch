/**
 * Coinbase BTC-USD executed trade tape (single venue, finite recent sample).
 * Exchange REST trade.side is MAKER side, so aggressor is its OPPOSITE.
 * Never present this as full-session volume, centralized futures volume or
 * a statistically validated BUY/SELL trade signal.
 */
export type BtcExecutedVenue='Coinbase Exchange BTC-USD'|'Kraken XBT/USD';
export type ExecutedTrade={
 id:number;time:number;price:number;size:number;aggressor:'BUY'|'SELL';
};
export type FlowBin={
 price:number;buyBtc:number;sellBtc:number;totalBtc:number;
 trades:number;deltaBtc:number;imbalance:'BUY'|'SELL'|'BALANCED';
};
export type FlowMinute={time:number;totalBtc:number;deltaBtc:number;
  buyBtc:number;sellBtc:number;trades:number;rows:FlowBin[];partial:true};
export type ShortTapePressure={
 asOf:number;from:number;trades:number;deltaPct:number;priorDeltaPct:number;
 low:number;high:number;firstPrice:number;lastPrice:number;
};
export type BtcOrderflow={
 ok:boolean;source:BtcExecutedVenue;asOf:number;fetchedAt:number;
 status:'LIVE_SAMPLE'|'STALE'|'INSUFFICIENT';
 reason:string;coverage:{from:number|null;to:number|null;trades:number;
  seconds:number;completeSession:false;completeMinutes:false;maxPerRequest:number};
 profile:null|{poc:number;vah:number;val:number;vwap:number;binSize:number;
   valueAreaPct:70;volumeBtc:number;rows:FlowBin[]};
 footprint:FlowMinute[];
 flow:null|{buyBtc:number;sellBtc:number;deltaBtc:number;deltaPct:number;
  imbalance:'BUY'|'SELL'|'BALANCED';priceChangePct:number;
  absorptionWatch:'BUY_ABSORPTION_POSSIBLE'|'SELL_ABSORPTION_POSSIBLE'|null};
 shortPressure?:ShortTapePressure|null;
 latestTrade?:{at:number;price:number};
 actionable:false;venueComplete:false;
};
/** Source integrity for the on-chart flow lane: all three must be BTC/USD
 * from the SAME exchange, not merely timestamps acquired together.
 */
export function btcOrderflowMatchesChart(
 chartSource:unknown,quoteSource:unknown,tapeSource:unknown
):boolean{
 const venue=(x:unknown)=>{
  if(typeof x!=='string')return null;
  return /kraken/i.test(x)?'KRAKEN':
    /coinbase/i.test(x)?'COINBASE':null;
 };
 const chart=venue(chartSource);
 return chart!=null&&chart===venue(quoteSource)&&chart===venue(tapeSource);
}
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
/** Kraken Spot Trades has the TAKING party direction ('b' buy, 's'
 * sell), unlike Coinbase REST Trades where 'side' is the MAKER.
 * Require real IDs to deduplicate across REST polls; never infer a side
 * from a candle or reuse a Coinbase tape for Kraken.
 */
export function normalizeKrakenTrades(rows:unknown,now:number):ExecutedTrade[]{
 const seen=new Map<number,ExecutedTrade>(),conflicted=new Set<number>();
 if(!Array.isArray(rows)||!Number.isFinite(now))return [];
 for(const x of rows.slice(0,4200)){
  if(!Array.isArray(x)||x.length<7)continue;
  const price=Number(x[0]),size=Number(x[1]),time=Number(x[2])*1000,
    aggressor=x[3]==='b'?'BUY':x[3]==='s'?'SELL':null,id=Number(x[6]);
  if(!Number.isSafeInteger(id)||id<=0||
    !Number.isFinite(time)||time<=0||time>now+2000||now-time>12*60000||
    !Number.isFinite(price)||price<=0||!Number.isFinite(size)||
    size<=0||size>500||!aggressor||conflicted.has(id))continue;
  const trade:ExecutedTrade={id,time,price,size,aggressor};
  const prev=seen.get(id);
  if(prev&&(prev.time!==trade.time||prev.price!==trade.price||
    prev.size!==trade.size||prev.aggressor!==trade.aggressor)){
    seen.delete(id);conflicted.add(id);
  }else seen.set(id,trade);
 }
 return [...seen.values()].sort((a,b)=>a.time-b.time||a.id-b.id);
}
const empty=(now:number,reason:string,status:'STALE'|'INSUFFICIENT',source:BtcExecutedVenue=symbol):BtcOrderflow=>({
 ok:false,source,asOf:0,fetchedAt:now,status,reason,
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
 rows:ExecutedTrade[],now:number,sourceLimit=1000,source:BtcExecutedVenue=symbol):BtcOrderflow{
 const trades=rows.filter(t=>Number.isSafeInteger(t.id)&&Number.isFinite(t.time)&&
  t.time<=now+2000&&now-t.time<=12*60000&&Number.isFinite(t.price)&&t.price>0&&
  Number.isFinite(t.size)&&t.size>0&&(t.aggressor==='BUY'||t.aggressor==='SELL'))
  .sort((a,b)=>a.time-b.time||a.id-b.id).slice(-4200);
 const earliest=trades[0]?.time??0,newest=trades.at(-1)?.time??0;
 if(trades.length<25||newest===0)return empty(now,'عينة الصفقات المنفذة غير كافية','INSUFFICIENT',source);
 if(now-newest>20000||newest>now+2000)
  return empty(now,'آخر صفقة منفذة من المصدر متأخرة','STALE',source);
 const lastPrice=trades.at(-1)!.price;
 const step=Math.max(1,Math.round(lastPrice*.00012/5)*5);
 const buckets=aggregate(trades,step);
 if(buckets.length<2)return empty(now,'لا توجد مستويات سعرية متنوعة في عينة الصفقات','INSUFFICIENT',source);
 const buy=trades.reduce((s,t)=>s+(t.aggressor==='BUY'?t.size:0),0);
 const sell=trades.reduce((s,t)=>s+(t.aggressor==='SELL'?t.size:0),0);
 const total=buy+sell;
 if(total<=0)return empty(now,'حجم الصفقات المنفذة غير صالح','INSUFFICIENT',source);
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
 // Independent, timestamped short tape; do not treat a 12-minute
 // profile's aggregate delta as a signal from the last few seconds.
 const short=trades.filter(t=>t.time<=now&&t.time>now-20000);
 const prev=short.filter(t=>t.time<=now-10000),latest=short.filter(t=>t.time>now-10000);
 const d=(a:ExecutedTrade[])=>{const vol=a.reduce((s,t)=>s+t.size,0);
  return vol>0?100*a.reduce((s,t)=>s+(t.aggressor==='BUY'?t.size:-t.size),0)/vol:0;};
 const shortPressure:ShortTapePressure|null=prev.length>=5&&latest.length>=8&&
   now-latest.at(-1)!.time<=5000&&latest.at(-1)!.time-latest[0].time>=2000?
   {asOf:latest.at(-1)!.time,from:latest[0].time,trades:latest.length,
    deltaPct:d(latest),priorDeltaPct:d(prev),low:Math.min(...latest.map(x=>x.price)),
    high:Math.max(...latest.map(x=>x.price)),firstPrice:latest[0].price,lastPrice:latest.at(-1)!.price}:null;
 const sample:BtcOrderflow={
  ok:true,source,asOf:newest,fetchedAt:now,status:'LIVE_SAMPLE',
  reason:'حجم صفقات منفذة في عينة '+(source.startsWith('Kraken')?'Kraken':'Coinbase')+' فقط؛ لا تمثل جلسة كاملة أو السوق كله',
  coverage:{from:earliest,to:newest,trades:trades.length,
    seconds:fixed((newest-earliest)/1000,1),completeSession:false,
    completeMinutes:false,maxPerRequest:sourceLimit},
  profile:{poc:buckets[pocIndex].price,val:buckets[left].price,
    vah:buckets[right].price,vwap:fixed(vwap,2),binSize:step,
    valueAreaPct:70,volumeBtc:fixed(total),rows:buckets
      .sort((a,b)=>b.totalBtc-a.totalBtc).slice(0,48).sort((a,b)=>a.price-b.price)},
  latestTrade:{at:newest,price:lastPrice},shortPressure,footprint,flow:{buyBtc:fixed(buy),sellBtc:fixed(sell),deltaBtc:fixed(delta),
    deltaPct:fixed(deltaPct,1),imbalance:Math.abs(deltaPct)>=20&&trades.length>=50?
      deltaPct>0?'BUY':'SELL':'BALANCED',priceChangePct:fixed(change,3),
    absorptionWatch},actionable:false,venueComplete:false
 };
 return sample;
}

/** Same-venue executed pressure, before a nearby unbroken closed-M1 level.
 * Experimental alert only. No cross-exchange veto, no trade authorization.
 */
export function detectShortTapeWatch(a:{now:number;price:number|null;sourceMatches:boolean;
 tape:BtcOrderflow|null;observedAt:number|null;m1:unknown}){
 const {now,price,tape}=a,p=tape?.shortPressure;
 if(!a.sourceMatches||!tape?.ok||tape.status!=='LIVE_SAMPLE'||!p||
   typeof price!=='number'||!Number.isFinite(price)||price<=0||
   typeof a.observedAt!=='number'||a.observedAt>now||now-a.observedAt>10000||
   p.asOf>a.observedAt||now-p.asOf<0||now-p.asOf>10000||
   p.trades<8)return null;
 type Bar={time:number;open:number;high:number;low:number;close:number};
 const map=new Map<number,Bar>();
 for(const b of Array.isArray(a.m1)?a.m1:[]){
   if([b?.time,b?.open,b?.high,b?.low,b?.close].every(Number.isFinite)&&
     b.time>0&&b.time%60000===0&&b.time+60000<=now&&b.low>0&&
     b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close))map.set(b.time,b);
 }
 const bars=[...map.values()].sort((a,b)=>a.time-b.time).slice(-21);
 if(bars.length!==21||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000)||
   now-bars[20].time-60000>75000)return null;
 const atr=bars.slice(1).reduce((s,b,i)=>s+Math.max(b.high-b.low,
   Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)),0)/20;
 if(!(atr>0)||atr>price*.03||p.high-p.low>atr*.65||
    Math.abs(price-p.lastPrice)>atr*.20)return null;
 const recent=bars.slice(-3);
 const hi=Math.max(...recent.map(b=>b.high)),lo=Math.min(...recent.map(b=>b.low));
 const buffer=Math.max(.01,atr*.035);
 // Absorption: aggressive trades fail to advance through a closed-bar
 // boundary, then price recoils. This is a hypothesis, not book execution.
 // Freeze a trigger beyond the already observed tape (no late chasing).
 const absorb=p.deltaPct<=-45&&p.priorDeltaPct<=-20&&
   p.low<=lo+atr*.20&&p.low>=lo-atr*.18&&
   p.lastPrice-p.low>=atr*.12&&p.lastPrice-p.firstPrice>=-atr*.10?1:
   p.deltaPct>=45&&p.priorDeltaPct>=20&&
   p.high>=hi-atr*.20&&p.high<=hi+atr*.18&&
   p.high-p.lastPrice>=atr*.12&&p.firstPrice-p.lastPrice>=-atr*.10?-1:0;
 if(absorb){
   const trigger=absorb===1?p.high+buffer:p.low-buffer;
   const invalidation=absorb===1?Math.min(lo,p.low)-buffer:Math.max(hi,p.high)+buffer;
   const risk=absorb*(trigger-invalidation),ahead=absorb*(trigger-price);
   if(ahead>atr*.035&&ahead<=atr*.65&&risk>ahead&&risk<=atr*1.4&&
     absorb*(price-invalidation)>0)
     return {side:(absorb===1?'BUY':'SELL') as 'BUY'|'SELL',trigger,invalidation,
       asOf:p.asOf,source:tape.source,deltaPct:p.deltaPct,kind:'ABSORPTION' as const};
 }
 const dir=p.deltaPct>=28&&(p.priorDeltaPct>=12||p.deltaPct-p.priorDeltaPct>=20)?1:
   p.deltaPct<=-28&&(p.priorDeltaPct<=-12||p.priorDeltaPct-p.deltaPct>=20)?-1:0;
 if(!dir||dir*(p.lastPrice-p.firstPrice)<-atr*.15||
   dir*(p.lastPrice-p.firstPrice)>atr*.40)return null;
 const trigger=dir===1?hi+buffer:lo-buffer;
 const invalidation=dir===1?lo-buffer:hi+buffer;
 const risk=Math.abs(trigger-invalidation),ahead=dir*(trigger-price);
 // No alert if the recent tape has already crossed the prospective trigger.
 if(dir*(trigger-(dir===1?p.high:p.low))<=0||ahead<=atr*.035||
   ahead>atr*.75||risk>atr*4||ahead>=risk||
   dir*(price-invalidation)<=0)return null;
 return {side:(dir===1?'BUY':'SELL') as 'BUY'|'SELL',trigger,invalidation,
   asOf:p.asOf,source:tape.source,deltaPct:p.deltaPct,kind:'PRESSURE' as const};
}

/** Compare independent spot tapes over the same recent clock window.
 * This is corroboration, not a merged order book or a substitute for
 * the exact venue used by the chart. Missing feeds never vote. */
export type BtcCrossFlow={
 observedAt:number;consensus:'BUY'|'SELL'|'CONFLICT'|'INSUFFICIENT';
 venues:{source:BtcExecutedVenue;asOf:number;deltaPct:number;trades:number}[];
 actionable:false;
};
export function compareBtcTapes(a:unknown,b:unknown,now:number):BtcCrossFlow{
 const read=(value:unknown,source:BtcExecutedVenue)=>{
   const f=value as BtcOrderflow|null;
   const s=f?.shortPressure;
   if(!f?.ok||f.source!==source||f.status!=='LIVE_SAMPLE'||!s||
      !Number.isFinite(f.fetchedAt)||f.fetchedAt>now||now-f.fetchedAt>10000||
      !Number.isFinite(s.asOf)||s.asOf>now||now-s.asOf>5000||
      !Number.isFinite(s.from)||s.from>s.asOf||s.from<now-15000||
      s.asOf-s.from<2000||!Number.isInteger(s.trades)||s.trades<8||
      !Number.isFinite(s.deltaPct)||Math.abs(s.deltaPct)>100)return null;
   return {source,asOf:s.asOf,deltaPct:s.deltaPct,trades:s.trades};
 };
 const x=read(a,'Coinbase Exchange BTC-USD'),y=read(b,'Kraken XBT/USD');
 const venues=[x,y].filter((v):v is NonNullable<typeof v>=>v!==null);
 let consensus:BtcCrossFlow['consensus']='INSUFFICIENT';
 if(x&&y&&Math.abs(x.asOf-y.asOf)<=4000&&Math.abs(x.deltaPct)>=30&&Math.abs(y.deltaPct)>=30)
   consensus=Math.sign(x.deltaPct)!==Math.sign(y.deltaPct)?'CONFLICT':x.deltaPct>0?'BUY':'SELL';
 return {observedAt:now,venues,consensus,actionable:false};
}
