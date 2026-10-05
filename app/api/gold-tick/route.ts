import {getMt5BridgeStatus,getMt5FastSignal} from '../../../lib/market-hub';
export const dynamic='force-dynamic';
export async function GET(){
  const now=Date.now(),bridge=getMt5BridgeStatus(now),fast=getMt5FastSignal(now),s=bridge.status;
  if(!bridge.fresh||!s)return Response.json({ok:false,status:'offline',checkedAt:now},{status:503,headers:{'Cache-Control':'no-store'}});
  const price=s.last&&s.last>0?s.last:(s.bid+s.ask)/2;
  return Response.json({ok:true,symbol:'XAU/USD',price,bid:s.bid,ask:s.ask,spread:s.ask-s.bid,sourceTime:s.tickTimeMs,receivedAt:s.receivedAt,ageMs:Math.max(0,now-s.receivedAt),source:'Exness/MT5',brokerSymbol:s.symbol,fast},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate','X-Gold-Tick':'mt5'}});
}