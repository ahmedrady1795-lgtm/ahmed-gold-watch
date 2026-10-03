type Side='BUY'|'SELL'|'WAIT';

type DepthRow={price:number;size:number;time?:number};
type BookState={at:number;pressure:number;bidDepthUsd:number;askDepthUsd:number};

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
  warnings:string[];
};

let cache:{at:number;value:LiquidityIntelligence}|null=null;
let previous:BookState|null=null;

const clamp=(n:number,min=-100,max=100)=>Math.max(min,Math.min(max,n));
const finite=(v:any)=>Number.isFinite(Number(v));
const pctChange=(a:number,b:number)=>b?((a-b)/Math.abs(b))*100:0;

async function getJson(url:string){
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});
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
function weightedDepth(rows:DepthRow[],best:number){
  let total=0;
  for(const r of rows){
    const distance=Math.abs(r.price-best)/best*10000;
    const weight=1/(1+distance/4);
    total+=r.price*r.size*weight;
  }
  return total;
}
function tradeFlow(rows:any[]){
  const trades=(Array.isArray(rows)?rows:[])
    .map((x:any)=>({price:Number(x?.price),size:Number(x?.size),time:Date.parse(x?.time||''),id:Number(x?.trade_id)}))
    .filter((x:any)=>finite(x.price)&&finite(x.size)&&x.price>0&&x.size>0)
    .sort((a:any,b:any)=>(a.time-b.time)||(a.id-b.id));
  let buy=0,sell=0,lastSign=0;
  for(let i=1;i<trades.length;i++){
    const d=trades[i].price-trades[i-1].price;
    if(d>0)lastSign=1;else if(d<0)lastSign=-1;
    if(lastSign>0)buy+=trades[i].size;else if(lastSign<0)sell+=trades[i].size;
  }
  const total=buy+sell,delta=buy-sell,deltaPct=total>0?delta/total*100:0;
  const first=trades[0]?.price,last=trades.at(-1)?.price,priceChangeBps=first&&last?(last-first)/first*10000:0;
  return {tradeCount:trades.length,buyVolume:buy,sellVolume:sell,deltaVolume:delta,deltaPct,priceChangeBps,cvdSide:sideFromPressure(deltaPct,10)};
}

export async function getBtcLiquidity(force=false):Promise<LiquidityIntelligence>{
  const now=Date.now();
  if(!force&&cache&&now-cache.at<1800)return cache.value;
  const warnings:string[]=[];
  const [bboR,depthR,tradesR]=await Promise.allSettled([
    getJson('https://api.exchange.coinbase.com/products/BTC-USD/book?level=1'),
    getJson('https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=25'),
    getJson('https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=100')
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

  const flow=tradesR.status==='fulfilled'?tradeFlow(tradesR.value):tradeFlow([]);
  if(tradesR.status==='rejected')warnings.push('Coinbase trades unavailable');

  const bboTotal=bidSize+askSize,bboImbalance=bboTotal>0?(bidSize-askSize)/bboTotal*100:0;
  const depthBid=bids.length?weightedDepth(bids,bids[0].price):0,depthAsk=asks.length?weightedDepth(asks,asks[0].price):0;
  const depthTotal=depthBid+depthAsk,depthImbalance=depthTotal>0?(depthBid-depthAsk)/depthTotal*100:0;
  const rawBidUsd=bids.reduce((s,x)=>s+x.price*x.size,0),rawAskUsd=asks.reduce((s,x)=>s+x.price*x.size,0);
  const mid=bestBid&&bestAsk?(bestBid+bestAsk)/2:null,spread=bestBid&&bestAsk?bestAsk-bestBid:null,spreadBps=mid&&spread!=null?spread/mid*10000:null;
  const microprice=bestBid&&bestAsk&&bboTotal>0?(bestAsk*bidSize+bestBid*askSize)/bboTotal:null;
  const microEdge=mid&&spread&&microprice!=null&&spread>0?clamp((microprice-mid)/(spread/2)*100):0;
  const bidWall=wallRatio(bids),askWall=wallRatio(asks),wallDiff=bidWall-askWall,wallSide:Side=wallDiff>=1.2?'BUY':wallDiff<=-1.2?'SELL':'WAIT';
  const weightedImbalance=clamp(depthImbalance*.72+bboImbalance*.18+microEdge*.10);

  const old=previous,pressureBase=clamp(weightedImbalance*.58+flow.deltaPct*.42);
  const pressureChange=old?pressureBase-old.pressure:0;
  const bidDepthChangePct=old?pctChange(rawBidUsd,old.bidDepthUsd):0,askDepthChangePct=old?pctChange(rawAskUsd,old.askDepthUsd):0;
  const acceleration=clamp(pressureChange*.55+(bidDepthChangePct-askDepthChangePct)*.45);
  previous={at:now,pressure:pressureBase,bidDepthUsd:rawBidUsd,askDepthUsd:rawAskUsd};

  const absDelta=Math.abs(flow.deltaPct),signedPrice=flow.priceChangeBps;
  const sellFollowThrough=flow.deltaPct<=-18&&signedPrice<=-2.2;
  const buyFollowThrough=flow.deltaPct>=18&&signedPrice>=2.2;
  let absorptionSide:Side='WAIT',absorptionScore=0,absorptionReason='لا يوجد امتصاص واضح.',trapDetected=false,followThrough=sellFollowThrough||buyFollowThrough;
  if(flow.deltaPct<=-30&&signedPrice>-2.2){
    trapDetected=true;absorptionSide='BUY';
    const mismatch=signedPrice>=0?20:10;
    absorptionScore=Math.min(92,Math.round(45+absDelta*.45+mismatch));
    absorptionReason='بيع هجومي كبير لكن السعر رفض الهبوط: فخ بيع/امتصاص شراء محتمل.';
  }else if(flow.deltaPct>=30&&signedPrice<2.2){
    trapDetected=true;absorptionSide='SELL';
    const mismatch=signedPrice<=0?20:10;
    absorptionScore=Math.min(92,Math.round(45+absDelta*.45+mismatch));
    absorptionReason='شراء هجومي كبير لكن السعر رفض الصعود: فخ شراء/امتصاص بيع محتمل.';
  }else if(flow.deltaPct<=-24&&signedPrice>=-1.2){
    absorptionSide='BUY';absorptionScore=Math.min(88,Math.round(36+absDelta*.38));absorptionReason='ضغط بيع بدون متابعة سعرية كافية: امتصاص شراء محتمل.';
  }else if(flow.deltaPct>=24&&signedPrice<=1.2){
    absorptionSide='SELL';absorptionScore=Math.min(88,Math.round(36+absDelta*.38));absorptionReason='ضغط شراء بدون متابعة سعرية كافية: امتصاص بيع محتمل.';
  }

  const flowWeight=trapDetected?.04:followThrough?.30:.16;
  const absorptionAdj=absorptionSide==='BUY'?Math.min(30,absorptionScore*.32):absorptionSide==='SELL'?-Math.min(30,absorptionScore*.32):0;
  const wallAdj=wallSide==='BUY'?Math.min(4,Math.max(0,wallDiff)*1.2):wallSide==='SELL'?-Math.min(4,Math.max(0,-wallDiff)*1.2):0;
  const signed=clamp(weightedImbalance*.40+flow.deltaPct*flowWeight+acceleration*.12+absorptionAdj+wallAdj,-84,84);
  const buy=Math.round(clamp(50+signed/2,8,92)),sell=100-buy,side=buy-sell>=10?'BUY':sell-buy>=10?'SELL':'WAIT';
  const successCount=[bboR,depthR,tradesR].filter(x=>x.status==='fulfilled').length;
  const quality=Math.max(0,Math.min(100,Math.round(successCount/3*82+(bids.length>=20&&asks.length>=20?10:0)+(flow.tradeCount>=20?8:0))));
  const value:LiquidityIntelligence={
    ok:quality>=55,source:'Coinbase BBO + Trades · Kraken Depth25',checkedAt:now,quality,side,buy,sell,strength:Math.max(buy,sell),pressure:Math.round(signed),
    book:{bestBid,bestAsk,spreadBps:spreadBps==null?null:Number(spreadBps.toFixed(3)),bboImbalance:Math.round(bboImbalance),depthImbalance:Math.round(depthImbalance),weightedImbalance:Math.round(weightedImbalance),microprice:microprice==null?null:Number(microprice.toFixed(2)),microEdge:Math.round(microEdge),bidDepthUsd:Math.round(rawBidUsd),askDepthUsd:Math.round(rawAskUsd),bidWall:Number(bidWall.toFixed(2)),askWall:Number(askWall.toFixed(2)),wallSide},
    flow:{tradeCount:flow.tradeCount,buyVolume:Number(flow.buyVolume.toFixed(6)),sellVolume:Number(flow.sellVolume.toFixed(6)),deltaVolume:Number(flow.deltaVolume.toFixed(6)),deltaPct:Number(flow.deltaPct.toFixed(1)),priceChangeBps:Number(flow.priceChangeBps.toFixed(2)),cvdSide:flow.cvdSide},
    dynamics:{pressureChange:Number(pressureChange.toFixed(1)),bidDepthChangePct:Number(bidDepthChangePct.toFixed(1)),askDepthChangePct:Number(askDepthChangePct.toFixed(1)),acceleration:Number(acceleration.toFixed(1))},
    absorption:{side:absorptionSide,score:absorptionScore,reason:absorptionReason,trapDetected,followThrough},warnings
  };
  cache={at:now,value};return value;
}
