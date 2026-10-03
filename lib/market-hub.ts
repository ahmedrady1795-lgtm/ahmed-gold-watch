import {getRuntimeEnv} from './runtime';
import type { Candle, Event } from './engine';

export type BackgroundPoint = {
  key: 'dxy' | 'us2y' | 'us10y';
  label: string;
  symbol: string;
  value: number | null;
  change: number | null;
  percentChange: number | null;
  sourceTime: number | null;
  status: 'live' | 'delayed' | 'closed_or_stale' | 'unknown' | 'unavailable';
  source: string;
};

export type MarketData = {
  checkedAt: number;
  pricesReady: boolean;
  newsReady: boolean;
  backgroundReady: boolean;
  c1: Candle[];
  c5: Candle[];
  c15: Candle[];
  c60: Candle[];
  events: Event[];
  background: BackgroundPoint[];
  errors: string[];
  priceSource?: string;
};

export type QuoteData = {
  ok: true;
  symbol: 'XAU/USD';
  price: number;
  source: string;
  sourceTime: number | null;
  fetchedAt: number;
  status: 'live' | 'delayed' | 'closed_or_stale' | 'unknown';
  previousClose: number | null;
  change: number | null;
  percentChange: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  brokerSymbol?: string | null;
  bridgeLatencyMs?: number | null;
};

export type Mt5BridgeStatus = {
  receivedAt: number;
  symbol: string;
  tickTimeMs: number;
  bid: number;
  ask: number;
  last: number | null;
  account?: {login?:number|null;balance?:number|null;equity?:number|null;marginLevel?:number|null}|null;
  mode?: 'dry-run' | 'live' | string;
  bridgeLatencyMs?: number | null;
  lastQuality?: Record<string, unknown> | null;
  candlesReceivedAt?: number | null;
  candles?: { c1: Candle[]; c5: Candle[]; c15: Candle[]; c60: Candle[] } | null;
};

type Cache<T> = { at: number; value: T };
let marketCache: Cache<MarketData> | null = null;
let externalQuoteCache: Cache<QuoteData> | null = null;
let mt5State: Mt5BridgeStatus | null = null;
let backgroundCache: Cache<BackgroundPoint[]> | null = null;

const MARKET_TTL_MS = 15_000;
const BACKGROUND_TTL_MS = 30_000;
const EXTERNAL_QUOTE_TTL_MS = 1_500;
const MT5_TICK_MAX_AGE_MS = 8_000;

const utc = (s: string) => Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
function num(value: unknown): number | null {const n = Number(value);return Number.isFinite(n) ? n : null;}
function statusFor(sourceTime:number|null,now:number):QuoteData['status']{if(!sourceTime||sourceTime>now+10000)return'unknown';const age=Math.max(0,now-sourceTime);if(age<=120000)return'live';if(age<=1200000)return'delayed';return'closed_or_stale';}
function goldSessionOpen(now:number){
  const d=new Date(now),day=d.getUTCDay(),h=d.getUTCHours()+d.getUTCMinutes()/60;
  if(day===6)return false;
  if(day===0&&h<22)return false;
  if(day===5&&h>=21)return false;
  if(day>=1&&day<=4&&h>=21&&h<22)return false;
  return true;
}
function goldStatusFor(sourceTime:number|null,now:number):QuoteData['status']{
  if(!goldSessionOpen(now))return 'closed_or_stale';
  return statusFor(sourceTime,now);
}
function sourceTimeMs(data:any):number|null{const ts=Number(data?.timestamp);if(Number.isFinite(ts)&&ts>1_000_000_000)return ts*1000;if(typeof data?.datetime==='string'&&data.datetime.trim()){const raw=data.datetime.trim(),parsed=Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z');if(Number.isFinite(parsed))return parsed;}return null;}
async function getJson(url:string,headers:Record<string,string>={}){const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000)}),data=await response.json().catch(()=>({}));if(!response.ok||data?.status==='error'||(data?.code&&Number(data.code)>=400))throw new Error(String(data?.message||data?.error||data?.status||`HTTP ${response.status}`));return data;}
function candles(data:any):Candle[]{if(!Array.isArray(data?.values)||data?.meta?.symbol!=='XAU/USD')throw new Error('schema');const parsed=data.values.map((v:any)=>({time:utc(v.datetime),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close)}));if(parsed.some((v:Candle)=>!Object.values(v).every(Number.isFinite)||v.low<=0||v.high<v.low||v.open<v.low||v.open>v.high||v.close<v.low||v.close>v.high))throw new Error('schema');return parsed.sort((a:Candle,b:Candle)=>a.time-b.time).filter((v:Candle,i:number,a:Candle[])=>i===0||v.time!==a[i-1].time);}
function mt5Candles(input:unknown):Candle[]{if(!Array.isArray(input))throw new Error('mt5 candle schema');const parsed=input.map((v:any)=>({time:Number(v?.time),open:Number(v?.open),high:Number(v?.high),low:Number(v?.low),close:Number(v?.close)}));if(parsed.some((v:Candle)=>!Object.values(v).every(Number.isFinite)||v.time<=0||v.low<=0||v.high<v.low||v.open<v.low||v.open>v.high||v.close<v.low||v.close>v.high))throw new Error('mt5 candle schema');return parsed.sort((a:Candle,b:Candle)=>a.time-b.time).filter((v:Candle,i:number,a:Candle[])=>i===0||v.time!==a[i-1].time);}
function usableMt5Candles(now=Date.now()){const bridge=getMt5BridgeStatus(now),s=bridge.status;if(!bridge.fresh||!bridge.candlesFresh||!s?.candles)return null;const c=s.candles;if(c.c1.length<80||c.c5.length<220||c.c15.length<220||c.c60.length<220)return null;return c;}

export function setMt5BridgeStatus(input:unknown):Mt5BridgeStatus{
  const body=input&&typeof input==='object'?input as Record<string,any>:{},symbol=String(body.symbol||'').trim(),tickTimeMs=Number(body.tickTimeMs||body.time_msc||0),bid=Number(body.bid),ask=Number(body.ask);
  if(!/^XAUUSD[a-z0-9._-]*$/i.test(symbol)||tickTimeMs>Date.now()+10000||!Number.isFinite(tickTimeMs)||tickTimeMs<=0||!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid)throw new Error('invalid MT5 status payload');
  const accountRaw=body.account&&typeof body.account==='object'?body.account:null;
  let candleSet=mt5State?.candles??null,candlesReceivedAt=mt5State?.candlesReceivedAt??null;
  if(body.candles&&typeof body.candles==='object'){try{const candidate={c1:mt5Candles(body.candles.c1),c5:mt5Candles(body.candles.c5),c15:mt5Candles(body.candles.c15),c60:mt5Candles(body.candles.c60)};if(candidate.c1.length>=80&&candidate.c5.length>=220&&candidate.c15.length>=220&&candidate.c60.length>=220){candleSet=candidate;candlesReceivedAt=Date.now();}}catch{}}
  mt5State={receivedAt:Date.now(),symbol,tickTimeMs,bid,ask,last:num(body.last),mode:String(body.mode||'dry-run'),bridgeLatencyMs:num(body.bridgeLatencyMs),lastQuality:body.lastQuality&&typeof body.lastQuality==='object'?body.lastQuality:null,candles:candleSet,candlesReceivedAt,account:accountRaw?{login:num(accountRaw.login),balance:num(accountRaw.balance),equity:num(accountRaw.equity),marginLevel:num(accountRaw.marginLevel)}:null};
  return mt5State;
}
export function getMt5BridgeStatus(now=Date.now()){if(!mt5State)return{connected:false,fresh:false,candlesFresh:false,status:null as Mt5BridgeStatus|null};const tickAgeMs=Math.max(0,now-mt5State.tickTimeMs),bridgeAgeMs=Math.max(0,now-mt5State.receivedAt),candlesAgeMs=mt5State.candlesReceivedAt?Math.max(0,now-mt5State.candlesReceivedAt):null,fresh=tickAgeMs<=MT5_TICK_MAX_AGE_MS&&bridgeAgeMs<=15000,candlesFresh=Boolean(fresh&&mt5State.candles&&candlesAgeMs!=null&&candlesAgeMs<=45000);return{connected:true,fresh,candlesFresh,tickAgeMs,bridgeAgeMs,candlesAgeMs,status:mt5State};}

async function quoteFromBinanceFutures(now:number):Promise<QuoteData>{const data=await getJson('https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=XAUUSDT'),bid=num(data?.bidPrice??data?.bid),ask=num(data?.askPrice??data?.ask);if(bid==null||ask==null||bid<=0||ask<bid)throw new Error('invalid Binance XAUUSDT quote');const sourceTime=num(data?.time);return{ok:true,symbol:'XAU/USD',price:(bid+ask)/2,source:'Binance Futures · XAUUSDT proxy',sourceTime,fetchedAt:now,status:goldStatusFor(sourceTime,now),previousClose:null,change:null,percentChange:null,bid,ask,spread:ask-bid};}
function binanceCandles(data:any):Candle[]{if(!Array.isArray(data))throw new Error('binance schema');const parsed=data.map((v:any)=>({time:Number(v?.[0]),open:Number(v?.[1]),high:Number(v?.[2]),low:Number(v?.[3]),close:Number(v?.[4])}));if(parsed.some((v:Candle)=>!Object.values(v).every(Number.isFinite)||v.time<=0||v.low<=0||v.high<v.low||v.open<v.low||v.open>v.high||v.close<v.low||v.close>v.high))throw new Error('binance schema');return parsed.sort((a:Candle,b:Candle)=>a.time-b.time).filter((v:Candle,i:number,a:Candle[])=>i===0||v.time!==a[i-1].time);}
async function candlesFromBinance(interval:'1m'|'5m'|'15m'|'1h'):Promise<Candle[]>{return binanceCandles(await getJson('https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval='+interval+'&limit=340'));}
function yahooCandles(data:any):Candle[]{
  const r=data?.chart?.result?.[0],ts=r?.timestamp,q=r?.indicators?.quote?.[0];
  if(!Array.isArray(ts)||!q)throw new Error('yahoo schema');
  const out:Candle[]=[];
  for(let i=0;i<ts.length;i++){
    const open=Number(q.open?.[i]),high=Number(q.high?.[i]),low=Number(q.low?.[i]),close=Number(q.close?.[i]),time=Number(ts[i])*1000;
    if([time,open,high,low,close].every(Number.isFinite)&&time>0&&low>0&&high>=Math.max(open,close)&&low<=Math.min(open,close))out.push({time,open,high,low,close});
  }
  return out.sort((a,b)=>a.time-b.time).filter((v,i,a)=>i===0||v.time!==a[i-1].time);
}
async function candlesFromYahoo(interval:'1m'|'5m'|'15m'|'1h'):Promise<Candle[]>{
  const map={ '1m':{i:'1m',r:'1d'},'5m':{i:'5m',r:'5d'},'15m':{i:'15m',r:'5d'},'1h':{i:'60m',r:'1mo'} } as const;
  const p=map[interval],url='https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval='+p.i+'&range='+p.r+'&includePrePost=false&events=div%2Csplits';
  const rows=yahooCandles(await getJson(url,{'User-Agent':'Mozilla/5.0 AhmedGoldCommand/1.0'}));
  if((interval==='1m'&&rows.length<80)||(interval!=='1m'&&rows.length<220))throw new Error('yahoo history insufficient');
  return rows;
}
async function quoteFromFreeGoldApi(now:number):Promise<QuoteData>{const data=await getJson('https://api.gold-api.com/price/XAU'),price=num(data?.price);if(!price||price<=0)throw new Error('invalid Gold-API.com price');const updatedAt=typeof data?.updatedAt==='string'?Date.parse(data.updatedAt):NaN,sourceTime=Number.isFinite(updatedAt)?updatedAt:null;return{ok:true,symbol:'XAU/USD',price,source:'Gold-API.com · مجاني',sourceTime,fetchedAt:now,status:goldStatusFor(sourceTime,now),previousClose:null,change:null,percentChange:null,bid:null,ask:null,spread:null};}
async function quoteFromGoldApi(apiKey:string,now:number):Promise<QuoteData>{const data=await getJson('https://www.goldapi.io/api/price/XAU/USD',{'x-access-token':apiKey,'Content-Type':'application/json'}),price=num(data?.price);if(!price||price<=0)throw new Error('invalid GoldAPI price');const bid=num(data?.bid),ask=num(data?.ask),sourceTime=sourceTimeMs(data);return{ok:true,symbol:'XAU/USD',price,source:'GoldAPI.io',sourceTime,fetchedAt:now,status:goldStatusFor(sourceTime,now),previousClose:num(data?.prev_close_price),change:num(data?.change??data?.ch),percentChange:num(data?.change_percent??data?.chp),bid,ask,spread:bid!=null&&ask!=null&&ask>=bid?ask-bid:null};}
async function quoteFromTwelve(apiKey:string,now:number):Promise<QuoteData>{let data=await getJson('https://api.twelvedata.com/quote?symbol=XAU%2FUSD',{Authorization:`apikey ${apiKey}`}),price=num(data?.close??data?.price),sourceTime=sourceTimeMs(data);if(!price||price<=0){data=await getJson('https://api.twelvedata.com/price?symbol=XAU%2FUSD',{Authorization:`apikey ${apiKey}`});price=num(data?.price);sourceTime=sourceTimeMs(data);}if(!price||price<=0)throw new Error('invalid Twelve Data price');return{ok:true,symbol:'XAU/USD',price,source:'Twelve Data',sourceTime,fetchedAt:now,status:goldStatusFor(sourceTime,now),previousClose:num(data?.previous_close),change:num(data?.change),percentChange:num(data?.percent_change),bid:null,ask:null,spread:null};}

export async function getQuoteData(options:{forceExternal?:boolean}={}):Promise<QuoteData>{
  const now=Date.now(),mt5=getMt5BridgeStatus(now);
  if(!options.forceExternal&&mt5.fresh&&mt5.status){const s=mt5.status,price=s.last&&s.last>0?s.last:(s.bid+s.ask)/2;return{ok:true,symbol:'XAU/USD',price,source:`Exness/MT5 · ${s.symbol}`,sourceTime:s.tickTimeMs,fetchedAt:now,status:'live',previousClose:null,change:null,percentChange:null,bid:s.bid,ask:s.ask,spread:s.ask-s.bid,brokerSymbol:s.symbol,bridgeLatencyMs:s.bridgeLatencyMs??null};}
  if(externalQuoteCache&&now-externalQuoteCache.at<EXTERNAL_QUOTE_TTL_MS)return externalQuoteCache.value;
  const rt=getRuntimeEnv(),goldKey=rt.GOLD_API_KEY||rt.GOLDAPI_API_KEY||rt.GOLDAPI_TOKEN,twelveKey=rt.TWELVE_DATA_API_KEY,errors:string[]=[];
  for(const provider of [()=>quoteFromBinanceFutures(now),()=>quoteFromFreeGoldApi(now),goldKey?()=>quoteFromGoldApi(goldKey,now):null,twelveKey?()=>quoteFromTwelve(twelveKey,now):null]){if(!provider)continue;try{const value=await provider();externalQuoteCache={at:now,value};return value;}catch(e){errors.push(e instanceof Error?e.message:'provider error');}}
  throw new Error('QUOTE_SOURCE_ERROR: '+errors.join(' | ').slice(0,320));
}

async function backgroundFromTwelve(apiKey:string):Promise<BackgroundPoint[]>{const now=Date.now(),rt=getRuntimeEnv();if(backgroundCache&&now-backgroundCache.at<BACKGROUND_TTL_MS)return backgroundCache.value;const defs=[{key:'dxy' as const,label:'DXY',symbol:String(rt.BACKGROUND_DXY_SYMBOL||'DXY')},{key:'us2y' as const,label:'US 2Y',symbol:String(rt.BACKGROUND_US2Y_SYMBOL||'US02Y')},{key:'us10y' as const,label:'US 10Y',symbol:String(rt.BACKGROUND_US10Y_SYMBOL||'US10Y')}];const values=await Promise.all(defs.map(async d=>{try{const data=await getJson('https://api.twelvedata.com/quote?symbol='+encodeURIComponent(d.symbol),{Authorization:`apikey ${apiKey}`}),value=num(data?.close??data?.price),sourceTime=sourceTimeMs(data);if(value==null)throw new Error('no value');return{...d,value,change:num(data?.change),percentChange:num(data?.percent_change),sourceTime,status:statusFor(sourceTime,now),source:'Twelve Data'} as BackgroundPoint;}catch{return{...d,value:null,change:null,percentChange:null,sourceTime:null,status:'unavailable',source:'Twelve Data'} as BackgroundPoint;}}));backgroundCache={at:now,value:values};return values;}

export async function getMarketData(options:{force?:boolean}={}):Promise<MarketData>{
  const now=Date.now(),mt5CandlesNow=usableMt5Candles(now);
  if(!options.force&&marketCache&&now-marketCache.at<MARKET_TTL_MS){const cachedMt5=String(marketCache.value.priceSource||'').startsWith('Exness/MT5');if(Boolean(mt5CandlesNow)===cachedMt5)return marketCache.value;}
  const rt=getRuntimeEnv(),priceKey=rt.TWELVE_DATA_API_KEY,calendarKey=rt.TRADING_ECONOMICS_API_KEY,result:MarketData={checkedAt:now,pricesReady:false,newsReady:false,backgroundReady:false,c1:[],c5:[],c15:[],c60:[],events:[],background:[],errors:[],priceSource:'unavailable'};
  if(!calendarKey)result.errors.push('مصدر التقويم الاقتصادي غير مربوط؛ NEWS MODE غير متاح، بينما التحليل الفني يستمر.');
  const jobs:Promise<void>[]=[];
  jobs.push((async()=>{if(mt5CandlesNow){result.c1=mt5CandlesNow.c1;result.c5=mt5CandlesNow.c5;result.c15=mt5CandlesNow.c15;result.c60=mt5CandlesNow.c60;result.pricesReady=true;result.priceSource=`Exness/MT5 · ${getMt5BridgeStatus(now).status?.symbol||'broker'}`;return;}try{const[m1,m5,m15,h1]=await Promise.all([candlesFromBinance('1m'),candlesFromBinance('5m'),candlesFromBinance('15m'),candlesFromBinance('1h')]);result.c1=m1;result.c5=m5;result.c15=m15;result.c60=h1;result.pricesReady=true;result.priceSource='Binance Futures · XAUUSDT proxy';return;}catch{result.errors.push('Binance XAUUSDT غير متاح من الخادم؛ تجربة مصدر احتياطي.');}try{const[m1,m5,m15,h1]=await Promise.all([candlesFromYahoo('1m'),candlesFromYahoo('5m'),candlesFromYahoo('15m'),candlesFromYahoo('1h')]);result.c1=m1;result.c5=m5;result.c15=m15;result.c60=h1;result.pricesReady=true;result.priceSource='Yahoo Finance · COMEX GC=F proxy';result.errors.push('الشموع من عقود COMEX GC=F كبديل تحليلي، وليست سعر تنفيذ Exness XAUUSDm.');return;}catch{result.errors.push('Yahoo GC=F غير متاح مؤقتاً.');}if(priceKey){try{const base='https://api.twelvedata.com/time_series?symbol=XAU%2FUSD&outputsize=340&timezone=UTC&apikey='+encodeURIComponent(priceKey),[m1,m5,m15,h1]=await Promise.all([getJson(base+'&interval=1min'),getJson(base+'&interval=5min'),getJson(base+'&interval=15min'),getJson(base+'&interval=1h')]);result.c1=candles(m1);result.c5=candles(m5);result.c15=candles(m15);result.c60=candles(h1);result.pricesReady=true;result.priceSource='Twelve Data · XAU/USD';result.errors.push('تم استخدام Twelve Data كمصدر احتياطي.');return;}catch{}}result.errors.push('تعذر الحصول على شموع MT5/Binance/Yahoo أو مصدر احتياطي.');})());
  if(priceKey)jobs.push((async()=>{try{result.background=await backgroundFromTwelve(priceKey);result.backgroundReady=result.background.filter(x=>x.value!=null&&x.status!=='unavailable').length>=2;if(!result.backgroundReady)result.errors.push('DXY والعوائد غير مكتملة؛ تستخدم كـConfirmation فقط ولن توقف الإشارة.');}catch{result.background=[];result.errors.push('تعذر تحديث DXY والعوائد؛ لن تستخدم في القرار.');}})());
  if(calendarKey)jobs.push((async()=>{try{const start=new Date(now-86400000).toISOString().slice(0,10),end=new Date(now+7*86400000).toISOString().slice(0,10),data=await getJson('https://api.tradingeconomics.com/calendar/country/united%20states/'+start+'/'+end+'?c='+encodeURIComponent(calendarKey)+'&f=json');if(!Array.isArray(data)||!data.length)throw new Error('empty');result.events=data.map((v:any):Event=>({id:String(v.CalendarId),time:utc(v.Date),name:String(v.Event),importance:Number(v.Importance),actual:String(v.Actual||''),forecast:String(v.Forecast||''),previous:String(v.Previous||''),source:String(v.SourceURL||''),exactTime:String(v.DateSpan)==='0'}));if(result.events.some((v:Event)=>!Number.isFinite(v.time)||![1,2,3].includes(v.importance)))throw new Error('schema');result.events.sort((a,b)=>a.time-b.time);result.newsReady=true;}catch{result.events=[];result.errors.push('تعذر التحقق من التقويم الاقتصادي. الإشارات متوقفة.');}})());
  await Promise.all(jobs);result.checkedAt=Date.now();marketCache={at:result.checkedAt,value:result};return result;
}
export async function getMarketSnapshot(){const[market,quote]=await Promise.all([getMarketData(),getQuoteData().catch(()=>null)]);return{ok:true,checkedAt:Date.now(),market,quote,mt5:getMt5BridgeStatus()};}
