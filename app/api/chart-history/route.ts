import {getMarketData} from '../../../lib/market-hub';
import {getBtcMarket} from '../../../lib/btc-market';
import {chartAssetFromMarket} from '../../../lib/chart-history';
import {updateStructuralWatchFromChart} from '../../../lib/sniper-audit-store';

export const dynamic='force-dynamic';
export const runtime='nodejs';

// This endpoint is intentionally independent from /api/ai-analysis and
// /api/ai-snapshot. An inference timeout must not leave the chart empty.
export async function GET(){
  const now=Date.now();
  const [goldResult,btcResult]=await Promise.allSettled([
    getMarketData(),getBtcMarket()
  ]);
  const gold=goldResult.status==='fulfilled'?chartAssetFromMarket(goldResult.value,Date.now()):null;
  const bitcoin=btcResult.status==='fulfilled'?chartAssetFromMarket(btcResult.value,Date.now()):null;
  const ok=Boolean(gold?.chartCandles.length||bitcoin?.chartCandles.length);
  const checkedAt=Date.now();
  const structuralAudit=ok?updateStructuralWatchFromChart({gold,bitcoin},checkedAt):null;
  return Response.json({ok,checkedAt,startedAt:now,gold,bitcoin,structuralAudit,
    ...(ok?{}:{message:'لا توجد شموع تاريخية موثوقة من مزودي السوق حاليًا'})},
    {status:ok?200:503,headers:{'Cache-Control':'private, no-store'}});
}
