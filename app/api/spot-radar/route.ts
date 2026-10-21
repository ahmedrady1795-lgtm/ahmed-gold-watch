import {parseKlines,parseHourlyKlines,parseBook,scoreCoin,score24hOutlook,type Candidate} from '../../../lib/spot-radar';
import {largeTradeFootprint,futuresCrowding,blendEdge} from '../../../lib/spot-edge';
import {spotLiquiditySample,spotIgnition,type SpotLiquiditySample} from '../../../lib/spot-ignition';
import {rankSpotFastLane} from '../../../lib/spot-aggressive';
import {spotAccumulationPulse,accumulationSample,verifySpotAccumulation,
  type SpotAccumulationSample} from '../../../lib/spot-accumulation';
import {spotBackoffMs} from '../../../lib/binance-cooldown';
import {marketGroup,memeSpotSymbols,highUpsideFocus} from '../../../lib/spot-high-upside';
import {recordAndEvaluateSpot,type ForwardResult} from '../../../lib/spot-forward-audit';

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
let binanceBlockedUntil=0;
function binanceCooldown(res:Response):void{
  const ms=spotBackoffMs(res.status,res.headers.get('Retry-After'));
  if(ms>0){
    binanceBlockedUntil=Math.max(binanceBlockedUntil,Date.now()+ms);
    selectedHost=null;
    problem('Binance HTTP '+res.status+'; pause '+Math.ceil(ms/1000)+'s per Retry-After');
  }
}
function assertNotBanned():void{
  if(binanceBlockedUntil>Date.now())
    throw Error('Binance HTTP 418/429 IP cooldown; remaining '+
      Math.ceil((binanceBlockedUntil-Date.now())/1000)+'s');
}
let selectedHost:{name:string;at:number}|null=null;
let selectPromise:Promise<string>|null=null;
const recentProblems:string[]=[];
function problem(msg:string){
  recentProblems.push(msg.slice(0,190));
  if(recentProblems.length>10)recentProblems.shift();
}
async function chooseHost():Promise<string>{
  assertNotBanned();
  if(selectedHost&&Date.now()-selectedHost.at<300000)return selectedHost.name;
  if(selectPromise)return selectPromise;
  selectPromise=(async()=>{
    const checks=await Promise.allSettled(HOSTS.map(async host=>{
      const r=await fetch(host+'/api/v3/time',{cache:'no-store',signal:AbortSignal.timeout(4200)});
      if(r.status===418||r.status===429)binanceCooldown(r);
      if(!r.ok)throw Error(host+' HTTP '+r.status);
      const j=await r.json();
      if(!Number.isFinite(Number(j?.serverTime))||Math.abs(Date.now()-Number(j.serverTime))>120000)
        throw Error(host+' unverified exchange clock');
      return host;
    }));
    assertNotBanned();
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
// Fail closed after cold start: two separate scans are required.
const liquidityHistory=new Map<string,SpotLiquiditySample>();
const accumulationHistory=new Map<string,SpotAccumulationSample>();
type RadarResult={ok:true;source:string;asOf:number;universe:number;scanned:number;depthChecked:number;
  candidates:Candidate[];method:string;warning:string;forwardAudit?:ForwardResult};

async function getJson(path:string,timeoutMs=6800):Promise<unknown>{
  assertNotBanned();
  const first=await chooseHost();
  const candidates=[first,...HOSTS.filter(h=>h!==first)].slice(0,2);
  let previousError='';
  for(const host of candidates){
    assertNotBanned();
    try{
      const r=await fetch(host+path,{cache:'no-store',
        signal:AbortSignal.timeout(Math.min(13000,timeoutMs+2000)),
        headers:{Accept:'application/json'}});
      if(r.status===429||r.status===418){
        binanceCooldown(r);
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
const CORE_SYMBOLS=[
  ...memeSpotSymbols(), // verify live Spot before analyzing: no invented listings
  'SUIUSDT','NEARUSDT','APTUSDT','ARBUSDT','OPUSDT','SEIUSDT',
  'TIAUSDT','FILUSDT','FETUSDT','RENDERUSDT','INJUSDT',
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'
];
type PriceRow={symbol:string;price:string};
const stableBases=new Set(['USDC','FDUSD','TUSD','DAI','USDE','EUR','EURI',
  'AEUR','USDD','USDP','USDS','USD1','RLUSD','EURC','XUSD','USTC']);
let cachedNames:{at:number;names:string[]}|null=null;
async function discoverNames():Promise<{names:string[];universe:number}>{
  // Lightweight ticker/price is much smaller than the unbounded
  // exchangeInfo and ticker/24hr payloads that time out on Render.
  let all:string[]=cachedNames?.names||[];
  if(!all.length||Date.now()-(cachedNames?.at||0)>600000){
    try{
      const raw=await getJson('/api/v3/ticker/price',11500);
      if(!Array.isArray(raw))throw Error('Binance price universe not an array');
      all=(raw as PriceRow[]).map(x=>String(x?.symbol||'')).filter(x=>
        x.endsWith('USDT')&&!stableBases.has(x.slice(0,-4))&&
        !/(UP|DOWN|BULL|BEAR)USDT$/.test(x));
      if(!all.length)throw Error('No listed Spot/USDT prices');
      cachedNames={at:Date.now(),names:all};
    }catch(e){
      problem('Spot price universe: '+String(e instanceof Error?e.message:e));
      if(!all.length)all=[...CORE_SYMBOLS];
    }
  }
  const rotated=[...new Set(all)].sort();
  const windowIndex=Math.floor(Date.now()/180000); // every 3 minutes
  const positions=rotated.length?[
    windowIndex%rotated.length,
    (windowIndex*17)%rotated.length,
    (windowIndex*37)%rotated.length
  ]:[];
  const picked:string[]=[];
  for(const offset of positions)
    picked.push(...rotated.slice(offset,offset+24),...rotated.slice(0,Math.max(0,offset+24-rotated.length)));
  const known=new Set(rotated);
  const names=Array.from(new Set([...CORE_SYMBOLS.filter(x=>known.has(x)),...picked])).slice(0,95);
  return {names,universe:all.length};
}
const chunks=<T,>(a:T[],size:number)=>Array.from(
  {length:Math.ceil(a.length/size)},(_,i)=>a.slice(i*size,(i+1)*size));
async function metadataFor(names:string[]):Promise<Set<string>>{
  const rows=await batched(chunks(names,20),4,async chunk=>{
    try{
      const j=await getJson('/api/v3/exchangeInfo?symbols='+
        encodeURIComponent(JSON.stringify(chunk)),11500) as {symbols?:SymbolInfo[]};
      return Array.isArray(j?.symbols)?j.symbols:null;
    }catch(e){
      problem('Spot metadata batch: '+String(e instanceof Error?e.message:e));return null;
    }
  });
  const allowed=new Set(rows.flat().filter(s=>
    s.status==='TRADING'&&s.quoteAsset==='USDT'&&
    s.isSpotTradingAllowed!==false&&
    (!s.permissions?.length||s.permissions.includes('SPOT'))
  ).map(s=>s.symbol));
  if(!allowed.size)throw Error('Binance metadata mini-batches unavailable: '+
    recentProblems.slice(-2).join(' | '));
  return allowed;
}
async function tickersFor(names:string[]):Promise<Ticker[]>{
  const rows=await batched(chunks(names,20),4,async chunk=>{
    try{
      const j=await getJson('/api/v3/ticker/24hr?symbols='+
        encodeURIComponent(JSON.stringify(chunk)),11500);
      return Array.isArray(j)?j as Ticker[]:null;
    }catch(e){problem('Spot 24hr mini-batch: '+
      String(e instanceof Error?e.message:e));return null;}
  });
  const result=rows.flat();
  if(!result.length)throw Error('Binance 24hr mini-batches unavailable: '+
    recentProblems.slice(-2).join(' | '));
  return result;
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
  const memes=eligible.filter(t=>marketGroup(t.symbol)==='MEME')
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,28);
  const beta=eligible.filter(t=>marketGroup(t.symbol)==='HIGH_BETA'&&
    +t.quoteVolume>=1800000&&+t.quoteVolume<220000000)
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,16);
  const high=[...eligible].sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,8);
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
  return Array.from(new Map([...memes,...beta,...rotated,...trending,...middle,...high]
    .map(t=>[t.symbol,t])).values()).slice(0,64);
}
async function batched<T,R>(items:T[],size:number,task:(item:T)=>Promise<R|null>):Promise<R[]>{
  const out:R[]=[];
  for(let i=0;i<items.length;i+=size){
    const batch=await Promise.allSettled(items.slice(i,i+size).map(task));
    for(const result of batch)if(result.status==='fulfilled'&&result.value!==null)out.push(result.value);
  }
  return out;
}
// Futures endpoints are optional: no API key, no trade execution, and never
// return invented crowding when USD-M data is unavailable.
async function futuresPublic(path:string):Promise<unknown>{
  const origins=['https://fapi.binance.com','https://fapi1.binance.com'];
  let last='';
  for(const origin of origins){
    try{
      const r=await fetch(origin+path,{cache:'no-store',signal:AbortSignal.timeout(3900)});
      if(!r.ok)throw Error('HTTP '+r.status);
      return await r.json();
    }catch(e){last=String(e instanceof Error?e.message:e);}
  }
  problem('Futures optional: '+path.split('?')[0]+' '+last);
  return null;
}
async function scan():Promise<RadarResult>{
  const {names,universe}=await discoverNames();
  const [allowed,rawTickers]=await Promise.all([metadataFor(names),tickersFor(names)]);
  const chosen=pick(rawTickers,allowed);
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
  // Reserve dedicated analysis lanes for verified meme and high-beta markets.
  // This prevents BTC/ETH sized 24h volume from taking every analyst slot.
  const memeLane=[...initial].filter(c=>marketGroup(c.symbol)==='MEME'&&
    c.volume24h>=1500000&&!c.trapRisk)
    .sort((a,b)=>b.score-a.score).slice(0,14);
  const betaLane=[...initial].filter(c=>marketGroup(c.symbol)==='HIGH_BETA'&&
    c.volume24h>=1500000&&!c.trapRisk)
    .sort((a,b)=>b.score-a.score).slice(0,8);
  const byMomentum=[...initial].sort((a,b)=>b.score-a.score).slice(0,14);
  // Reserve slots for buyers accelerating over three DISJOINT five-minute
  // windows, instead of only ranking coins that have already pumped.
  const coiled=[...initial].filter(c=>spotAccumulationPulse(c).flowCandidate)
    .sort((a,b)=>spotAccumulationPulse(b).buyIntensity-
      spotAccumulationPulse(a).buyIntensity).slice(0,10);
  // Do not wait for 24h momentum when 1m executed flow has JUST started.
  const freshFlow=[...initial].filter(c=>!c.trapRisk&&c.buyShare>=.53&&
    c.volumeImpulse>=1.25&&c.flowDelta5m>1200&&c.change15m<3.5&&
    c.change24h<12).sort((a,b)=>b.flowDelta5m-a.flowDelta5m).slice(0,12);
  // A fixed "already-moving" list misses the first hour of new rotation.
  // Reserve eight slots for liquid, relatively quiet symbols before breakout.
  const quiet=[...initial].filter(c=>c.volume24h>=2_000_000&&
    c.change24h>=-3&&c.change24h<=5&&c.change15m<1.5&&!c.trapRisk)
    .sort((a,b)=>b.volumeImpulse-a.volumeImpulse).slice(0,12);
  const shortlist=Array.from(new Map([...coiled,...freshFlow,...memeLane,...betaLane,...quiet,...byMomentum]
    .map(c=>[c.symbol,c])).values()).slice(0,30);
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
  // Hourly history is required for a 24h ranking. Micro volume alone cannot
  // be represented as a next-day forecast.
  const btcHours=parseHourlyKlines(await getJson(
    '/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=75',7500).catch(()=>null));
  const btc24h=btcHours.length>=55?(
    btcHours.at(-1)!.close/btcHours.at(-25)!.close-1)*100:null;
  const candidatesWithHourly=await batched(
    detailed.filter((x):x is Candidate=>x!==null),6,async coin=>{
      try{
        const raw=await getJson('/api/v3/klines?symbol='+
          encodeURIComponent(coin.symbol)+'&interval=1h&limit=75',5500);
        const hourly=parseHourlyKlines(raw);
        const outlook=score24hOutlook(coin,hourly,btc24h);
        if(!outlook)return null;
        const highUpside=highUpsideFocus(coin,hourly);
        const accumulation=verifySpotAccumulation(
          coin,spotAccumulationPulse(coin),accumulationHistory.get(coin.symbol)||null);
        const outlook24h=rankSpotFastLane(coin,outlook,
          (highUpside?.boost??0)+accumulation.adjustment);
        if(highUpside?.boost)outlook24h.reason=[highUpside.reason,outlook24h.reason].join(' · ');
        if(accumulation.state==='BUY_BUILDUP'||accumulation.state==='BUY_PERSISTENT')
          outlook24h.reason=[accumulation.reason,outlook24h.reason].filter(Boolean).slice(0,2).join(' · ');
        if(accumulation.state==='BUY_ABSORBED')
          outlook24h.reason=[accumulation.reason,outlook24h.reason].filter(Boolean).slice(0,2).join(' · ');
        return {...coin,outlook24h,highUpside,accumulation};
      }catch(e){
        problem(coin.symbol+' 24h bars '+String(e instanceof Error?e.message:e));
        return null;
      }
    });
  if(!candidatesWithHourly.length)
    throw Error('No verified contiguous hourly history for 24h ranking');
  // Keep candidate selection based on historical Spot observations. Futures
  // readings and big-print tape can increase or veto rankings, but unavailable
  // auxiliary feeds cannot invent an edge. Only 10 best Spot setups are sampled.
  const eligible=candidatesWithHourly
    .filter(c=>c.outlook24h.state!=='AVOID')
    .sort((a,b)=>(b.outlook24h.rankScore+(b.outlook24h.fastLane?10:0)+(b.accumulation?.state==='BUY_PERSISTENT'?12:b.accumulation?.state==='BUY_BUILDUP'?6:0))-
      (a.outlook24h.rankScore+(a.outlook24h.fastLane?10:0)+(a.accumulation?.state==='BUY_PERSISTENT'?12:a.accumulation?.state==='BUY_BUILDUP'?6:0)));
  const examined=await batched(eligible.slice(0,12),4,async coin=>{
    const symbol=encodeURIComponent(coin.symbol);
    const [tapeRaw,oiRaw,premiumRaw]=await Promise.all([
      getJson('/api/v3/aggTrades?symbol='+symbol+'&limit=650',4100)
        .catch(e=>{problem(coin.symbol+' trade prints '+String(e));return null;}),
      futuresPublic('/futures/data/openInterestHist?symbol='+symbol+'&period=5m&limit=17'),
      futuresPublic('/fapi/v1/premiumIndex?symbol='+symbol)
    ]);
    const whale=largeTradeFootprint(tapeRaw);
    const leverage=futuresCrowding(oiRaw,premiumRaw);
    const edge=blendEdge(coin.outlook24h.rankScore,whale,leverage);
    const ignition=spotIgnition(coin,whale,liquidityHistory.get(coin.symbol)||null);
    const updatedScore=Math.max(0,Math.min(100,
      coin.outlook24h.rankScore+edge.adjustment+ignition.adjustment));
    const state=coin.outlook24h.hardVeto?'AVOID' as const:
      updatedScore>=63&&coin.outlook24h.takerBuyShare12>=.515&&
      coin.outlook24h.volumeRatio24>=.85&&coin.buyShare>=.51?
      'HIGH' as const:updatedScore>=38||coin.outlook24h.fastLane?
      'POSSIBLE' as const:'AVOID' as const;
    const outlook24h={...coin.outlook24h,rankScore:updatedScore,state,
      reason:[...(ignition.state==='FLOW_CONFIRMED'?[ignition.evidence]:[]),
        ...edge.evidence,coin.outlook24h.reason].filter(Boolean).slice(0,2).join(' · ')};
    return {...coin,outlook24h,edge,spotIgnition:ignition};
  });
  // Update AFTER comparing all symbols; do not self-confirm a single snapshot.
  const sampledAt=Date.now();
  for(const [symbol,sample] of liquidityHistory)
    if(sampledAt-sample.sampledAt>660000)liquidityHistory.delete(symbol);
  for(const [symbol,sample] of accumulationHistory)
    if(sampledAt-sample.sampledAt>660000)accumulationHistory.delete(symbol);
  for(const coin of detailed){
    if(!coin)continue;
    const snapshot=spotLiquiditySample(coin,sampledAt);
    if(snapshot)liquidityHistory.set(coin.symbol,snapshot);
    // Only pre-verified, depth-backed buying may seed the NEXT independent scan.
    const current=spotAccumulationPulse(coin);
    const proof=accumulationSample(coin,current,sampledAt);
    if(proof)accumulationHistory.set(coin.symbol,proof);
    else if(current.state==='BUY_ABSORBED')accumulationHistory.delete(coin.symbol);
  }
  const untouched=eligible.slice(12);
  const candidates=[...examined,...untouched]
    .filter(c=>c.outlook24h.state!=='AVOID'&&
      (c.outlook24h.rankScore>=38||c.outlook24h.fastLane)&&
      c.spotIgnition?.state!=='FADING'&&
      c.edge?.leverage?.state!=='CROWDED_LONGS'&&
      c.edge?.whale?.state!=='SELL_PRESSURE')
    .sort((a,b)=>b.outlook24h.rankScore-a.outlook24h.rankScore)
    .slice(0,14);
  const forwardAudit=await recordAndEvaluateSpot(candidates,async(symbol,dueAt)=>{
    const startTime=Math.floor(dueAt/60000)*60000;
    return getJson('/api/v3/klines?symbol='+encodeURIComponent(symbol)+
      '&interval=1m&startTime='+startTime+'&limit=4',5000);
  }).catch(()=>undefined);
  return {ok:true,source:'Binance public Spot · closed 1m candles + depth',
    asOf:Date.now(),universe,scanned:initial.length,depthChecked,
    candidates,forwardAudit,method:'Binance Spot · three-window buying acceleration + depth · independently repeated accumulation and liquidity checks · closed 1m/1h candles',
    warning:'Persistent buy-flow signals require separate fresh scans. Process memory resets on redeploy. No future/hidden orders, pump guarantee or auto-trades.'};
}
export async function GET(){
  const now=Date.now();
  if(lastGood&&now-lastGood.time<CACHE_MS)return Response.json({...lastGood.value,
    cacheAgeMs:now-lastGood.time},{headers:{'Cache-Control':'no-store'}});
  if(binanceBlockedUntil>now){
    const seconds=Math.ceil((binanceBlockedUntil-now)/1000);
    return Response.json({ok:false,status:'binance_cooldown',
      asOf:now,retryAfterSeconds:seconds,
      message:'Binance temporarily limited the server IP; browser Spot analysis will be tried'},
      {status:503,headers:{'Cache-Control':'no-store','Retry-After':String(seconds)}});
  }
  if(!pending)pending=scan().finally(()=>{pending=null;});
  try{
    const value=await pending;
    lastGood={time:Date.now(),value};
    return Response.json({...value,cacheAgeMs:0},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return Response.json({ok:false,
      status:binanceBlockedUntil>Date.now()?'binance_cooldown':'unavailable',
      retryAfterSeconds:Math.max(0,Math.ceil((binanceBlockedUntil-Date.now())/1000)),
      asOf:now,message:'تعذر إثبات مرشحي Spot من بيانات Binance الحالية',
      detail:String(error instanceof Error?error.message:error).slice(0,650),
      failedStage:recentProblems.slice(-5),
      gateway:selectedHost?.name??'unavailable'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
