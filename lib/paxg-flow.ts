export type PaxgSide='BUY'|'SELL'|'NEUTRAL'|'UNAVAILABLE';
export type PaxgFlow={side:PaxgSide;observedAt:number;tradeAt:number;count:number;source?:string};

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
export function readPaxgFlow(book:any,trades:unknown,now:number):PaxgFlow{
 const missing:PaxgFlow={side:'UNAVAILABLE',observedAt:now,tradeAt:0,count:0,source:'Binance PAXG/USDT proxy'};
 const bids=size(book?.bids,true),asks=size(book?.asks,false);
 if(!bids||!asks||Number(book.bids[0][0])>=Number(book.asks[0][0])||
   !Array.isArray(trades))return missing;
 let buy=0,sell=0,tradeAt=0;
 const seen=new Set<number>();
 for(const t of trades){
   const qty=Number(t?.q);
   if(!Number.isSafeInteger(t?.a)||seen.has(t.a)||typeof t.m!=='boolean'||
     !Number.isFinite(qty)||qty<=0||!Number.isSafeInteger(t.T)||
     t.T>now||now-t.T>30000)continue;
   seen.add(t.a);tradeAt=Math.max(tradeAt,t.T);
   if(t.m)sell+=qty;else buy+=qty;
 }
 if(seen.size<3||now-tradeAt>15000)return missing;
 const depth=(bids-asks)/(bids+asks),tape=(buy-sell)/(buy+sell);
 const side=depth>=.15&&tape>=.2?'BUY':depth<=-.15&&tape<=-.2?'SELL':'NEUTRAL';
 return {side,observedAt:now,tradeAt,count:seen.size,source:'Binance PAXG/USDT proxy'};
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
 const bids=size(book?.bids,true),asks=size(book?.asks,false);
 if(!bids||!asks||Number(book.bids[0][0])>=Number(book.asks[0][0])||
   !Array.isArray(trades))return missing;
 let buy=0,sell=0,tradeAt=0;
 const seen=new Set<string>();
 for(const t of trades){
   if(!Array.isArray(t)||t.length<4)continue;
   const price=Number(t[0]),qty=Number(t[1]),timestamp=Number(t[2])*1000;
   const side=t[3];
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(qty)||qty<=0||
      !Number.isFinite(timestamp)||timestamp>now+1500||now-timestamp>30000||
      (side!=='b'&&side!=='s'))continue;
   // The public Kraken sample may lack unique execution IDs. Reject identical
   // rows conservatively rather than silently double-count a retry/duplicate.
   const id=[String(t[0]),String(t[1]),String(t[2]),side,
     t.length>6?String(t[6]):''].join(':');
   if(seen.has(id))continue;
   seen.add(id);tradeAt=Math.max(tradeAt,timestamp);
   if(side==='b')buy+=qty;else sell+=qty;
 }
 if(seen.size<3||now-tradeAt>15000||buy+sell<=0)return missing;
 const depth=(bids-asks)/(bids+asks),tape=(buy-sell)/(buy+sell);
 const side=depth>=.15&&tape>=.2?'BUY':depth<=-.15&&tape<=-.2?'SELL':'NEUTRAL';
 return {side,observedAt:now,tradeAt,count:seen.size,
   source:'Kraken PAXG/USD proxy'};
}
