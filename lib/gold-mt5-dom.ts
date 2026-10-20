/** MT5 XAUUSD broker depth observations.
 * MT5 MarketBookGet is broker-displayed liquidity for ONE symbol only.
 * It is NOT consolidated COMEX depth, exchange trades or maker identities.
 */
export type Mt5DomLevel={price:number;volume:number};
export type Mt5DomSnapshot={
 at:number;symbol:string;bid:number;ask:number;
 bids:Mt5DomLevel[];asks:Mt5DomLevel[];
 bidVolume:number;askVolume:number;imbalance:number
};
export type Mt5GoldDomReading={
 available:boolean;reason:string;status:'NO_BRIDGE'|'UNSUPPORTED'|
 'INVALID'|'WARMUP'|'STALE'|'OBSERVING'|'POSSIBLE_WITHDRAWAL';
 symbol:string|null;asOf:number|null;samples:number;spanMs:number;
 bidDepthLots:number|null;askDepthLots:number|null;
 imbalancePct:number|null;bidWall:number|null;askWall:number|null;
 bidPersistent:boolean;askPersistent:boolean;possibleBidWithdrawal:boolean;
 possibleAskWithdrawal:boolean;source:'MT5_BROKER_DOM'|'NONE';
 actionable:false;executionAuthority:false
};
export const goldSymbol=(s:unknown):s is string=>
 typeof s==='string'&&/^XAUUSD[a-z0-9._-]*$/i.test(s);
const finitePositive=(v:unknown)=>typeof v==='number'&&
 Number.isFinite(v)&&v>0;
export function normalizeMt5GoldDom(raw:unknown,params:{
 now:number;symbol:string;tickTimeMs:number;bid:number;ask:number
}):{sample:Mt5DomSnapshot|null;reason:string}{
 const {now,symbol,tickTimeMs,bid,ask}=params;
 if(!goldSymbol(symbol)||!finitePositive(bid)||!finitePositive(ask)||
 ask<bid||!Number.isFinite(now)||!Number.isSafeInteger(tickTimeMs)||
 tickTimeMs>now+1500||now-tickTimeMs>8000)
  return {sample:null,reason:'STALE_OR_INVALID_BROKER_TICK'};
 const book=raw as any;
 if(book?.available!==true)
  return {sample:null,reason:typeof book?.reason==='string'?
    book.reason.slice(0,70):'BROKER_MARKET_BOOK_NOT_SUPPORTED'};
 if(book.symbol!=null&&book.symbol!==symbol)
  return {sample:null,reason:'BROKER_SYMBOL_MISMATCH'};
 const at=Number(book.capturedAt);
 if(!Number.isSafeInteger(at)||at>now+1500||now-at>8000||
 Math.abs(at-tickTimeMs)>8000)
  return {sample:null,reason:'UNTIMED_OR_STALE_MARKET_BOOK'};
 const parsed=(rawRows:unknown,descending:boolean)=>{
  if(!Array.isArray(rawRows)||rawRows.length<2||rawRows.length>150)
   return null;
  const rows:Mt5DomLevel[]=[];
  const seen=new Set<number>();
  for(const item of rawRows){
   const x=item as Record<string,unknown>;
   if(!x||!finitePositive(x.price)||!finitePositive(x.volume)||
    Number(x.volume)>1e7||seen.has(Number(x.price)))return null;
   seen.add(Number(x.price));
   rows.push({price:Number(x.price),volume:Number(x.volume)});
  }
  rows.sort((a,b)=>descending?b.price-a.price:a.price-b.price);
  return rows.slice(0,20);
 };
 const bids=parsed(book.bids,true),asks=parsed(book.asks,false);
 if(!bids||!asks)return {sample:null,reason:'EMPTY_OR_INVALID_TWO_SIDED_BOOK'};
 const bestBid=bids[0].price,bestAsk=asks[0].price;
 if(bestBid>=bestAsk)return {sample:null,reason:'CROSSED_MARKET_BOOK'};
 const midpoint=(bid+ask)/2;
 if(Math.abs(bestBid-midpoint)/midpoint>0.004||
    Math.abs(bestAsk-midpoint)/midpoint>0.004)
  return {sample:null,reason:'BOOK_OUTSIDE_BROKER_QUOTE'};
 const bidVolume=bids.reduce((s,v)=>s+v.volume,0);
 const askVolume=asks.reduce((s,v)=>s+v.volume,0);
 return {sample:{at,symbol,bid,ask,bids,asks,bidVolume,askVolume,
   imbalance:(bidVolume-askVolume)/(bidVolume+askVolume)*100},reason:'OK'};
}
export function analyzeMt5GoldDom(params:{
 now:number;symbol:string|null;snapshots:readonly Mt5DomSnapshot[];
 unavailableReason?:string
}):Mt5GoldDomReading{
 const {now}=params;
 const base:Mt5GoldDomReading={available:false,
  reason:params.unavailableReason||'لا يوجد دفتر أوامر ذهب متصل',
  status:'NO_BRIDGE',symbol:params.symbol,asOf:null,samples:0,spanMs:0,
  bidDepthLots:null,askDepthLots:null,imbalancePct:null,
  bidWall:null,askWall:null,bidPersistent:false,askPersistent:false,
  possibleBidWithdrawal:false,possibleAskWithdrawal:false,
  source:'NONE',actionable:false,executionAuthority:false};
 const rows=params.snapshots.filter(s=>s&&
  s.symbol===params.symbol&&Number.isFinite(s.at)&&
  now-s.at>=0&&now-s.at<=22000)
  .sort((a,b)=>a.at-b.at);
 const latest=rows.at(-1);
 if(!latest)return {...base,status:params.unavailableReason?
   'UNSUPPORTED':'NO_BRIDGE'};
 const warm={...base,source:'MT5_BROKER_DOM' as const,
  asOf:latest.at,samples:rows.length,
  spanMs:latest.at-rows[0].at,
  bidDepthLots:Number(latest.bidVolume.toFixed(3)),
  askDepthLots:Number(latest.askVolume.toFixed(3)),
  imbalancePct:Number(latest.imbalance.toFixed(1))};
 if(now-latest.at>7000)return {...warm,status:'STALE',reason:'عمق الوسيط تأخر'};
 if(rows.length<3||latest.at-rows[0].at<8000||
  rows.some((s,i)=>i>0&&s.at-rows[i-1].at>11000))
   return {...warm,status:'WARMUP',
     reason:'انتظار ثلاث عينات متتابعة من دفتر الوسيط خلال 8 ثوانٍ'};
 const prior=rows[0],mid0=(prior.bid+prior.ask)/2,
   midNow=(latest.bid+latest.ask)/2;
 const stable=Math.abs(midNow-mid0)/mid0*10000<=3;
 const persistent=(side:'bids'|'asks')=>{
  const b=latest[side],v=b.sort((x,y)=>y.volume-x.volume)[0];
  if(!v||v.volume<=0)return null;
  const same=rows.filter(s=>s[side].some(x=>
    Math.abs(x.price-v.price)<1e-8&&x.volume>=v.volume*.45));
  return same.length>=3?v.price:null;
 };
 const bidWall=persistent('bids'),askWall=persistent('asks');
 // The broker feed provides no executed-print reconciliation.
 // Label as POSSIBLE withdrawal, never a verified cancellation.
 const bidDrop=stable&&prior.bidVolume>0&&
  latest.bidVolume<=prior.bidVolume*.48;
 const askDrop=stable&&prior.askVolume>0&&
  latest.askVolume<=prior.askVolume*.48;
 const persistDrop=(key:'bidVolume'|'askVolume',flag:boolean)=>flag&&
  rows.slice(-2).every(x=>x[key]<=prior[key]*.58);
 const possibleBidWithdrawal=persistDrop('bidVolume',bidDrop);
 const possibleAskWithdrawal=persistDrop('askVolume',askDrop);
 return {...warm,available:true,
  status:possibleBidWithdrawal||possibleAskWithdrawal?
    'POSSIBLE_WITHDRAWAL':'OBSERVING',
  reason:possibleBidWithdrawal||possibleAskWithdrawal?
    'انخفاض العمق المُعلَن قد يكون إلغاءً أو تنفيذًا؛ لا يمكن تمييز السبب':
    'عمق معلن من وسيط MT5 فقط، غير شامل لبورصة COMEX',
  bidWall,askWall,bidPersistent:bidWall!=null,
  askPersistent:askWall!=null,possibleBidWithdrawal,possibleAskWithdrawal};
}
