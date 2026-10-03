export const dynamic='force-dynamic';

async function json(url:string){
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(6000),headers:{'User-Agent':'AhmedGoldCommand/1.0','Accept':'application/json'}});
  const j=await r.json();
  if(!r.ok)throw new Error('HTTP '+r.status);
  return j;
}
export async function GET(request:Request){
  const now=Date.now(),errors:string[]=[],strictCoinbase=new URL(request.url).searchParams.get('source')==='coinbase';
  try{
    const j=await json('https://api.exchange.coinbase.com/products/BTC-USD/ticker');
    const price=Number(j?.price),at=Date.parse(j?.time);
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at>now+10000)throw new Error('bad Coinbase Exchange price');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'Coinbase Exchange',sourceTime:at,fetchedAt:now,status:now-at<15000?'live':'delayed'},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0'}});
  }catch(e){errors.push('Coinbase Exchange '+(e instanceof Error?e.message:'failed'));}
  try{
    const j=await json('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const price=Number(j?.data?.amount);
    if(!Number.isFinite(price)||price<=0)throw new Error('bad Coinbase Spot price');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'Coinbase Spot',sourceTime:null,fetchedAt:now,status:'live'},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0'}});
  }catch(e){errors.push('Coinbase Spot '+(e instanceof Error?e.message:'failed'));}
  if(strictCoinbase)return Response.json({ok:false,message:'Coinbase unavailable',detail:errors.join(' | ').slice(0,320),fetchedAt:now},{status:502,headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0'}});
  try{
    const j=await json('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true');
    const price=Number(j?.bitcoin?.usd),at=Number(j?.bitcoin?.last_updated_at)*1000;
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at<=0)throw new Error('bad CoinGecko price');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'CoinGecko fallback',sourceTime:at,fetchedAt:now,status:'delayed'},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0'}});
  }catch(e){errors.push('CoinGecko '+(e instanceof Error?e.message:'failed'));}
  try{
    const j=await json('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
    const row=Object.values(j?.result||{})[0] as any,price=Number(row?.c?.[0]);
    if(!Number.isFinite(price)||price<=0)throw new Error('bad Kraken price');
    return Response.json({ok:true,symbol:'BTC/USD',price,source:'Kraken fallback',sourceTime:null,fetchedAt:now,status:'unknown'},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0'}});
  }catch(e){errors.push('Kraken '+(e instanceof Error?e.message:'failed'));}
  return Response.json({ok:false,message:'BTC sources unavailable',detail:errors.join(' | ').slice(0,420),fetchedAt:now},{status:502,headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0'}});
}
