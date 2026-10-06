import {getMt5FastSignal} from '../../../lib/market-hub';
import {getBtcLiquidity} from '../../../lib/liquidity-intelligence';
import {updateBtcMarketLead,updateGoldMarketLead} from '../../../lib/market-lead-ai';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const now=Date.now(),asset=String(new URL(request.url).searchParams.get('asset')||'GOLD').toUpperCase();
  if(asset==='BTC'){
    const liq=await getBtcLiquidity().catch(()=>null);
    return Response.json(updateBtcMarketLead(liq,now),{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
  }
  return Response.json(updateGoldMarketLead(getMt5FastSignal(now),now),{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
}
