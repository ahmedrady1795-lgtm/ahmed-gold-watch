import {getMt5FastSignal} from '../../../lib/market-hub';
import {getBtcLiquidity} from '../../../lib/liquidity-intelligence';
import {updateBtcMarketLead,updateGoldMarketLead} from '../../../lib/market-lead-ai';
import {getServerTickSignal,startServerTickBrain} from '../../../lib/server-tick-brain';
export const dynamic='force-dynamic';
startServerTickBrain();
export async function GET(request:Request){
  const now=Date.now(),asset=String(new URL(request.url).searchParams.get('asset')||'GOLD').toUpperCase();
  if(asset==='BTC'){
    const liq=await getBtcLiquidity().catch(()=>null);
    return Response.json(updateBtcMarketLead(liq,now),{headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
  }
  const fast=getMt5FastSignal(now);
  const serverWave=getServerTickSignal('GOLD',now);
  return Response.json(updateGoldMarketLead(fast,now,serverWave),{headers:{'Cache-Control':'no-store, no-cache, must-revalidate','X-Gold-Lead-Source':fast?.ok?'mt5':'server-tick'}});
}
