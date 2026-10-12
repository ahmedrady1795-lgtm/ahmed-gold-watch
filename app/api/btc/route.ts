export const dynamic='force-dynamic';

type BtcQuote={price:number;source:string;sourceTime:number|null;status:'live'|'delayed'|'unknown'};
let lastGood:{at:number;quote:BtcQuote}|null=null;

async function json(url:string,timeoutMs=2200){
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs),headers:{'User-Agent':'AhmedGoldCommand/1.0','Accept':'application/json'}});
  const j=await r.json();
  if(!r.ok)throw new Error('HTTP '+r.status);
  return j;
}
async function coinbaseExchange(now:number):Promise<BtcQuote>{
  const j=await json('https://api.exchange.coinbase.com/products/BTC-USD/ticker',1800);
  const price=Number(j?.price),at=Date.parse(j?.time);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at>now+10000)throw new Error('bad Coinbase Exchange price');
  return {price,source:'Coinbase Exchange',sourceTime:at,status:now-at<15000?'live':'delayed'};
}
async function coinbaseSpot():Promise<BtcQuote>{
  const j=await json('https://api.coinbase.com/v2/prices/BTC-USD/spot',1800);
  const price=Number(j?.data?.amount);
  if(!Number.isFinite(price)||price<=0)throw new Error('bad Coinbase Spot price');
  return {price,source:'Coinbase Spot',sourceTime:null,status:'live'};
}
async function kraken():Promise<BtcQuote>{
  const j=await json('https://api.kraken.com/0/public/Ticker?pair=XBTUSD',2200);
  const row=Object.values(j?.result||{})[0] as any,price=Number(row?.c?.[0]);
  if(!Number.isFinite(price)||price<=0)throw new Error('bad Kraken price');
  return {price,source:'Kraken fallback',sourceTime:null,status:'unknown'};
}
async function coingecko():Promise<BtcQuote>{
  const j=await json('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true',2500);
  const price=Number(j?.bitcoin?.usd),at=Number(j?.bitcoin?.last_updated_at)*1000;
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at<=0)throw new Error('bad CoinGecko price');
  return {price,source:'CoinGecko fallback',sourceTime:at,status:'delayed'};
}
function ok(quote:BtcQuote,now:number,degraded=false){
  lastGood={at:now,quote};
  return Response.json({ok:true,symbol:'BTC/USD',...quote,fetchedAt:now,degraded},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0'}});
}
export async function GET(request:Request){
  const now=Date.now(),strictCoinbase=new URL(request.url).searchParams.get('source')==='coinbase';
  const errors:string[]=[];
  const primary=Promise.any([
    coinbaseExchange(now),
    coinbaseSpot()
  ]).catch(e=>{errors.push('Coinbase '+String(e instanceof Error?e.message:e));return null;});
  const fallback=strictCoinbase
    ?Promise.resolve(null)
    :Promise.any([
      kraken(),
      coingecko()
    ]).catch(e=>{errors.push('Fallback '+String(e instanceof Error?e.message:e));return null;});

  // Coinbase is the preferred scalp feed. Give it a short exclusive window;
  // fallback requests are already in flight, so a Coinbase miss does not add another network round-trip.
  const primaryFast=await Promise.race([
    primary,
    new Promise<null>(resolve=>setTimeout(()=>resolve(null),700))
  ]);
  if(primaryFast)return ok(primaryFast,now,false);

  if(strictCoinbase){
    const latePrimary=await primary;
    if(latePrimary)return ok(latePrimary,now,false);
  }else{
    const nextValid=await Promise.any([
      primary.then(q=>q?{quote:q,degraded:false}:Promise.reject(new Error('primary unavailable'))),
      fallback.then(q=>q?{quote:q,degraded:true}:Promise.reject(new Error('fallback unavailable')))
    ]).catch(()=>null);
    if(nextValid)return ok(nextValid.quote,now,nextValid.degraded);
  }

  const cachedAllowed=lastGood&&now-lastGood.at<=8000&&(!strictCoinbase||/^Coinbase/.test(lastGood.quote.source));
  if(cachedAllowed&&lastGood){
    const ageMs=now-lastGood.at;
    return Response.json({
      ok:true,symbol:'BTC/USD',...lastGood.quote,
      source:lastGood.quote.source+' · cached failover',
      fetchedAt:now,
      status:'delayed',
      degraded:true,
      cacheAgeMs:ageMs,
      warning:'Live BTC providers missed this request; serving a very short last-good quote.'
    },{headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','X-BTC-Failover':'cache'}});
  }
  return Response.json({
    ok:false,
    message:strictCoinbase?'Coinbase unavailable':'BTC sources unavailable',
    detail:errors.join(' | ').slice(0,420),
    fetchedAt:now
  },{status:502,headers:{'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0'}});
}
