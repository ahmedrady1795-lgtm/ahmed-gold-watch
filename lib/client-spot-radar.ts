'use client';

import {parseKlines,parseHourlyKlines,parseBook,scoreCoin,score24hOutlook,type Candidate,isEarlyWatchCandidate} from './spot-radar';
import {memeSpotSymbols,marketGroup,highUpsideFocus} from './spot-high-upside';
import {rankSpotFastLane} from './spot-aggressive';
import {spotAccumulationPulse} from './spot-accumulation';

type Ticker={symbol:string;quoteVolume:string;priceChangePercent:string};
type MarketInfo={symbols?:Array<{symbol:string;status:string;quoteAsset:string;isSpotTradingAllowed?:boolean;permissions?:string[]}>};
type BrowserPipeline={discovered:number;verifiedPairs:number;tickerRows:number;selected:number;
  freshMinuteCandles:number;depthCandidates:number;depthChecked:number;hourlyVerified:number;
  nonAvoid:number;topPicks:number;earlyWatch:number};
type BrowserRadar={ok:true;asOf:number;source:string;universe:number;scanned:number;
  depthChecked:number;candidates:Candidate[];watchlist:Candidate[];pipeline:BrowserPipeline;method:string;warning:string};

const HOSTS=['https://data-api.binance.vision','https://api.binance.com','https://api-gcp.binance.com'];
async function request(host:string,path:string,timeoutMs=8000):Promise<unknown>{
  const res=await fetch(host+path,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
  if(!res.ok)throw Error(host.replace('https://','')+': HTTP '+res.status);
  return res.json();
}
async function pickHost():Promise<string>{
  const probes=await Promise.allSettled(HOSTS.map(async host=>{
    const j=await request(host,'/api/v3/time',4500) as {serverTime?:number};
    if(!j?.serverTime||Math.abs(Date.now()-j.serverTime)>120000)throw Error('Invalid Binance clock');
    return host;
  }));
  const winner=probes.find(x=>x.status==='fulfilled');
  if(winner?.status==='fulfilled')return winner.value;
  throw Error('تعذر الوصول إلى Binance من المتصفح أيضًا؛ تأكد من توفر خدمة Binance Spot في شبكتك.');
}
async function parallel<T,R>(values:T[],count:number,fn:(value:T)=>Promise<R|null>):Promise<R[]>{
  const out:R[]=[];
  for(let i=0;i<values.length;i+=count){
    const rows=await Promise.allSettled(values.slice(i,i+count).map(fn));
    for(const row of rows)if(row.status==='fulfilled'&&row.value!==null)out.push(row.value);
  }
  return out;
}
/**
 * Binance only, public unauthenticated endpoints, from the user's own browser.
 * Server gateways may be region/IP blocked while the browser is allowed.
 * No synthetic trades, venue switching or fabricated order book.
 */
export async function scanSpotInBrowser():Promise<BrowserRadar>{
  const host=await pickHost();
  // Discover with the compact price feed; never download all exchangeInfo or
  // full 24hr statistics on mobile. Only verify small rotating symbol batches.
  const prices=await request(host,'/api/v3/ticker/price',12500) as Array<{symbol:string;price:string}>;
  if(!Array.isArray(prices))throw Error('قائمة أزواج Binance الخفيفة غير متاحة.');
  const stables=new Set(['USDC','FDUSD','TUSD','DAI','USDE','EUR','EURI','AEUR',
    'USDD','USD1','RLUSD','USDS','USTC','PYUSD']);
  const all=prices.map(p=>p?.symbol).filter((p):p is string=>
    typeof p==='string'&&p.endsWith('USDT')&&!stables.has(p.slice(0,-4)));
  const anchors=[...memeSpotSymbols(),'SUIUSDT','NEARUSDT','OPUSDT',
    'ARBUSDT','APTUSDT','FETUSDT','RENDERUSDT','BTCUSDT','ETHUSDT','SOLUSDT'];
  const windowIndex=Math.floor(Date.now()/180000),sorted=[...new Set(all)].sort();
  const start=sorted.length?windowIndex%sorted.length:0;
  const known=new Set(sorted);
  const names=[...new Set([...anchors.filter(x=>known.has(x)),...sorted.slice(start,start+55),
    ...sorted.slice(0,Math.max(0,start+55-sorted.length))])].slice(0,68);
  const batches=Array.from({length:Math.ceil(names.length/20)},
    (_,i)=>names.slice(i*20,i*20+20));
  const [infos,tickerGroups]=await Promise.all([
    parallel(batches,4,async chunk=>{
      try{return await request(host,'/api/v3/exchangeInfo?symbols='+
        encodeURIComponent(JSON.stringify(chunk)),11000) as MarketInfo;
      }catch{return null;}
    }),
    parallel(batches,4,async chunk=>{
      try{
        const x=await request(host,'/api/v3/ticker/24hr?symbols='+
          encodeURIComponent(JSON.stringify(chunk)),11000);
        return Array.isArray(x)?x as Ticker[]:null;
      }catch{return null;}
    })
  ]);
  const allowed=new Set(infos.flatMap(i=>i?.symbols||[]).filter(s=>
    s.status==='TRADING'&&s.quoteAsset==='USDT'&&
    s.isSpotTradingAllowed!==false&&
    (!s.permissions?.length||s.permissions.includes('SPOT'))).map(s=>s.symbol));
  const tickers=tickerGroups.flat();
  if(!allowed.size||!tickers.length)throw Error('تعذر التحقق من مجموعات أزواج Binance Spot المصغرة.');
  const eligible=tickers.filter(t=>allowed.has(t.symbol)&&t.symbol.endsWith('USDT')&&
    !stables.has(t.symbol.slice(0,-4))&&Number(t.quoteVolume)>=750000&&
    Number(t.priceChangePercent)>=-12&&Number(t.priceChangePercent)<=25);
  const high=[...eligible].sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,10);
  const low=eligible.filter(t=>+t.quoteVolume>=2000000&&+t.quoteVolume<=95000000&&
    +t.priceChangePercent>=-4&&+t.priceChangePercent<=7)
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,20);
  const trending=eligible.filter(t=>+t.quoteVolume<200000000&&
    +t.priceChangePercent>=0&&+t.priceChangePercent<=12)
    .sort((a,b)=>+b.priceChangePercent-+a.priceChangePercent).slice(0,15);
  const meme=eligible.filter(t=>marketGroup(t.symbol)==='MEME')
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,24);
  const highBeta=eligible.filter(t=>marketGroup(t.symbol)==='HIGH_BETA')
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,12);
  const chosen=Array.from(new Map([...meme,...highBeta,...trending,...low,...high]
    .map(t=>[t.symbol,t])).values()).slice(0,44);
  if(!chosen.length)throw Error('Binance لم ترجع أزواج Spot مؤهلة للتحليل.');
  const btcCandles=parseKlines(await request(host,'/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=65',9000));
  const btc15=btcCandles.length>=17&&Date.now()-btcCandles.at(-1)!.time<210000
    ?(btcCandles.at(-1)!.close/btcCandles.at(-16)!.close-1)*100:null;
  const scans=await parallel(chosen,6,async ticker=>{
    try{
      const raw=await request(host,'/api/v3/klines?symbol='+encodeURIComponent(ticker.symbol)+'&interval=1m&limit=75',7500);
      return scoreCoin(ticker.symbol,+ticker.priceChangePercent,+ticker.quoteVolume,
        parseKlines(raw),btc15,null);
    }catch{return null;}
  });
  if(!scans.length)throw Error('فشل تحميل شموع Binance الحقيقية من المتصفح، لا توجد إشارات قابلة للتحقق.');
  const memeLane=[...scans].filter(c=>marketGroup(c.symbol)==='MEME')
    .sort((a,b)=>b.score-a.score).slice(0,12);
  const betaLane=[...scans].filter(c=>marketGroup(c.symbol)==='HIGH_BETA')
    .sort((a,b)=>b.score-a.score).slice(0,8);
  const coiled=[...scans].filter(c=>spotAccumulationPulse(c).flowCandidate)
    .sort((a,b)=>spotAccumulationPulse(b).buyIntensity-
      spotAccumulationPulse(a).buyIntensity).slice(0,8);
  const freshFlow=[...scans].filter(c=>!c.trapRisk&&c.buyShare>=.53&&
    c.volumeImpulse>=1.25&&c.flowDelta5m>1200&&c.change24h<12)
    .sort((a,b)=>b.flowDelta5m-a.flowDelta5m).slice(0,10);
  const ranked=Array.from(new Map([...coiled,...freshFlow,...memeLane,...betaLane,
    ...[...scans].sort((a,b)=>b.score-a.score)].map(c=>[c.symbol,c])).values()).slice(0,26);
  let depthChecked=0;
  const refined=await parallel(ranked,6,async item=>{
    try{
      const raw=await request(host,'/api/v3/depth?symbol='+encodeURIComponent(item.symbol)+'&limit=100',6500);
      const book=parseBook(raw,item.price);
      if(book)depthChecked++;
      return scoreCoin(item.symbol,item.change24h,item.volume24h,item.candles,btc15,book);
    }catch{return item;}
  });
  const btcHourly=parseHourlyKlines(await request(host,
    '/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=75',9000).catch(()=>null));
  const btc24=btcHourly.length>=55?
    (btcHourly.at(-1)!.close/btcHourly.at(-25)!.close-1)*100:null;
  const inspected=await parallel(refined.filter((x):x is Candidate=>x!==null),6,async coin=>{
    try{
      const raw=await request(host,'/api/v3/klines?symbol='+encodeURIComponent(coin.symbol)+
        '&interval=1h&limit=75',8000);
      const hourly=parseHourlyKlines(raw);
      const outlook=score24hOutlook(coin,hourly,btc24);
      if(!outlook)return null;
      const highUpside=highUpsideFocus(coin,hourly);
      const accumulation=spotAccumulationPulse(coin);
      const outlook24h=rankSpotFastLane(coin,outlook,
        (highUpside?.boost??0)+accumulation.adjustment);
      if(highUpside?.boost)outlook24h.reason=[highUpside.reason,outlook24h.reason].join(' · ');
      if(accumulation.state==='BUY_BUILDUP'||accumulation.state==='BUY_ABSORBED')
        outlook24h.reason=[accumulation.reason,outlook24h.reason].filter(Boolean).slice(0,2).join(' · ');
      return {...coin,outlook24h,highUpside,accumulation};
    }catch{return null;}
  });
  if(!inspected.length)throw Error('لا يوجد تاريخ ساعة مكتمل للتحليل خلال 24 ساعة.');
  const candidates=inspected.filter(x=>x.volume24h>=1_500_000&&
    x.outlook24h.state!=='AVOID')
    .sort((a,b)=>b.outlook24h.rankScore-a.outlook24h.rankScore).slice(0,14);
  const candidateSymbols=new Set(candidates.map(c=>c.symbol));
  const watchlist=inspected.filter(isEarlyWatchCandidate)
    .filter(c=>!candidateSymbols.has(c.symbol))
    .sort((a,b)=>
      (b.outlook24h!.rankScore+Math.min(12,b.volumeImpulse*3)+Math.max(0,(b.buyShare-.5)*40)+(b.highUpside?.group==='MEME'?4:0))-
      (a.outlook24h!.rankScore+Math.min(12,a.volumeImpulse*3)+Math.max(0,(a.buyShare-.5)*40)+(a.highUpside?.group==='MEME'?4:0)))
    .slice(0,16);
  const pipeline:BrowserPipeline={discovered:names.length,verifiedPairs:allowed.size,
    tickerRows:tickers.length,selected:chosen.length,freshMinuteCandles:scans.length,
    depthCandidates:ranked.length,depthChecked,hourlyVerified:inspected.length,
    nonAvoid:inspected.filter(c=>c.outlook24h.state!=='AVOID').length,
    topPicks:candidates.length,earlyWatch:watchlist.length};
  return {ok:true,asOf:Date.now(),source:'Binance Spot · direct browser feed ('+host.replace('https://','')+')',
    universe:all.length,scanned:scans.length,depthChecked,candidates,watchlist,pipeline,
    method:'Direct Binance · verified meme-first Spot markets · 1h true range + 24h volume · buyer flow',
    warning:'التحليل من المتصفح بسبب تعذر الخادم. الترتيب قوة أدلة للحركة خلال 24 ساعة وليس نسبة ضخ مضمونة.'};
}
