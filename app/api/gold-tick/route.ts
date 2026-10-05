import {getMt5BridgeStatus,getMt5FastSignal,getQuoteData} from '../../../lib/market-hub';

export const dynamic='force-dynamic';

export async function GET(){
  const now=Date.now(),bridge=getMt5BridgeStatus(now),fast=getMt5FastSignal(now),s=bridge.status;

  if(bridge.fresh&&s){
    const price=s.last&&s.last>0?s.last:(s.bid+s.ask)/2;
    return Response.json({
      ok:true,
      symbol:'XAU/USD',
      price,
      bid:s.bid,
      ask:s.ask,
      spread:s.ask-s.bid,
      sourceTime:s.tickTimeMs,
      receivedAt:s.receivedAt,
      ageMs:Math.max(0,now-s.receivedAt),
      status:'live',
      mode:'broker',
      source:'Exness/MT5',
      brokerSymbol:s.symbol,
      fast
    },{headers:{
      'Cache-Control':'no-store, no-cache, must-revalidate',
      'X-Gold-Tick':'mt5'
    }});
  }

  try{
    const q=await getQuoteData({forceExternal:true});
    const sourceTime=Number(q.sourceTime)||Number(q.fetchedAt)||now;
    const ageMs=Math.max(0,now-sourceTime);
    return Response.json({
      ok:true,
      symbol:'XAU/USD',
      price:q.price,
      bid:q.bid,
      ask:q.ask,
      spread:q.spread,
      sourceTime,
      providerSourceTime:q.sourceTime,
      receivedAt:q.fetchedAt,
      ageMs,
      status:q.status,
      mode:'external',
      source:q.source,
      brokerSymbol:null,
      fast
    },{headers:{
      'Cache-Control':'no-store, no-cache, must-revalidate',
      'X-Gold-Tick':'external'
    }});
  }catch(e){
    return Response.json({
      ok:false,
      status:'offline',
      checkedAt:now,
      message:e instanceof Error?e.message:'gold source unavailable'
    },{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
