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
  // Coinbase Spot gives no exchange event timestamp. Do not claim LIVE.
  return {price,source:'Coinbase Spot · time unknown',sourceTime:null,status:'unknown'};
}
async function krakenTrades(now:number):Promise<BtcQuote>{
  // Unlike Kraken Ticker, public Trades includes the actual exchange trade time.
  const j=await json('https://api.kraken.com/0/public/Trades?pair=XBTUSD&count=1',2200);
  const rows=Object.values(j?.result||{}).find(v=>Array.isArray(v)) as any[]|undefined;
  const trade=rows?.at(-1),price=Number(trade?.[0]),at=Math.floor(Number(trade?.[2])*1000);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at<=0||at>now+2000)
    throw new Error('bad Kraken trade or timestamp');
  return {price,source:'Kraken XBT/USD Trades',sourceTime:at,
    status:now-at<=15000?'live':'delayed'};
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
  const now=Date.now(),requested=new URL(request.url).searchParams.get('source');
  const strictCoinbase=requested==='coinbase';
  const errors:string[]=[];
  // A Kraken chart must not display a Coinbase real-time bar as if it were
  // the same OHLC venue. Only genuine timestamped Kraken trades qualify.
  if(requested==='kraken'){
    try{return ok(await krakenTrades(now),now);}
    catch{return Response.json({ok:false,status:'unavailable',message:'Kraken timed trades unavailable; keep LIVE disabled'},
      {status:503,headers:{'Cache-Control':'no-store'}});}
  }
  // Prefer timestamped EXCHANGE prices; Spot/Ticker may report a numeric
  // value but without a source event time, which cannot be labeled LIVE.
  const primary=coinbaseExchange(now).catch(e=>{
    errors.push('Coinbase Exchange '+String(e instanceof Error?e.message:e));return null;
  });
  const spot=coinbaseSpot().catch(e=>{
    errors.push('Coinbase Spot '+String(e instanceof Error?e.message:e));return null;
  });
  const fallback=strictCoinbase?Promise.resolve(null):
    Promise.any([krakenTrades(now),coingecko()]).catch(e=>{
      errors.push('Timestamped fallback '+String(e instanceof Error?e.message:e));return null;
    });
  const primaryFast=await Promise.race([
    primary,new Promise<null>(resolve=>setTimeout(()=>resolve(null),950))
  ]);
  if(primaryFast)return ok(primaryFast,now,false);
  if(strictCoinbase){
    const latePrimary=await primary;
    if(latePrimary)return ok(latePrimary,now,false);
  }else{
    const dated=await Promise.any([
      primary.then(q=>q||Promise.reject(new Error('Coinbase unavailable'))),
      fallback.then(q=>q||Promise.reject(new Error('Fallback unavailable')))
    ]).catch(()=>null);
    if(dated)return ok(dated,now,!/^Coinbase/.test(dated.source));
  }
  const unverifiedSpot=await spot;
  if(unverifiedSpot)return ok(unverifiedSpot,now,true);

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
