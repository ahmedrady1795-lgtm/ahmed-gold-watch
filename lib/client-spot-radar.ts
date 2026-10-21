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
  // Discover with the compact price feed; never download all exchangeInfo or
  // full 24hr statistics on mobile. Only verify small rotating symbol batches.
  const prices=await request(host,'/api/v3/ticker/price',12500) as Array<{symbol:string;price:string}>;
  if(!Array.isArray(prices))throw Error('قائمة أزواج Binance الخفيفة غير متاحة.');
  const stables=new Set(['USDC','FDUSD','TUSD','DAI','USDE','EUR','EURI','AEUR',
    'USDD','USD1','RLUSD','USDS','USTC','PYUSD']);
  const all=prices.map(p=>p?.symbol).filter((p):p is string=>
    typeof p==='string'&&p.endsWith('USDT')&&!stables.has(p.slice(0,-4)));
  const anchors=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT',
    'ADAUSDT','LINKUSDT','SUIUSDT','AVAXUSDT','PEPEUSDT','TRXUSDT',
    'AAVEUSDT','NEARUSDT','OPUSDT','ARBUSDT','APTUSDT','LTCUSDT','WIFUSDT'];
  const windowIndex=Math.floor(Date.now()/180000),sorted=[...new Set(all)].sort();
  const start=sorted.length?windowIndex%sorted.length:0;
  const names=[...new Set([...anchors,...sorted.slice(start,start+55),
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
    universe:all.length,scanned:scans.length,depthChecked,candidates,
    method:'Direct Binance public data · closed 1m klines · taker volume · depth',
    warning:'تعذر الاتصال من الخادم؛ تم التحليل مباشرة من المتصفح. تأكد من تحديث البيانات، وليس توصية شراء.'};
}
