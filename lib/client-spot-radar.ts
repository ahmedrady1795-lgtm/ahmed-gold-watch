'use client';

import {parseKlines,parseBook,scoreCoin,type Candidate} from './spot-radar';

type Ticker={symbol:string;quoteVolume:string;priceChangePercent:string};
type MarketInfo={symbols?:Array<{symbol:string;status:string;quoteAsset:string;isSpotTradingAllowed?:boolean;permissions?:string[]}>};
type BrowserRadar={ok:true;asOf:number;source:string;universe:number;scanned:number;
  depthChecked:number;candidates:Candidate[];method:string;warning:string};

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
  const [info,tickers]=await Promise.all([
    request(host,'/api/v3/exchangeInfo',12500),
    request(host,'/api/v3/ticker/24hr',12500)
  ]);
  const allowed=new Set(((info as MarketInfo).symbols||[]).filter(s=>
    s.status==='TRADING'&&s.quoteAsset==='USDT'&&
    s.isSpotTradingAllowed!==false&&
    (!s.permissions?.length||s.permissions.includes('SPOT'))).map(s=>s.symbol));
  if(!allowed.size||!Array.isArray(tickers))throw Error('تعذر التحقق من أزواج Binance Spot الفعلية.');
  const stables=new Set(['USDC','FDUSD','TUSD','DAI','USDE','EUR','EURI','AEUR','USDD','USD1','RLUSD','USDS']);
  const eligible=(tickers as Ticker[]).filter(t=>allowed.has(t.symbol)&&t.symbol.endsWith('USDT')&&
    !stables.has(t.symbol.slice(0,-4))&&Number(t.quoteVolume)>=1500000&&
    Number(t.priceChangePercent)>=-9&&Number(t.priceChangePercent)<=22);
  const high=[...eligible].sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,10);
  const low=eligible.filter(t=>+t.quoteVolume>=2000000&&+t.quoteVolume<=95000000&&
    +t.priceChangePercent>=-4&&+t.priceChangePercent<=7)
    .sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,20);
  const trending=eligible.filter(t=>+t.quoteVolume<200000000&&
    +t.priceChangePercent>=0&&+t.priceChangePercent<=12)
    .sort((a,b)=>+b.priceChangePercent-+a.priceChangePercent).slice(0,15);
  const chosen=Array.from(new Map([...low,...high,...trending].map(t=>[t.symbol,t])).values()).slice(0,35);
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
  const ranked=scans.sort((a,b)=>b.score-a.score).slice(0,14);
  let depthChecked=0;
  const refined=await parallel(ranked,6,async item=>{
    try{
      const raw=await request(host,'/api/v3/depth?symbol='+encodeURIComponent(item.symbol)+'&limit=100',6500);
      const book=parseBook(raw,item.price);
      if(book)depthChecked++;
      return scoreCoin(item.symbol,item.change24h,item.volume24h,item.candles,btc15,book);
    }catch{return item;}
  });
  const candidates=refined.filter((x):x is Candidate=>x!==null).sort((a,b)=>b.score-a.score).slice(0,12);
  if(!candidates.length)throw Error('لم تتوفر قراءة حديثة موثوقة لعملات Spot.');
  return {ok:true,asOf:Date.now(),source:'Binance Spot · direct browser feed ('+host.replace('https://','')+')',
    universe:allowed.size,scanned:scans.length,depthChecked,candidates,
    method:'Direct Binance public data · closed 1m klines · taker volume · depth',
    warning:'تعذر الاتصال من الخادم؛ تم التحليل مباشرة من المتصفح. تأكد من تحديث البيانات، وليس توصية شراء.'};
}
