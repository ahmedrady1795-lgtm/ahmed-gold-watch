export type PaxgSide='BUY'|'SELL'|'NEUTRAL'|'UNAVAILABLE';
export type PaxgFlow={side:PaxgSide;observedAt:number;tradeAt:number;count:number;source?:string;
  /** Actual token-exchange PAXG depth and executed-tape imbalance, never XAUUSD broker orders. */
  depthImbalancePct?:number;tradeDeltaPct?:number;
  buyVolume?:number;sellVolume?:number;deltaVolume?:number;
  coverageSeconds?:number;depthAvailable?:boolean;};

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
 const seen=new Set<number>();
 for(const t of trades){
   const qty=Number(t?.q);
   if(!Number.isSafeInteger(t?.a)||seen.has(t.a)||typeof t.m!=='boolean'||
     !Number.isFinite(qty)||qty<=0||!Number.isSafeInteger(t.T)||
     t.T>now||now-t.T>30000)continue;
   seen.add(t.a);tradeAt=Math.max(tradeAt,t.T);first=Math.min(first,t.T);
   if(t.m)sell+=qty;else buy+=qty;
 }
 if(seen.size<3||now-tradeAt>15000||!Number.isFinite(buy+sell)||buy+sell<=0)return missing;
 return summarize(missing,book,buy,sell,first,tradeAt,seen.size);
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
 const seen=new Set<string>();
 for(const t of trades){
   if(!Array.isArray(t)||t.length<4)continue;
   const price=Number(t[0]),qty=Number(t[1]),timestamp=Number(t[2])*1000;
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
 }
 if(seen.size<3||now-tradeAt>15000||!Number.isFinite(buy+sell)||buy+sell<=0)return missing;
 return summarize(missing,book,buy,sell,first,tradeAt,seen.size);
}
