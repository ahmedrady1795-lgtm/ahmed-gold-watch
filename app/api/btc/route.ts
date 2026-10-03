import {getRuntimeEnv} from '../../../lib/runtime';
export const dynamic='force-dynamic';

async function json(url:string){
  const r=await fetch(url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});
  const j=await r.json();
  if(!r.ok)throw new Error('HTTP '+r.status);
  return j;
}
export async function GET(){
  const now=Date.now();
  try{
    const j=await json('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const price=Number(j?.data?.amount);
    if(!Number.isFinite(price)||price<=0)throw new Error('bad coinbase price');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'Coinbase',sourceTime:now,status:'live'},{headers:{'Cache-Control':'public, s-maxage=3, stale-while-revalidate=10'}});
  }catch{}
  try{
    const j=await json('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const price=Number(j?.bitcoin?.usd);
    if(!Number.isFinite(price)||price<=0)throw new Error('bad coingecko price');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'CoinGecko',sourceTime:now,status:'live'},{headers:{'Cache-Control':'public, s-maxage=5, stale-while-revalidate=15'}});
  }catch{}
  try{
    const j=await json('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const price=Number(j?.price);
    if(!Number.isFinite(price)||price<=0)throw new Error('bad binance price');
    return Response.json({ok:true,symbol:'BTC/USDT',price,source:'Binance REST',sourceTime:now,status:'live'},{headers:{'Cache-Control':'public, s-maxage=3, stale-while-revalidate=10'}});
  }catch{}
  return Response.json({ok:false,message:'BTC sources unavailable',sourceTime:now},{status:502,headers:{'Cache-Control':'no-store'}});
}
