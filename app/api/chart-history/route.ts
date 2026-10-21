import {getMarketData} from '../../../lib/market-hub';
import {getBtcMarket} from '../../../lib/btc-market';
import {chartAssetFromMarket} from '../../../lib/chart-history';
import {updateStructuralWatchFromChart} from '../../../lib/sniper-audit-store';

export const dynamic='force-dynamic';
export const runtime='nodejs';

// One slow venue must not hold the other asset's completed candles hostage.
// Provider fetches keep their own bounded retries/cache; this response has a
// separate budget so GOLD can render while BTC warms in the background.
async function boundedFeed(work:Promise<unknown>){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('CHART_FEED_TIMEOUT')),8000);
  })]);}finally{if(timer)clearTimeout(timer);}
}

// This endpoint is intentionally independent from /api/ai-analysis and
// /api/ai-snapshot. An inference timeout must not leave the chart empty.
export async function GET(request:Request){
  const now=Date.now();
  const goldOnly=new URL(request.url).searchParams.get('asset')==='GOLD';
  const requests=goldOnly?[getMarketData(),Promise.resolve(null)]:[getMarketData(),getBtcMarket()];
  const [goldResult,btcResult]=await Promise.allSettled(requests.map(boundedFeed));
  const gold=goldResult.status==='fulfilled'?chartAssetFromMarket(goldResult.value,Date.now()):null;
  const bitcoin=btcResult.status==='fulfilled'?chartAssetFromMarket(btcResult.value,Date.now()):null;
  const ok=Boolean(gold?.chartCandles.length||bitcoin?.chartCandles.length);
  const checkedAt=Date.now();
  const structuralAudit=ok?updateStructuralWatchFromChart({gold,bitcoin},checkedAt):null;
  return Response.json({ok,checkedAt,startedAt:now,gold,bitcoin,structuralAudit,
    ...(ok?{}:{message:'لا توجد شموع تاريخية موثوقة من مزودي السوق حاليًا'})},
    {status:ok?200:503,headers:{'Cache-Control':'private, no-store'}});
}
