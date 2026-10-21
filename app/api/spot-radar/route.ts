import {parseKlines,parseBook,scoreCoin,type Candidate} from '../../../lib/spot-radar';

export const dynamic='force-dynamic';
export const runtime='nodejs';
// Binance provides multiple official market-data gateways. Probe before a
// large scan; a blocked/cloud-routed endpoint should not stop all discovery.
const HOSTS=[
  'https://data-api.binance.vision',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api.binance.com'
];
const CACHE_MS=90000;
let selectedHost:{name:string;at:number}|null=null;
let selectPromise:Promise<string>|null=null;
const recentProblems:string[]=[];
function problem(msg:string){
  recentProblems.push(msg.slice(0,190));
  if(recentProblems.length>10)recentProblems.shift();
}
async function chooseHost():Promise<string>{
  if(selectedHost&&Date.now()-selectedHost.at<300000)return selectedHost.name;
  if(selectPromise)return selectPromise;
  selectPromise=(async()=>{
    const checks=await Promise.allSettled(HOSTS.map(async host=>{
      const r=await fetch(host+'/api/v3/time',{cache:'no-store',signal:AbortSignal.timeout(4200)});
      if(!r.ok)throw Error(host+' HTTP '+r.status);
      const j=await r.json();
      if(!Number.isFinite(Number(j?.serverTime))||Math.abs(Date.now()-Number(j.serverTime))>120000)
        throw Error(host+' unverified exchange clock');
      return host;
    }));
    const winner=checks.find(x=>x.status==='fulfilled');
    if(winner&&winner.status==='fulfilled'){
      selectedHost={name:winner.value,at:Date.now()};
      return winner.value;
    }
    for(const item of checks)if(item.status==='rejected')problem(String(item.reason));
    throw Error('Binance official gateways unreachable: '+recentProblems.slice(-4).join(' | '));
  })().finally(()=>{selectPromise=null;});
  return selectPromise;
}
type Ticker={symbol:string;quoteVolume:string;priceChangePercent:string;count?:number};
type SymbolInfo={symbol:string;status:string;quoteAsset:string;isSpotTradingAllowed?:boolean;permissions?:string[]};
let validSymbols:{time:number;set:Set<string>}|null=null;
let lastGood:{time:number;value:RadarResult}|null=null;
let pending:Promise<RadarResult>|null=null;
type RadarResult={ok:true;source:string;asOf:number;universe:number;scanned:number;depthChecked:number;
  candidates:Candidate[];method:string;warning:string};

async function getJson(path:string,timeoutMs=6800):Promise<unknown>{
  const first=await chooseHost();
  const candidates=[first,...HOSTS.filter(h=>h!==first)].slice(0,2);
  let previousError='';
  for(const host of candidates){
    try{
      const r=await fetch(host+path,{cache:'no-store',
        signal:AbortSignal.timeout(Math.min(13000,timeoutMs+2000)),
        headers:{Accept:'application/json'}});
      if(r.status===429||r.status===418){
        problem(host+' rate limited '+r.status+' '+path.split('?')[0]);
        throw Error('Binance rate limited: '+r.status);
      }
      if(!r.ok)throw Error('HTTP '+r.status);
      const j=await r.json();
      if(j===null||j===undefined)throw Error('Empty JSON');
      selectedHost={name:host,at:Date.now()};
      return j;
    }catch(e){
      previousError=String(e instanceof Error?e.message:e).slice(0,120);
      problem(host+' '+path.split('?')[0]+' '+previousError);
      // Treat rate limiting as a throttle: retrying all gateways just piles
      // requests on the same exchange IP budget.
      if(previousError.includes('rate limited'))break;
      if(selectedHost?.name===host)selectedHost=null;
    }
  }
  throw Error(path.split('?')[0]+': '+previousError);
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
  // Rotate one part of the long-tail each 5 minutes: a fixed 24h leader list
  // misses quieter mid-caps that begin accumulating before the daily movers.
  const stables=new Set(['USDC','FDUSD','TUSD','DAI','USDE','EUR','EURI','AEUR',
    'USTC','PYUSD','USDD','USDP','USDS','USD1','RLUSD','EURC','XUSD']);
  const eligible=tickers.filter(t=>allowed.has(t.symbol)&&
    !stables.has(t.symbol.replace(/USDT$/,''))&&
    Number.isFinite(+t.quoteVolume)&&Number.isFinite(+t.priceChangePercent)&&
    +t.quoteVolume>=1500000&&+t.priceChangePercent>=-9&&+t.priceChangePercent<=22);
  const high=[...eligible].sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,12);
  const middle=eligible.filter(t=>+t.quoteVolume<=120000000&&+t.quoteVolume>=2000000&&
    +t.priceChangePercent>=-5&&+t.priceChangePercent<=6)
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,20);
  const trending=eligible.filter(t=>+t.quoteVolume<250000000&&
    +t.priceChangePercent>=0&&+t.priceChangePercent<=12)
    .sort((a,b)=>+b.priceChangePercent-+a.priceChangePercent).slice(0,14);
  const quiet=eligible.filter(t=>+t.quoteVolume>=1800000&&+t.quoteVolume<=70000000&&
    +t.priceChangePercent>=-3&&+t.priceChangePercent<=5)
    .sort((a,b)=>a.symbol.localeCompare(b.symbol));
  const window=Math.floor(Date.now()/300000),rotated=quiet.length
    ?[...quiet.slice(window%quiet.length),...quiet.slice(0,window%quiet.length)].slice(0,22):[];
  return Array.from(new Map([...high,...middle,...rotated,...trending].map(t=>[t.symbol,t])).values()).slice(0,64);
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
      const raw=await getJson('/api/v3/klines?symbol='+encodeURIComponent(t.symbol)+'&interval=1m&limit=75',4000);
      const c=scoreCoin(t.symbol,+t.priceChangePercent,+t.quoteVolume,
        parseKlines(raw),btc15m,null);
      return c;
    }catch(e){problem(t.symbol+' kline '+String(e instanceof Error?e.message:e));return null;}
  });
  if(!initial.length)throw Error('No qualified fresh Spot candles from '+chosen.length+
    ' pairs; '+recentProblems.slice(-3).join(' | '));
  const shortlist=initial.sort((a,b)=>b.score-a.score).slice(0,17);
  let depthChecked=0;
  const detailed=await batched(shortlist,6,async item=>{
    try{
      const raw=await getJson('/api/v3/depth?symbol='+encodeURIComponent(item.symbol)+'&limit=100',3500);
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
      detail:String(error instanceof Error?error.message:error).slice(0,650),
      failedStage:recentProblems.slice(-5),
      gateway:selectedHost?.name??'unavailable'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
