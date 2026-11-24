import {getMarketData} from '../../../lib/market-hub';
import {getBtcMarket} from '../../../lib/btc-market';
import {chartAssetFromMarket} from '../../../lib/chart-history';
import {historicalChartAsset} from '../../../lib/chart-last-good';
import {updateStructuralWatchFromChart} from '../../../lib/sniper-audit-store';

export const dynamic='force-dynamic';
export const runtime='nodejs';
let lastGoodGold:any=null,lastGoodBitcoin:any=null;

// One slow venue must not hold the other asset's completed candles hostage.
// Provider fetches keep their own bounded retries/cache; this response has a
// separate 14s budget, below the browser's 18s limit, so a slow but valid
// provider reply (9-12s) is not spuriously declared HTTP 503.
async function boundedFeed(work:Promise<unknown>){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('CHART_FEED_TIMEOUT')),14000);
  })]);}finally{if(timer)clearTimeout(timer);}
}

// This endpoint is intentionally independent from /api/ai-analysis and
// /api/ai-snapshot. An inference timeout must not leave the chart empty.
export async function GET(request:Request){
  const now=Date.now();
  const goldOnly=new URL(request.url).searchParams.get('asset')==='GOLD';
  const requests=goldOnly?[getMarketData(),Promise.resolve(null)]:[getMarketData(),getBtcMarket()];
  const [goldResult,btcResult]=await Promise.allSettled(requests.map(boundedFeed));
  const checkedAt=Date.now();
  const g=goldResult.status==='fulfilled'?chartAssetFromMarket(goldResult.value,checkedAt):null;
  const b=btcResult.status==='fulfilled'?chartAssetFromMarket(btcResult.value,checkedAt):null;
  const goldLive=Boolean(g?.fresh&&historicalChartAsset('gold',g,checkedAt));
  const bitcoinLive=Boolean(b?.fresh&&historicalChartAsset('bitcoin',b,checkedAt));
  if(goldLive)lastGoodGold=g;
  if(bitcoinLive)lastGoodBitcoin=b;
  const gold=goldLive?g:historicalChartAsset('gold',lastGoodGold,checkedAt);
  const bitcoin=bitcoinLive?b:historicalChartAsset('bitcoin',lastGoodBitcoin,checkedAt);
  const structuralAudit=goldLive||bitcoinLive?updateStructuralWatchFromChart({
    gold:goldLive?gold:null,bitcoin:bitcoinLive?bitcoin:null
  },checkedAt):null;
  const ok=Boolean(gold?.chartCandles.length||bitcoin?.chartCandles.length);
  return Response.json({ok,checkedAt,startedAt:now,gold,bitcoin,structuralAudit,
    liveReady:{gold:goldLive,bitcoin:bitcoinLive},
    ...(ok?{}:{message:'لا توجد شموع تاريخية موثوقة من مزودي السوق حاليًا'})},
    {status:ok?200:503,headers:{'Cache-Control':'private, no-store'}});
}
