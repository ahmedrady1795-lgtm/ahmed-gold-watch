import type {GoldCrossFlow,VenueEvidence} from './gold-flow-history';
export type PaxgSide='BUY'|'SELL'|'NEUTRAL'|'UNAVAILABLE';
export type PaxgFlow={side:PaxgSide;observedAt:number;tradeAt:number;count:number;source?:string;
  /** Actual token-exchange PAXG depth and executed-tape imbalance, never XAUUSD broker orders. */
  depthImbalancePct?:number;tradeDeltaPct?:number;
  buyVolume?:number;sellVolume?:number;deltaVolume?:number;
  coverageSeconds?:number;depthAvailable?:boolean;
  absorptionWatch?:'BUY'|'SELL'|null;priceChangeBps?:number;
  shortDeltaPct?:number;priorDeltaPct?:number;accelerationSide?:'BUY'|'SELL'|null;
  crossFlow?:GoldCrossFlow;venueSamples?:PaxgFlow[];executionHistory?:VenueEvidence;};

function size(levels:unknown,descending:boolean){
 if(!Array.isArray(levels)||levels.length<5)return null;
 let total=0,previous=descending?Infinity:0;
 for(const level of levels.slice(0,5)){
   if(!Array.isArray(level))return null;
   const price=Number(level[0]),qty=Number(level[1]);
   if(!Number.isFinite(price)||!Number.isFinite(qty)||price<=0||qty<=0||
     (descending?price>=previous:price<=previous))return null;
   previous=price;total+=qty;
 }
 return total;
}
type Print={at:number;price:number;qty:number;buy:boolean};
// Compare only timestamped executed prints from ONE PAXG venue. Overlapping
// REST samples are never summed; a missing window is not zero volume.
function tapeDynamics(rows:Print[],now:number):Partial<PaxgFlow>{
 const r=rows.slice().sort((a,b)=>a.at-b.at);
 if(r.length<8||now-r.at(-1)!.at>8000||r.at(-1)!.at-r[0].at<4000)return {};
 const delta=(v:Print[])=>{
   const total=v.reduce((s,t)=>s+t.qty,0);
   return total>0?100*v.reduce((s,t)=>s+(t.buy?t.qty:-t.qty),0)/total:0;
 };
 const change=10000*(r.at(-1)!.price/r[0].price-1),d=delta(r);
 if(!Number.isFinite(change)||!Number.isFinite(d))return {};
 // An opposite price response to aggressive volume suggests absorption,
 // not proof of accumulation, hidden orders or XAUUSD execution.
 const absorptionWatch=d<=-45&&change>=1?'BUY':
   d>=45&&change<=-1?'SELL':null;
 const latest=r.filter(t=>t.at>now-10000),prior=r.filter(t=>t.at<=now-10000&&t.at>now-20000);
 let accelerationSide:'BUY'|'SELL'|null=null;
 if(latest.length>=5&&prior.length>=5&&latest.at(-1)!.at-latest[0].at>=2000&&
    prior.at(-1)!.at-prior[0].at>=2000){
   const a=delta(latest),b=delta(prior);
   accelerationSide=a>=45&&a-b>=25?'BUY':a<=-45&&b-a>=25?'SELL':null;
   return {absorptionWatch,priceChangeBps:change,shortDeltaPct:a,priorDeltaPct:b,accelerationSide};
 }
 return {absorptionWatch,priceChangeBps:change};
}
// A valid tape survives failed depth. Never invent a book or its agreement.
function summarize(missing:PaxgFlow,book:any,buy:number,sell:number,first:number,last:number,count:number):PaxgFlow{
 const bids=size(book?.bids,true),asks=size(book?.asks,false);
 const hasDepth=Boolean(bids&&asks&&Number(book.bids[0][0])<Number(book.asks[0][0]));
 const tape=(buy-sell)/(buy+sell);
 const depth=hasDepth?(bids!-asks!)/(bids!+asks!):null;
 const side=depth!=null&&depth>=.15&&tape>=.2?'BUY':
   depth!=null&&depth<=-.15&&tape<=-.2?'SELL':'NEUTRAL';
 return {...missing,side,tradeAt:last,count,depthAvailable:hasDepth,
   ...(depth!=null?{depthImbalancePct:Number((depth*100).toFixed(1))}:{}),
   tradeDeltaPct:Number((tape*100).toFixed(1)),buyVolume:buy,sellVolume:sell,
   deltaVolume:buy-sell,coverageSeconds:(last-first)/1000};
}
export function readPaxgFlow(book:any,trades:unknown,now:number):PaxgFlow{
 const missing:PaxgFlow={side:'UNAVAILABLE',observedAt:now,tradeAt:0,count:0,source:'Binance PAXG/USDT proxy'};
 if(!Array.isArray(trades))return missing;
 let buy=0,sell=0,tradeAt=0,first=Infinity;
 const prints:Print[]=[];
 const seen=new Set<number>();
 for(const t of trades){
   const qty=Number(t?.q);
   if(!Number.isSafeInteger(t?.a)||seen.has(t.a)||typeof t.m!=='boolean'||
     !Number.isFinite(qty)||qty<=0||!Number.isSafeInteger(t.T)||
     t.T>now||now-t.T>30000)continue;
   seen.add(t.a);tradeAt=Math.max(tradeAt,t.T);first=Math.min(first,t.T);
   if(t.m)sell+=qty;else buy+=qty;
   const price=Number(t.p);if(Number.isFinite(price)&&price>0)prints.push({at:t.T,price,qty,buy:!t.m});
 }
 if(seen.size<3||now-tradeAt>15000||!Number.isFinite(buy+sell)||buy+sell<=0)return missing;
 return {...summarize(missing,book,buy,sell,first,tradeAt,seen.size),
   ...(prints.length===seen.size?tapeDynamics(prints,now):{})};
}

/**
 * Independent read-only fallback for public Kraken PAXG/USD spot.
 * Kraken REST trades are [price, volume, seconds, aggressor side, ...].
 * This is PAXG spot execution, never broker XAUUSD or CME GC order flow.
 * No cross-exchange vote is manufactured from snapshots of two venues.
 */
export function readKrakenPaxgFlow(book:any,trades:unknown,now:number):PaxgFlow{
 const missing:PaxgFlow={side:'UNAVAILABLE',observedAt:now,tradeAt:0,count:0,
   source:'Kraken PAXG/USD proxy'};
 if(!Array.isArray(trades))return missing;
 let buy=0,sell=0,tradeAt=0,first=Infinity;
 const prints:Print[]=[];
 const seen=new Set<string>();
 for(const t of trades){
   if(!Array.isArray(t)||t.length<4)continue;
   const price=Number(t[0]),qty=Number(t[1]),timestamp=Math.floor(Number(t[2])*1000);
   const side=t[3];
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(qty)||qty<=0||
      !Number.isFinite(timestamp)||timestamp>now||now-timestamp>30000||
      (side!=='b'&&side!=='s'))continue;
   // The public Kraken sample may lack unique execution IDs. Reject identical
   // rows conservatively rather than silently double-count a retry/duplicate.
   const id=[String(t[0]),String(t[1]),String(t[2]),side,
     t.length>6?String(t[6]):''].join(':');
   if(seen.has(id))continue;
   seen.add(id);tradeAt=Math.max(tradeAt,timestamp);first=Math.min(first,timestamp);
   if(side==='b')buy+=qty;else sell+=qty;
   prints.push({at:timestamp,price,qty,buy:side==='b'});
 }
 if(seen.size<3||now-tradeAt>15000||!Number.isFinite(buy+sell)||buy+sell<=0)return missing;
 return {...summarize(missing,book,buy,sell,first,tradeAt,seen.size),
   ...(prints.length===seen.size?tapeDynamics(prints,now):{})};
}

/** Public gold perpetual samples, kept distinct from token spot and COMEX.
 * Bybit side is taker side. No block prints or wrong-symbol data.
 */
export function readBybitGoldPerp(book:any,history:any,now:number):PaxgFlow{
 const source='Bybit XAUUSDT perpetual';
 const b=book?.retCode===0?book.result:null;
 const bookAt=Number(b?.cts??b?.ts);
 const depth=b?.s==='XAUUSDT'&&Number.isSafeInteger(bookAt)&&
   bookAt<=now&&now-bookAt<=8000?{bids:b.b,asks:b.a}:null;
 const rows=history?.retCode===0&&history.result?.category==='linear'&&
   Array.isArray(history.result?.list)?history.result.list:[];
 const ids=new Set<string>(),normalized:any[]=[];
 for(const t of rows){
   if(t?.symbol!=='XAUUSDT'||typeof t.execId!=='string'||!t.execId||
      ids.has(t.execId)||(t.side!=='Buy'&&t.side!=='Sell')||t.isBlockTrade===true||
      !Number.isFinite(Number(t.price))||Number(t.price)<=0||
      !Number.isFinite(Number(t.size))||Number(t.size)<=0||
      !Number.isSafeInteger(Number(t.time))||Number(t.time)>now||now-Number(t.time)>30000)continue;
   ids.add(t.execId);
   normalized.push({a:normalized.length,q:t.size,p:t.price,T:Number(t.time),m:t.side==='Sell'});
 }
 return {...readPaxgFlow(depth,normalized,now),source};
}
export function readBinanceGoldPerp(book:any,trades:unknown,now:number):PaxgFlow{
 const at=Number(book?.T??book?.E);
 const depth=Number.isSafeInteger(at)&&at<=now&&now-at<=8000?book:null;
 // The caller requests the exact XAUUSDT symbol on the public futures API.
 const rows=Array.isArray(trades)?trades.filter(t=>Number.isFinite(Number(t?.p))&&Number(t.p)>0):[];
 return {...readPaxgFlow(depth,rows,now),source:'Binance XAUUSDT perpetual'};
}
