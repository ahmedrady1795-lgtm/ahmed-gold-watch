export type PaxgSide='BUY'|'SELL'|'NEUTRAL'|'UNAVAILABLE';
export type PaxgFlow={side:PaxgSide;observedAt:number;tradeAt:number;count:number};

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
 const missing:PaxgFlow={side:'UNAVAILABLE',observedAt:now,tradeAt:0,count:0};
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
 return {side,observedAt:now,tradeAt,count:seen.size};
}
