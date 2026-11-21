type Side='BUY'|'SELL'|'WAIT';

type DepthRow={price:number;size:number;time?:number};
type BookState={at:number;pressure:number;bidDepthUsd:number;askDepthUsd:number;bestBid:number;bestAsk:number};

export type LiquidityIntelligence={
  ok:boolean;
  source:string;
  checkedAt:number;
  quality:number;
  side:Side;
  buy:number;
  sell:number;
  strength:number;
  pressure:number;
  providers:{
    coinbaseBbo:boolean;
    coinbaseTrades:boolean;
    krakenDepth:boolean;
    okxDepth:boolean;
    okxTrades:boolean;
  };
  book:{
    bestBid:number|null;
    bestAsk:number|null;
    spreadBps:number|null;
    bboImbalance:number;
    depthImbalance:number;
    weightedImbalance:number;
    microprice:number|null;
    microEdge:number;
    bidDepthUsd:number;
    askDepthUsd:number;
    bidWall:number;
    askWall:number;
    bidWallPrice:number|null;
    askWallPrice:number|null;
    wallSide:Side;
  };
  flow:{
    tradeCount:number;
    buyVolume:number;
    sellVolume:number;
    deltaVolume:number;
    deltaPct:number;
    priceChangeBps:number;
    cvdSide:Side;
  };
  dynamics:{
    pressureChange:number;
    bidDepthChangePct:number;
    askDepthChangePct:number;
    acceleration:number;
  };
  absorption:{
    side:Side;
    score:number;
    reason:string;
    trapDetected:boolean;
    followThrough:boolean;
  };
  integrity:{status:'NORMAL'|'VENUE_CONFLICT'|'POSSIBLE_DEPTH_WITHDRAWAL'|'UNVERIFIED';
    blockedSides:('BUY'|'SELL')[];reasons:string[]};
  warnings:string[];
};

let cache:{at:number;value:LiquidityIntelligence}|null=null;
let pending:Promise<LiquidityIntelligence>|null=null;
let previous:BookState|null=null;
let lastGood:{at:number;value:LiquidityIntelligence}|null=null;

const clamp=(n:number,min=-100,max=100)=>Math.max(min,Math.min(max,n));
const finite=(v:any)=>Number.isFinite(Number(v));
const pctChange=(a:number,b:number)=>b?((a-b)/Math.abs(b))*100:0;

async function getJson(url:string,timeoutMs=1800){
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});
  const j=await r.json();
  if(!r.ok)throw new Error('HTTP '+r.status);
  return j;
}
function sideFromPressure(v:number,gate=12):Side{return v>=gate?'BUY':v<=-gate?'SELL':'WAIT';}
function wallRatio(rows:DepthRow[]){
  if(!rows.length)return 0;
  const notionals=rows.map(x=>x.price*x.size).filter(Number.isFinite);
  if(!notionals.length)return 0;
  const avg=notionals.reduce((a,b)=>a+b,0)/notionals.length;
  return avg>0?Math.max(...notionals)/avg:0;
}
function wallPoint(rows:DepthRow[]){
  if(!rows.length)return {price:null as number|null,ratio:0};
  const values=rows.map(x=>({price:x.price,notional:x.price*x.size})).filter(x=>Number.isFinite(x.notional)&&x.notional>0);
  if(!values.length)return {price:null as number|null,ratio:0};
  const avg=values.reduce((a,b)=>a+b.notional,0)/values.length;
  const top=[...values].sort((a,b)=>b.notional-a.notional)[0];
  return {price:Number(top.price.toFixed(2)),ratio:avg>0?top.notional/avg:0};
}
function weightedDepth(rows:DepthRow[],best:number){
  let total=0;
  for(const r of rows){
    const distance=Math.abs(r.price-best)/best*10000;
    const weight=1/(1+distance/4);
    total+=r.price*r.size*weight;
  }
  return total;
}
// A single 30-second contemporaneous trade window on each exchange.
 // Coinbase Exchange REST 'side' is the resting maker, NOT the aggressor.
 // Unlike a tick-rule proxy, the inverse maker side is observed executed flow.
const BTC_TRADE_WINDOW_MS=30000;
type SampleTrade={id:string;time:number;price:number;size:number;aggressor:'BUY'|'SELL'};
function executedFlow(rows:SampleTrade[]){
 const trades=[...rows].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 let buy=0,sell=0;
 for(const t of trades){
  if(t.aggressor==='BUY')buy+=t.size;else sell+=t.size;
 }
 const total=buy+sell,delta=buy-sell,deltaPct=total>0?delta/total*100:0;
 const first=trades[0]?.price,last=trades.at(-1)?.price;
 const priceChangeBps=first&&last?(last-first)/first*10000:0;
 return {tradeCount:trades.length,buyVolume:buy,sellVolume:sell,
  deltaVolume:delta,deltaPct,priceChangeBps,
  cvdSide:sideFromPressure(deltaPct,10),
  oldestAt:trades[0]?.time??null,newestAt:trades.at(-1)?.time??null};
}
function verifiedTrades(raw:unknown,now:number,venue:'COINBASE'|'OKX'):SampleTrade[]{
 if(!Array.isArray(raw))return [];
 const byId=new Map<string,SampleTrade>(),conflicted=new Set<string>();
 for(const item of raw.slice(0,1000)){
  if(!item||typeof item!=='object')continue;
  const x=item as Record<string,unknown>;
  const id=String(venue==='COINBASE'?x.trade_id:x.tradeId||'').trim();
  const time=venue==='COINBASE'?Date.parse(String(x.time||'')):Number(x.ts);
  const price=Number(venue==='COINBASE'?x.price:x.px);
  const size=Number(venue==='COINBASE'?x.size:x.sz);
  const side=String(x.side||'').toLowerCase();
  if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||
    !Number.isFinite(time)||time>now||now-time>BTC_TRADE_WINDOW_MS||
    !Number.isFinite(price)||price<=0||!Number.isFinite(size)||
    size<=0||size>500||(side!=='buy'&&side!=='sell'))continue;
  const aggressor=venue==='COINBASE'?
    (side==='sell'?'BUY':'SELL'):(side==='buy'?'BUY':'SELL');
  const trade:SampleTrade={id,time,price,size,aggressor};
  const old=byId.get(id);
  if(old&&(old.time!==trade.time||old.price!==trade.price||
    old.size!==trade.size||old.aggressor!==trade.aggressor)){
    conflicted.add(id);byId.delete(id);continue;
  }
  if(!conflicted.has(id))byId.set(id,trade);
 }
 return [...byId.values()];
}
export function coinbaseExecutedFlow(rows:unknown,now=Date.now()){
 return executedFlow(verifiedTrades(rows,now,'COINBASE'));
}
export function okxExecutedFlow(rows:unknown,now=Date.now()){
 return executedFlow(verifiedTrades(rows,now,'OKX'));
}

// Contradictions are a conservative paper-entry veto, not evidence that an
// order was canceled intentionally. Compare directional pressure, never raw
// USD and USDT price levels as though they were the same instrument.
export function assessBtcLiquidityIntegrity(a:{
  krakenReady:boolean;okxReady:boolean;krakenImbalance:number;okxImbalance:number;
  coinbaseTrades:number;okxTrades:number;coinbaseDelta:number;okxDelta:number;
  now:number;bid:number;ask:number;bidDepthUsd:number;askDepthUsd:number;
  previous:BookState|null
}){
  const crossDepth=a.krakenReady&&a.okxReady&&
    ((a.krakenImbalance>=28&&a.okxImbalance<=-28)||
     (a.krakenImbalance<=-28&&a.okxImbalance>=28));
  const crossTrades=a.coinbaseTrades>=25&&a.okxTrades>=25&&
    ((a.coinbaseDelta>=35&&a.okxDelta<=-35)||
     (a.coinbaseDelta<=-35&&a.okxDelta>=35));
  const previous=a.previous;
  const stablePrices=Boolean(a.krakenReady&&previous&&
    a.now-previous.at>=1000&&a.now-previous.at<=12000&&
    previous.bestBid>0&&previous.bestAsk>0&&
    Math.abs(a.bid-previous.bestBid)/previous.bestBid*10000<=2&&
    Math.abs(a.ask-previous.bestAsk)/previous.bestAsk*10000<=2);
  const bidWithdrawal=Boolean(stablePrices&&previous&&
    previous.bidDepthUsd>=200000&&a.bidDepthUsd<=previous.bidDepthUsd*.45);
  const askWithdrawal=Boolean(stablePrices&&previous&&
    previous.askDepthUsd>=200000&&a.askDepthUsd<=previous.askDepthUsd*.45);
  const blocked=new Set<'BUY'|'SELL'>();
  const reasons:string[]=[];
  if(crossDepth||crossTrades){
    blocked.add('BUY');blocked.add('SELL');
    reasons.push('تضارب كبير بين مصادر عمق السوق أو تدفق الصفقات المستقلة');
  }
  if(bidWithdrawal){blocked.add('BUY');reasons.push('تراجع مفاجئ محتمل في عمق طلبات الشراء؛ ليس دليل تلاعب');}
  if(askWithdrawal){blocked.add('SELL');reasons.push('تراجع مفاجئ محتمل في عمق طلبات البيع؛ ليس دليل تلاعب');}
  return {status:crossDepth||crossTrades?'VENUE_CONFLICT' as const:
    bidWithdrawal||askWithdrawal?'POSSIBLE_DEPTH_WITHDRAWAL' as const:
    !a.krakenReady&&!a.okxReady?'UNVERIFIED' as const:'NORMAL' as const,
    blockedSides:[...blocked],reasons};
}


/**
 * Strict per-feed validity. HTTP 200 is not evidence of a usable, recent
 * order book or executed trade. OKX USDT quotes are not compared directly
 * to USD best bids/asks to avoid pretending they're one instrument.
 * Missing timestamps are unknown, not silently treated as fresh.
 */
export function assessBtcLiquidityFeedHealth(a:{
  now:number;coinbaseBid:number|null;coinbaseAsk:number|null;
  krakenBid:number|null;krakenAsk:number|null;krakenNewestAt:number|null;
  okxBid:number|null;okxAsk:number|null;okxAt:number|null;
  coinbaseTradeAt:number|null;okxTradeAt:number|null;
  coinbaseTradeCount:number;okxTradeCount:number;
}){
  const reasons:string[]=[];
  const bbo=a.coinbaseBid!=null&&a.coinbaseAsk!=null&&
    Number.isFinite(a.coinbaseBid)&&Number.isFinite(a.coinbaseAsk)&&
    a.coinbaseBid>0&&a.coinbaseAsk>a.coinbaseBid&&
    (a.coinbaseAsk-a.coinbaseBid)/a.coinbaseBid*10000<=12;
  const fresh=(time:number|null,limit:number)=>time!=null&&Number.isFinite(time)&&
    time>0&&a.now-time>=-3000&&a.now-time<=limit;
  const depth=(bid:number|null,ask:number|null,time:number|null)=>bid!=null&&ask!=null&&
    Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>bid&&
    (ask-bid)/bid*10000<=15&&fresh(time,90000);
  const krakenDepth=depth(a.krakenBid,a.krakenAsk,a.krakenNewestAt);
  const okxDepth=depth(a.okxBid,a.okxAsk,a.okxAt);
  const coinbaseTrades=a.coinbaseTradeCount>=10&&fresh(a.coinbaseTradeAt,BTC_TRADE_WINDOW_MS);
  const okxTrades=a.okxTradeCount>=10&&fresh(a.okxTradeAt,BTC_TRADE_WINDOW_MS);
  if(a.coinbaseBid!=null&&a.coinbaseAsk!=null&&!bbo)reasons.push('Coinbase BBO مقلوب أو سبريد غير طبيعي');
  if(a.krakenBid!=null&&!krakenDepth)reasons.push('عمق Kraken متأخر أو غير صالح');
  if(a.okxBid!=null&&!okxDepth)reasons.push('عمق OKX متأخر أو غير صالح');
  if(a.coinbaseTradeCount>0&&!coinbaseTrades)reasons.push('صفقات Coinbase متأخرة أو غير كافية');
  if(a.okxTradeCount>0&&!okxTrades)reasons.push('صفقات OKX متأخرة أو غير كافية');
  const bookReady=krakenDepth||okxDepth;
  const tradesReady=coinbaseTrades||okxTrades;
  if(!bookReady)reasons.push('لا يوجد دفتر أوامر حديث صالح');
  if(!tradesReady)reasons.push('لا توجد صفقات حديثة كافية');
  // One broken Coinbase BBO must not suppress independent valid Kraken/OKX books.
  // It simply loses its own vote and lowers quality.
  return {ok:bookReady&&tradesReady,
    bbo,krakenDepth,okxDepth,coinbaseTrades,okxTrades,
    bookReady,tradesReady,reasons};
}

// The analysis route, stream, and scalp desk can request this together.
 // Share the same five exchange requests; bypassing the result cache still
 // must not fan out duplicate REST calls within a server process.
export function getBtcLiquidity(force=false):Promise<LiquidityIntelligence>{
 const now=Date.now();
 if(!force&&cache&&now-cache.at<1800)return Promise.resolve(cache.value);
 if(pending)return pending;
 const task=collectBtcLiquidity();
 pending=task;
 const clear=()=>{if(pending===task)pending=null;};
 void task.then(clear,clear);
 return task;
}
async function collectBtcLiquidity():Promise<LiquidityIntelligence>{
  const now=Date.now();
  const warnings:string[]=[];
  const [bboR,depthR,tradesR,okxDepthR,okxTradesR]=await Promise.allSettled([
    getJson('https://api.exchange.coinbase.com/products/BTC-USD/book?level=1'),
    getJson('https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=25'),
    getJson('https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=100'),
    getJson('https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=25'),
    getJson('https://www.okx.com/api/v5/market/trades?instId=BTC-USDT&limit=100')
  ]);
  let bestBid:number|null=null,bestAsk:number|null=null,bidSize=0,askSize=0;
  if(bboR.status==='fulfilled'){
    bestBid=Number(bboR.value?.bids?.[0]?.[0]);bidSize=Number(bboR.value?.bids?.[0]?.[1])||0;
    bestAsk=Number(bboR.value?.asks?.[0]?.[0]);askSize=Number(bboR.value?.asks?.[0]?.[1])||0;
    if(!finite(bestBid)||!finite(bestAsk)||!bestBid||!bestAsk){bestBid=null;bestAsk=null;warnings.push('Coinbase BBO schema');}
  }else warnings.push('Coinbase BBO unavailable');

  let bids:DepthRow[]=[],asks:DepthRow[]=[];
  if(depthR.status==='fulfilled'){
    const result=depthR.value?.result||{},key=Object.keys(result).find(k=>k!=='last'),row=key?result[key]:null;
    bids=(row?.bids||[]).slice(0,25).map((x:any)=>({price:Number(x[0]),size:Number(x[1]),time:Number(x[2])*1000})).filter((x:DepthRow)=>finite(x.price)&&finite(x.size)&&x.price>0&&x.size>0);
    asks=(row?.asks||[]).slice(0,25).map((x:any)=>({price:Number(x[0]),size:Number(x[1]),time:Number(x[2])*1000})).filter((x:DepthRow)=>finite(x.price)&&finite(x.size)&&x.price>0&&x.size>0);
    if(!bids.length||!asks.length)warnings.push('Kraken depth empty');
  }else warnings.push('Kraken depth unavailable');

  let okxBids:DepthRow[]=[],okxAsks:DepthRow[]=[];
  if(okxDepthR.status==='fulfilled'){
    const row=Array.isArray(okxDepthR.value?.data)?okxDepthR.value.data[0]:null;
    okxBids=(row?.bids||[]).slice(0,25).map((x:any)=>({price:Number(x[0]),size:Number(x[1])})).filter((x:DepthRow)=>finite(x.price)&&finite(x.size)&&x.price>0&&x.size>0);
    okxAsks=(row?.asks||[]).slice(0,25).map((x:any)=>({price:Number(x[0]),size:Number(x[1])})).filter((x:DepthRow)=>finite(x.price)&&finite(x.size)&&x.price>0&&x.size>0);
    if(!okxBids.length||!okxAsks.length)warnings.push('OKX depth empty');
  }else warnings.push('OKX depth unavailable');
  const okxFlow=okxExecutedFlow(okxTradesR.status==='fulfilled'?okxTradesR.value?.data:[],now);
  if(okxTradesR.status==='rejected')warnings.push('OKX trades unavailable');

  const coinbaseTradeRows=tradesR.status==='fulfilled'&&Array.isArray(tradesR.value)?tradesR.value:[];
  const flow=coinbaseExecutedFlow(coinbaseTradeRows,now);
  const coinbaseTradeAt=flow.newestAt;
  const okxTradeAt=okxFlow.newestAt;
  if(tradesR.status==='rejected')warnings.push('Coinbase trades unavailable');

  const bboTotal=bidSize+askSize,bboImbalance=bboTotal>0?(bidSize-askSize)/bboTotal*100:0;
  const depthBid=bids.length?weightedDepth(bids,bids[0].price):0,depthAsk=asks.length?weightedDepth(asks,asks[0].price):0;
  const depthTotal=depthBid+depthAsk,depthImbalance=depthTotal>0?(depthBid-depthAsk)/depthTotal*100:0;
  const rawBidUsd=bids.reduce((s,x)=>s+x.price*x.size,0),rawAskUsd=asks.reduce((s,x)=>s+x.price*x.size,0);
  const mid=bestBid&&bestAsk?(bestBid+bestAsk)/2:null,spread=bestBid&&bestAsk?bestAsk-bestBid:null,spreadBps=mid&&spread!=null?spread/mid*10000:null;
  const microprice=bestBid&&bestAsk&&bboTotal>0?(bestAsk*bidSize+bestBid*askSize)/bboTotal:null;
  const microEdge=mid&&spread&&microprice!=null&&spread>0?clamp((microprice-mid)/(spread/2)*100):0;
  const bidWallPoint=wallPoint(bids),askWallPoint=wallPoint(asks);
  const bidWall=bidWallPoint.ratio,askWall=askWallPoint.ratio,wallDiff=bidWall-askWall,wallSide:Side=wallDiff>=1.2?'BUY':wallDiff<=-1.2?'SELL':'WAIT';
  const okxDepthBid=okxBids.length?weightedDepth(okxBids,okxBids[0].price):0,okxDepthAsk=okxAsks.length?weightedDepth(okxAsks,okxAsks[0].price):0;
  const okxDepthTotal=okxDepthBid+okxDepthAsk,okxDepthImbalance=okxDepthTotal>0?(okxDepthBid-okxDepthAsk)/okxDepthTotal*100:0;
  const freshestKraken=([...bids,...asks].map(v=>v.time||0).filter(x=>x>0).sort((a,b)=>b-a)[0]||null);
  const okxDepthAt=okxDepthR.status==='fulfilled'?
    Number((Array.isArray(okxDepthR.value?.data)?okxDepthR.value.data[0]:null)?.ts):NaN;
  const health=assessBtcLiquidityFeedHealth({
    now,coinbaseBid:bestBid,coinbaseAsk:bestAsk,
    krakenBid:bids[0]?.price||null,krakenAsk:asks[0]?.price||null,
    krakenNewestAt:freshestKraken,
    okxBid:okxBids[0]?.price||null,okxAsk:okxAsks[0]?.price||null,
    okxAt:Number.isFinite(okxDepthAt)?okxDepthAt:null,
    coinbaseTradeAt,okxTradeAt,coinbaseTradeCount:flow.tradeCount,
    okxTradeCount:okxFlow.tradeCount
  });
  warnings.push(...health.reasons);
  // Stale books and stale trades cannot vote on the direction or on
  // absorption, even if another healthy venue made the aggregate usable.
  // Missing independent sources reduce conviction rather than scaling the
  // remaining single source to an artificial 100% pressure.
  const cbDelta=health.coinbaseTrades?flow.deltaPct:0;
  const okxDelta=health.okxTrades?okxFlow.deltaPct:0;
  const cbPriceChange=health.coinbaseTrades?flow.priceChangeBps:0;
  const verifiedDepthImbalance=health.krakenDepth?depthImbalance:0;
  const verifiedOkxImbalance=health.okxDepth?okxDepthImbalance:0;
  const verifiedMicroEdge=health.bbo?microEdge:0;
  const weightedImbalance=clamp(verifiedDepthImbalance*.72+
    (health.bbo?bboImbalance:0)*.18+verifiedMicroEdge*.10);
  const crossExchangePressure=clamp(weightedImbalance*.55+
    verifiedOkxImbalance*.25+cbDelta*.10+okxDelta*.10);
  // The most recent 100 trades on two exchanges often cover different
  // time spans. Opposite deltas from NON-overlapping windows are not
  // evidence of a simultaneous venue conflict.
  const comparableTrades=flow.oldestAt!=null&&flow.newestAt!=null&&
    okxFlow.oldestAt!=null&&okxFlow.newestAt!=null&&
    Math.min(flow.newestAt,okxFlow.newestAt)-
    Math.max(flow.oldestAt,okxFlow.oldestAt)>=1000&&
    Math.abs(flow.newestAt-okxFlow.newestAt)<=5000;
  if(health.coinbaseTrades&&health.okxTrades&&!comparableTrades)
    warnings.push('Coinbase/OKX executed-trade windows do not overlap enough to compare directional delta');
  const integrity=assessBtcLiquidityIntegrity({
    krakenReady:health.krakenDepth&&bids.length>=15&&asks.length>=15,
    okxReady:health.okxDepth&&okxBids.length>=15&&okxAsks.length>=15,
    krakenImbalance:verifiedDepthImbalance,okxImbalance:verifiedOkxImbalance,
    coinbaseTrades:health.coinbaseTrades&&comparableTrades?flow.tradeCount:0,
    okxTrades:health.okxTrades&&comparableTrades?okxFlow.tradeCount:0,
    coinbaseDelta:cbDelta,okxDelta,now,
    bid:bids[0]?.price||0,ask:asks[0]?.price||0,
    bidDepthUsd:rawBidUsd,askDepthUsd:rawAskUsd,previous
  });
  if(integrity.reasons.length)warnings.push(...integrity.reasons);

  const old=health.krakenDepth?previous:null,
    pressureBase=clamp(crossExchangePressure*.68+cbDelta*.18+okxDelta*.14);
  const pressureChange=old?pressureBase-old.pressure:0;
  const bidDepthChangePct=old?pctChange(rawBidUsd,old.bidDepthUsd):0,askDepthChangePct=old?pctChange(rawAskUsd,old.askDepthUsd):0;
  const acceleration=clamp(pressureChange*.55+(bidDepthChangePct-askDepthChangePct)*.45);
  // A failed venue must not reset the previous valid depth or pressure to zero.

  const absDelta=Math.abs(cbDelta),signedPrice=cbPriceChange;
  const sellFollowThrough=cbDelta<=-18&&signedPrice<=-2.2;
  const buyFollowThrough=cbDelta>=18&&signedPrice>=2.2;
  let absorptionSide:Side='WAIT',absorptionScore=0,absorptionReason='لا يوجد امتصاص واضح.',trapDetected=false,followThrough=sellFollowThrough||buyFollowThrough;
  if(cbDelta<=-30&&signedPrice>-2.2){
    trapDetected=true;absorptionSide='BUY';
    const mismatch=signedPrice>=0?20:10;
    absorptionScore=Math.min(92,Math.round(45+absDelta*.45+mismatch));
    absorptionReason='بيع هجومي كبير لكن السعر رفض الهبوط: فخ بيع/امتصاص شراء محتمل.';
  }else if(cbDelta>=30&&signedPrice<2.2){
    trapDetected=true;absorptionSide='SELL';
    const mismatch=signedPrice<=0?20:10;
    absorptionScore=Math.min(92,Math.round(45+absDelta*.45+mismatch));
    absorptionReason='شراء هجومي كبير لكن السعر رفض الصعود: فخ شراء/امتصاص بيع محتمل.';
  }else if(cbDelta<=-24&&signedPrice>=-1.2){
    absorptionSide='BUY';absorptionScore=Math.min(88,Math.round(36+absDelta*.38));absorptionReason='ضغط بيع بدون متابعة سعرية كافية: امتصاص شراء محتمل.';
  }else if(cbDelta>=24&&signedPrice<=1.2){
    absorptionSide='SELL';absorptionScore=Math.min(88,Math.round(36+absDelta*.38));absorptionReason='ضغط شراء بدون متابعة سعرية كافية: امتصاص بيع محتمل.';
  }

  const flowWeight=trapDetected?.04:followThrough?.30:.16;
  const absorptionAdj=absorptionSide==='BUY'?Math.min(30,absorptionScore*.32):absorptionSide==='SELL'?-Math.min(30,absorptionScore*.32):0;
  const wallAdj=!health.krakenDepth?0:wallSide==='BUY'?Math.min(4,Math.max(0,wallDiff)*1.2):wallSide==='SELL'?-Math.min(4,Math.max(0,-wallDiff)*1.2):0;
  const signed=clamp(crossExchangePressure*.38+cbDelta*flowWeight*.70+okxDelta*.12+verifiedOkxImbalance*.10+acceleration*.10+absorptionAdj+wallAdj,-84,84);
  const buy=Math.round(clamp(50+signed/2,8,92)),sell=100-buy,side=buy-sell>=10?'BUY':sell-buy>=10?'SELL':'WAIT';
  const successCount=[bboR,depthR,tradesR,okxDepthR,okxTradesR].filter(x=>x.status==='fulfilled').length;
  const quality=Math.max(0,Math.min(100,Math.round(successCount/5*52+
    (health.bbo?10:0)+(health.krakenDepth?14:0)+(health.okxDepth?14:0)+
    (health.coinbaseTrades?5:0)+(health.okxTrades?5:0))));
  // Require actual book depth and trades, not just successful HTTP responses.
  const reliable=quality>=55&&health.ok&&integrity.status!=='VENUE_CONFLICT';
  if(!reliable)warnings.push('Insufficient fresh order-book + trade evidence');
  const value:LiquidityIntelligence={
    ok:reliable,source:'Coinbase BBO/Trades · Kraken Depth25 · OKX Depth25/Trades',checkedAt:now,quality,side:reliable?side:'WAIT',buy:reliable?buy:50,sell:reliable?sell:50,strength:reliable?Math.max(buy,sell):0,pressure:reliable?Math.round(signed):0,
    providers:{
      coinbaseBbo:health.bbo,
      coinbaseTrades:health.coinbaseTrades,
      krakenDepth:health.krakenDepth,
      okxDepth:health.okxDepth,
      okxTrades:health.okxTrades
    },
    book:{bestBid:health.bbo?bestBid:null,bestAsk:health.bbo?bestAsk:null,
      spreadBps:health.bbo&&spreadBps!=null?Number(spreadBps.toFixed(3)):null,
      bboImbalance:health.bbo?Math.round(bboImbalance):0,
      depthImbalance:Math.round(verifiedDepthImbalance),weightedImbalance:Math.round(weightedImbalance),
      microprice:health.bbo&&microprice!=null?Number(microprice.toFixed(2)):null,
      microEdge:Math.round(verifiedMicroEdge),
      bidDepthUsd:health.krakenDepth?Math.round(rawBidUsd):0,
      askDepthUsd:health.krakenDepth?Math.round(rawAskUsd):0,bidWall:Number(bidWall.toFixed(2)),askWall:Number(askWall.toFixed(2)),bidWallPrice:bidWallPoint.price,askWallPrice:askWallPoint.price,wallSide:health.krakenDepth?wallSide:'WAIT'},
    flow:{tradeCount:health.coinbaseTrades?flow.tradeCount:0,
      buyVolume:health.coinbaseTrades?Number(flow.buyVolume.toFixed(6)):0,
      sellVolume:health.coinbaseTrades?Number(flow.sellVolume.toFixed(6)):0,
      deltaVolume:health.coinbaseTrades?Number(flow.deltaVolume.toFixed(6)):0,
      deltaPct:Number(cbDelta.toFixed(1)),priceChangeBps:Number(cbPriceChange.toFixed(2)),
      cvdSide:health.coinbaseTrades?flow.cvdSide:'WAIT'},
    dynamics:{pressureChange:Number(pressureChange.toFixed(1)),bidDepthChangePct:Number(bidDepthChangePct.toFixed(1)),askDepthChangePct:Number(askDepthChangePct.toFixed(1)),acceleration:Number(acceleration.toFixed(1))},
    absorption:{side:absorptionSide,score:absorptionScore,reason:absorptionReason,trapDetected,followThrough},integrity,warnings
  };
  if(reliable){
    previous={at:now,pressure:pressureBase,bidDepthUsd:rawBidUsd,askDepthUsd:rawAskUsd,bestBid:bids[0]?.price||0,bestAsk:asks[0]?.price||0};
    lastGood={at:now,value};
    cache={at:now,value};return value;
  }
  if(lastGood&&now-lastGood.at<=45000){
    // Display last known reading for continuity, but never present it as tradable/live.
    const stale:LiquidityIntelligence={
      ...lastGood.value,ok:false,quality:Math.min(45,lastGood.value.quality),
      checkedAt:lastGood.at,source:lastGood.value.source+' · last known (stale)',
      integrity:integrity.status==='VENUE_CONFLICT'?integrity:{status:'UNVERIFIED',blockedSides:[],reasons:['توقف تحديث السيولة؛ يمنع تأكيد دخول جديد']},
      warnings:[...warnings,'Held last valid liquidity reading; trading confirmation disabled']
    };
    cache={at:now,value:stale};return stale;
  }
  cache={at:now,value};return value;
}
