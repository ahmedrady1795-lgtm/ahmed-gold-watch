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
    const j=await json('https://api.exchange.coinbase.com/products/BTC-USD/ticker');
    const price=Number(j?.price),at=Date.parse(j?.time);
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at>now+10000)throw new Error('bad coinbase price');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'Coinbase',sourceTime:at,status:now-at<15000?'live':'delayed'},{headers:{'Cache-Control':'no-store'}});
  }catch{}
  try{
    const j=await json('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true');
    const price=Number(j?.bitcoin?.usd);
    if(!Number.isFinite(price)||price<=0)throw new Error('bad coingecko price');
    const at=Number(j?.bitcoin?.last_updated_at)*1000;if(!Number.isFinite(at)||at<=0||at>now+10000)throw new Error('missing timestamp');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'CoinGecko',sourceTime:at,status:now-at<15000?'live':'delayed'},{headers:{'Cache-Control':'no-store'}});
  }catch{}
  try{
    const j=await json('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const price=Number(j?.price);
    if(!Number.isFinite(price)||price<=0)throw new Error('bad binance price');
    return Response.json({ok:true,symbol:'BTC/USDT',price,source:'Binance REST',sourceTime:null,status:'unknown'},{headers:{'Cache-Control':'no-store'}});
  }catch{}
  return Response.json({ok:false,message:'BTC sources unavailable',sourceTime:now},{status:502,headers:{'Cache-Control':'no-store'}});
}
