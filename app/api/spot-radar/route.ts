import {parseKlines,parseBook,scoreCoin,type Candidate} from '../../../lib/spot-radar';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const BASE='https://data-api.binance.vision';
const CACHE_MS=90000;
type Ticker={symbol:string;quoteVolume:string;priceChangePercent:string;count?:number};
type SymbolInfo={symbol:string;status:string;quoteAsset:string;isSpotTradingAllowed?:boolean;permissions?:string[]};
let validSymbols:{time:number;set:Set<string>}|null=null;
let lastGood:{time:number;value:RadarResult}|null=null;
let pending:Promise<RadarResult>|null=null;
type RadarResult={ok:true;source:string;asOf:number;universe:number;scanned:number;depthChecked:number;
  candidates:Candidate[];method:string;warning:string};

async function getJson(path:string,timeoutMs=6800):Promise<unknown>{
  const r=await fetch(BASE+path,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
    headers:{Accept:'application/json'}});
  if(!r.ok){if(r.status===429||r.status===418)throw Error('Binance rate limited: '+r.status);
    throw Error('Binance market feed HTTP '+r.status);}
  return r.json();
}
async function symbols():Promise<Set<string>>{
  if(validSymbols&&Date.now()-validSymbols.time<1800000)return validSymbols.set;
  const info=await getJson('/api/v3/exchangeInfo',8000) as {symbols?:SymbolInfo[]};
  if(!Array.isArray(info.symbols))throw Error('Binance exchangeInfo missing symbols');
  const set=new Set(info.symbols.filter(s=>
    s.status==='TRADING'&&s.quoteAsset==='USDT'&&s.symbol.endsWith('USDT')&&
    s.isSpotTradingAllowed!==false&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(s.symbol)&&
    (!s.permissions?.length||s.permissions.includes('SPOT'))
  ).map(s=>s.symbol));
  if(!set.size)throw Error('No Binance Spot markets available');
  validSymbols={time:Date.now(),set};
  return set;
}
function pick(tickers:Ticker[],allowed:Set<string>):Ticker[]{
  const stables=new Set(['USDC','FDUSD','TUSD','DAI','USDE','EUR','EURI','AEUR','USTC','PYUSD']);
  const eligible=tickers.filter(t=>allowed.has(t.symbol)&&
    !stables.has(t.symbol.replace(/USDT$/,''))&&
    Number.isFinite(+t.quoteVolume)&&Number.isFinite(+t.priceChangePercent)&&
    +t.quoteVolume>=1500000&&+t.priceChangePercent>=-9&&+t.priceChangePercent<=22);
  const high=[...eligible].sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,9);
  const middle=eligible.filter(t=>+t.quoteVolume<=120000000&&+t.quoteVolume>=2000000&&
    +t.priceChangePercent>=-5&&+t.priceChangePercent<=6)
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,15);
  const emerging=eligible.filter(t=>+t.quoteVolume<250000000&&
    +t.priceChangePercent>=0&&+t.priceChangePercent<=12)
    .sort((a,b)=>(+b.priceChangePercent)-(+a.priceChangePercent)).slice(0,18);
  return Array.from(new Map([...high,...middle,...emerging].map(t=>[t.symbol,t])).values()).slice(0,40);
}
async function batched<T,R>(items:T[],size:number,task:(item:T)=>Promise<R|null>):Promise<R[]>{
  const out:R[]=[];
  for(let i=0;i<items.length;i+=size){
    const batch=await Promise.allSettled(items.slice(i,i+size).map(task));
    for(const result of batch)if(result.status==='fulfilled'&&result.value!==null)out.push(result.value);
  }
  return out;
}
async function scan():Promise<RadarResult>{
  const [allowed,rawTickers]=await Promise.all([symbols(),getJson('/api/v3/ticker/24hr',8500)]);
  if(!Array.isArray(rawTickers))throw Error('Binance ticker returned no market list');
  const chosen=pick(rawTickers as Ticker[],allowed);
  if(!chosen.length)throw Error('No eligible Spot pairs');
  const btcBars=parseKlines(await getJson('/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=65').catch(()=>null));
  const btc15m=btcBars.length>=17&&Date.now()-btcBars.at(-1)!.time<=210000
    ?(btcBars.at(-1)!.close/btcBars.at(-16)!.close-1)*100:null;
  const initial=await batched(chosen,8,async t=>{
    try{
      const raw=await getJson('/api/v3/klines?symbol='+encodeURIComponent(t.symbol)+'&interval=1m&limit=75');
      const c=scoreCoin(t.symbol,+t.priceChangePercent,+t.quoteVolume,
        parseKlines(raw),btc15m,null);
      return c;
    }catch{return null;}
  });
  if(!initial.length)throw Error('No fresh, complete Binance 1m candles; cannot rank');
  const shortlist=initial.sort((a,b)=>b.score-a.score).slice(0,17);
  let depthChecked=0;
  const detailed=await batched(shortlist,6,async item=>{
    try{
      const raw=await getJson('/api/v3/depth?symbol='+encodeURIComponent(item.symbol)+'&limit=100');
      const book=parseBook(raw,item.price);
      if(book)depthChecked++;
      return scoreCoin(item.symbol,item.change24h,item.volume24h,
        // Preserve the original candle history and do not manufacture trades.
        initial.find(x=>x.symbol===item.symbol)!.candles,btc15m,book);
    }catch{return item;}
  });
  // The detail stage may fail independently; those rows visibly lack depth confirmation.
  const candidates=detailed.filter((x):x is Candidate=>x!==null)
    .sort((a,b)=>b.score-a.score).slice(0,12);
  if(!candidates.length)throw Error('Insufficient fresh Spot evidence');
  return {ok:true,source:'Binance public Spot · closed 1m candles + depth',
    asOf:Date.now(),universe:allowed.size,scanned:initial.length,depthChecked,
    candidates,method:'24h universe → 1m trading volume → taker-buy flow → BTC relative strength → top-of-book snapshot',
    warning:'Watchlist score is NOT a win probability. Visible bids can vanish; an orderbook snapshot does not reveal secret orders. No execution or API keys.'};
}
export async function GET(){
  const now=Date.now();
  if(lastGood&&now-lastGood.time<CACHE_MS)return Response.json({...lastGood.value,
    cacheAgeMs:now-lastGood.time},{headers:{'Cache-Control':'no-store'}});
  if(!pending)pending=scan().finally(()=>{pending=null;});
  try{
    const value=await pending;
    lastGood={time:Date.now(),value};
    return Response.json({...value,cacheAgeMs:0},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({ok:false,status:'unavailable',asOf:now,
      message:'تعذر إثبات مرشحي Spot من بيانات Binance الحالية',
      detail:String(error instanceof Error?error.message:error).slice(0,180)},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
