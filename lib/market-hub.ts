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
  microstructure?: {orderBook?: {available?:boolean;reason?:string|null;bids?:Array<{price:number;volume:number}>;asks?:Array<{price:number;volume:number}>};tickFlags?:number;tickVolume?:number} | null;
  candlesReceivedAt?: number | null;
  candles?: { c1: Candle[]; c5: Candle[]; c15: Candle[]; c60: Candle[] } | null;
};

type Cache<T> = { at: number; value: T };
let marketCache: Cache<MarketData> | null = null;
let externalQuoteCache: Cache<QuoteData> | null = null;
let mt5State: Mt5BridgeStatus | null = null;
type FastSide='BUY'|'SELL'|'WAIT';
type Mt5FastTick={at:number;receivedAt:number;price:number;bid:number;ask:number;tickVolume:number|null;flags:number|null;bidDepth:number;askDepth:number;bookImbalance:number};
let mt5FastTicks:Mt5FastTick[]=[];
let backgroundCache: Cache<BackgroundPoint[]> | null = null;

const MARKET_TTL_MS = 15_000;
const BACKGROUND_TTL_MS = 30_000;
const EXTERNAL_QUOTE_TTL_MS = 1_500;
const MT5_TICK_MAX_AGE_MS = 8_000;

const utc = (s: string) => Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
function num(value: unknown): number | null {if(value==null||value==='')return null;const n = Number(value);return Number.isFinite(n) ? n : null;}
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
async function getText(url:string,headers:Record<string,string>={}){const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000)}),text=await response.text();if(!response.ok||!text.trim())throw new Error(`HTTP ${response.status}`);return text;}
function candles(data:any):Candle[]{if(!Array.isArray(data?.values)||data?.meta?.symbol!=='XAU/USD')throw new Error('schema');const parsed=data.values.map((v:any)=>({time:utc(v.datetime),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close)}));if(parsed.some((v:Candle)=>!Object.values(v).every(Number.isFinite)||v.low<=0||v.high<v.low||v.open<v.low||v.open>v.high||v.close<v.low||v.close>v.high))throw new Error('schema');return parsed.sort((a:Candle,b:Candle)=>a.time-b.time).filter((v:Candle,i:number,a:Candle[])=>i===0||v.time!==a[i-1].time);}
function mt5Candles(input:unknown):Candle[]{if(!Array.isArray(input))throw new Error('mt5 candle schema');const parsed=input.map((v:any)=>({time:Number(v?.time),open:Number(v?.open),high:Number(v?.high),low:Number(v?.low),close:Number(v?.close),tickVolume:num(v?.tickVolume)??undefined,realVolume:num(v?.realVolume)??undefined,spread:num(v?.spread)??undefined}));if(parsed.some((v:Candle)=>!Object.values(v).every(Number.isFinite)||v.time<=0||v.low<=0||v.high<v.low||v.open<v.low||v.open>v.high||v.close<v.low||v.close>v.high))throw new Error('mt5 candle schema');return parsed.sort((a:Candle,b:Candle)=>a.time-b.time).filter((v:Candle,i:number,a:Candle[])=>i===0||v.time!==a[i-1].time);}
function usableMt5Candles(now=Date.now()){const bridge=getMt5BridgeStatus(now),s=bridge.status;if(!bridge.fresh||!bridge.candlesFresh||!s?.candles)return null;const c=s.candles;if(c.c1.length<80||c.c5.length<220||c.c15.length<220||c.c60.length<220)return null;return c;}

export function setMt5BridgeStatus(input:unknown):Mt5BridgeStatus{
  const body=input&&typeof input==='object'?input as Record<string,any>:{},symbol=String(body.symbol||'').trim(),tickTimeMs=Number(body.tickTimeMs||body.time_msc||0),bid=Number(body.bid),ask=Number(body.ask);
  if(!/^XAUUSD[a-z0-9._-]*$/i.test(symbol)||tickTimeMs>Date.now()+10000||!Number.isFinite(tickTimeMs)||tickTimeMs<=0||!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid)throw new Error('invalid MT5 status payload');
  const accountRaw=body.account&&typeof body.account==='object'?body.account:null;
  let candleSet=mt5State?.candles??null,candlesReceivedAt=mt5State?.candlesReceivedAt??null;
  if(body.candles&&typeof body.candles==='object'){try{const candidate={c1:mt5Candles(body.candles.c1),c5:mt5Candles(body.candles.c5),c15:mt5Candles(body.candles.c15),c60:mt5Candles(body.candles.c60)};if(candidate.c1.length>=80&&candidate.c5.length>=220&&candidate.c15.length>=220&&candidate.c60.length>=220){candleSet=candidate;candlesReceivedAt=Date.now();}}catch{}}
  const receivedAt=Date.now(),lastPrice=num(body.last),mid=lastPrice&&lastPrice>0?lastPrice:(bid+ask)/2;
  const tickVol=num(body?.microstructure?.tickVolume),tickFlags=num(body?.microstructure?.tickFlags);
  const ob=body?.microstructure?.orderBook;
  const obBids=Array.isArray(ob?.bids)?ob.bids:[],obAsks=Array.isArray(ob?.asks)?ob.asks:[];
  const bidDepth=obBids.slice(0,12).reduce((s:number,x:any)=>s+Math.max(0,Number(x?.volume||0)),0);
  const askDepth=obAsks.slice(0,12).reduce((s:number,x:any)=>s+Math.max(0,Number(x?.volume||0)),0);
  const depthTotal=bidDepth+askDepth;
  const bookImbalance=depthTotal>0?(bidDepth-askDepth)/depthTotal*100:0;
  const lastFast=mt5FastTicks.at(-1);
  if(!lastFast||tickTimeMs>lastFast.at||Math.abs(mid-lastFast.price)>1e-9||Math.abs(bookImbalance-lastFast.bookImbalance)>=1){
    mt5FastTicks.push({at:tickTimeMs,receivedAt,price:mid,bid,ask,tickVolume:tickVol,flags:tickFlags,bidDepth,askDepth,bookImbalance});
    const cutoff=receivedAt-20000;
    mt5FastTicks=mt5FastTicks.filter(x=>x.receivedAt>=cutoff).slice(-500);
  }
  mt5State={receivedAt,symbol,tickTimeMs,bid,ask,last:lastPrice,mode:String(body.mode||'dry-run'),bridgeLatencyMs:num(body.bridgeLatencyMs),lastQuality:body.lastQuality&&typeof body.lastQuality==='object'?body.lastQuality:null,microstructure:body.microstructure&&typeof body.microstructure==='object'?body.microstructure:null,candles:candleSet,candlesReceivedAt,account:accountRaw?{login:num(accountRaw.login),balance:num(accountRaw.balance),equity:num(accountRaw.equity),marginLevel:num(accountRaw.marginLevel)}:null};
  return mt5State;
}
export function getMt5BridgeStatus(now=Date.now()){if(!mt5State)return{connected:false,fresh:false,candlesFresh:false,status:null as Mt5BridgeStatus|null};const tickAgeMs=Math.max(0,now-mt5State.tickTimeMs),bridgeAgeMs=Math.max(0,now-mt5State.receivedAt),candlesAgeMs=mt5State.candlesReceivedAt?Math.max(0,now-mt5State.candlesReceivedAt):null,fresh=tickAgeMs<=MT5_TICK_MAX_AGE_MS&&bridgeAgeMs<=15000,candlesFresh=Boolean(fresh&&mt5State.candles&&candlesAgeMs!=null&&candlesAgeMs<=45000);return{connected:true,fresh,candlesFresh,tickAgeMs,bridgeAgeMs,candlesAgeMs,status:mt5State};}
export function getMt5FastSignal(now=Date.now()){
  const rows=mt5FastTicks.filter(x=>now-x.receivedAt<=12000),latest=rows.at(-1);
  if(!latest||rows.length<4||now-latest.receivedAt>2500)return {ok:false,side:'WAIT' as const,stage:'OFFLINE',score:0,confidence:0,samples:rows.length};
  const older=(ms:number)=>{for(let i=rows.length-1;i>=0;i--)if(rows[i].receivedAt<=latest.receivedAt-ms)return rows[i];return rows[0]||null;};
  const vel=(o:Mt5FastTick|null)=>o&&o.price>0?(latest.price-o.price)/o.price*10000:0;
  const o05=older(500),o1=older(1000),o15=older(1500),o3=older(3000),o4=older(4000),o8=older(8000);
  const v05=vel(o05),v1=vel(o1),v15=vel(o15),v3=vel(o3),v4=vel(o4),v8=vel(o8),acc=v05-v15/3;
  let up=0,down=0;for(let i=1;i<rows.length;i++){if(rows[i].price>rows[i-1].price)up++;else if(rows[i].price<rows[i-1].price)down++;}
  const persistence=Math.round(Math.max(up,down)/Math.max(1,up+down)*100);
  const imbalance=Number(latest.bookImbalance||0);
  const priorBook=o15||o1||rows[0]||latest;
  const pressureChange=imbalance-Number(priorBook.bookImbalance||0);
  const pct=(cur:number,old:number)=>old>0?(cur-old)/old*100:0;
  const bidDepthChangePct=pct(latest.bidDepth,priorBook.bidDepth);
  const askDepthChangePct=pct(latest.askDepth,priorBook.askDepth);
  const replenish=bidDepthChangePct-askDepthChangePct;
  const signImb=imbalance>=8?1:imbalance<=-8?-1:0,signAcc=acc>=.03?1:acc<=-.03?-1:0,signVel=v15>=.05?1:v15<=-.05?-1:0;
  const signShift=pressureChange>=6?1:pressureChange<=-6?-1:0,signReplenish=replenish>=8?1:replenish<=-8?-1:0;
  const vote=signImb*1.15+signAcc*1.15+signVel*.72+signShift*.95+signReplenish*.62+(persistence>=60?(up>down?1:-1)*.52:0);
  const side:FastSide=vote>=1.2?'BUY':vote<=-1.2?'SELL':'WAIT';
  const depthLead=side==='BUY'?(pressureChange>=5||replenish>=7):side==='SELL'?(pressureChange<=-5||replenish<=-7):false;
  const preTrigger=side!=='WAIT'&&Math.abs(v15)<=.55&&Math.abs(acc)>=.018&&(Math.abs(imbalance)>=10||depthLead);
  const ignition=side!=='WAIT'&&Math.abs(v05)>=.20&&Math.abs(acc)>=.055&&persistence>=58;
  const stage=ignition?'IGNITION':preTrigger?'PRE_TRIGGER':side!=='WAIT'?'BUILDING':'WAIT';
  const score=Math.round(Math.max(0,Math.min(92,36+Math.abs(imbalance)*.24+Math.abs(pressureChange)*.34+Math.min(18,Math.abs(replenish)*.18)+Math.abs(acc)*58+Math.abs(v15)*8+Math.max(0,persistence-50)*.30+(preTrigger?11:0))));
  const confidence=Math.round(Math.max(0,Math.min(90,score*.70+Math.min(18,rows.length*.55)+(stage==='PRE_TRIGGER'?8:stage==='IGNITION'?9:0))));
  return {
    ok:true,side,stage,score,confidence,samples:rows.length,source:'Exness/MT5 bridge DOM',
    velocity05s:Number(v05.toFixed(4)),velocity1s:Number(v1.toFixed(4)),velocity15s:Number(v15.toFixed(4)),velocity3s:Number(v3.toFixed(4)),velocity4s:Number(v4.toFixed(4)),velocity8s:Number(v8.toFixed(4)),
    acceleration:Number(acc.toFixed(4)),persistence,bookImbalance:Number(imbalance.toFixed(1)),pressureChange:Number(pressureChange.toFixed(1)),
    bidDepthChangePct:Number(bidDepthChangePct.toFixed(1)),askDepthChangePct:Number(askDepthChangePct.toFixed(1)),replenishDelta:Number(replenish.toFixed(1)),
    price:latest.price,bid:latest.bid,ask:latest.ask,at:latest.at,receivedAt:latest.receivedAt
  };
}

function massiveCandles(data:any):Candle[]{if(!Array.isArray(data?.results))throw new Error('Massive XAUUSD schema');const parsed=data.results.map((v:any)=>({time:Number(v?.t),open:Number(v?.o),high:Number(v?.h),low:Number(v?.l),close:Number(v?.c)}));if(parsed.some((v:Candle)=>!Object.values(v).every(Number.isFinite)||v.time<=0||v.low<=0||v.high<v.low||v.open<v.low||v.open>v.high||v.close<v.low||v.close>v.high))throw new Error('Massive XAUUSD schema');return parsed.sort((a:Candle,b:Candle)=>a.time-b.time).filter((v:Candle,i:number,a:Candle[])=>i===0||v.time!==a[i-1].time);}
async function candlesFromMassive(apiKey:string,interval:'1m'|'5m'|'15m'|'1h'):Promise<Candle[]>{const cfg=interval==='1m'?{m:1,s:'minute',days:2}:interval==='5m'?{m:5,s:'minute',days:8}:interval==='15m'?{m:15,s:'minute',days:20}:{m:1,s:'hour',days:30};const to=new Date().toISOString().slice(0,10),from=new Date(Date.now()-cfg.days*86400000).toISOString().slice(0,10),url='https://api.massive.com/v2/aggs/ticker/C%3AXAUUSD/range/'+cfg.m+'/'+cfg.s+'/'+from+'/'+to+'?adjusted=true&sort=desc&limit=340&apiKey='+encodeURIComponent(apiKey),rows=massiveCandles(await getJson(url));if((interval==='1m'&&rows.length<80)||(interval!=='1m'&&rows.length<180))throw new Error('Massive XAUUSD history insufficient');return rows;}
async function quoteFromMassive(apiKey:string,now:number):Promise<QuoteData>{const data=await getJson('https://api.massive.com/v3/quotes/C%3AXAUUSD?order=desc&limit=1&sort=timestamp&apiKey='+encodeURIComponent(apiKey)),q=Array.isArray(data?.results)?data.results[0]:null,bid=num(q?.bid_price),ask=num(q?.ask_price);if(bid==null||ask==null||bid<=0||ask<bid)throw new Error('invalid Massive XAUUSD quote');const ns=Number(q?.participant_timestamp??q?.sip_timestamp??q?.timestamp),sourceTime=Number.isFinite(ns)&&ns>1e15?Math.floor(ns/1e6):Number.isFinite(ns)&&ns>1e12?ns:null;return{ok:true,symbol:'XAU/USD',price:(bid+ask)/2,source:'Massive · XAUUSD institutional FX',sourceTime,fetchedAt:now,status:goldStatusFor(sourceTime,now),previousClose:null,change:null,percentChange:null,bid,ask,spread:ask-bid};}
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
  const rt=getRuntimeEnv(),goldKey=rt.GOLD_API_KEY||rt.GOLDAPI_API_KEY||rt.GOLDAPI_TOKEN,twelveKey=rt.TWELVE_DATA_API_KEY,massiveKey=rt.MASSIVE_API_KEY||rt.POLYGON_API_KEY,errors:string[]=[];
  for(const provider of [massiveKey?()=>quoteFromMassive(massiveKey,now):null,twelveKey?()=>quoteFromTwelve(twelveKey,now):null,goldKey?()=>quoteFromGoldApi(goldKey,now):null,()=>quoteFromFreeGoldApi(now)]){if(!provider)continue;try{const value=await provider();externalQuoteCache={at:now,value};return value;}catch(e){errors.push(e instanceof Error?e.message:'provider error');}}
  throw new Error('QUOTE_SOURCE_ERROR: '+errors.join(' | ').slice(0,320));
}

let freeCalendarCache:Cache<Event[]>|null=null;
let officialCalendarCache:Cache<Event[]>|null=null;
async function calendarFromFaireconomy():Promise<Event[]>{
  if(freeCalendarCache&&Date.now()-freeCalendarCache.at<300000)return freeCalendarCache.value;
  const data=await getJson('https://nfs.faireconomy.media/ff_calendar_thisweek.json',{'User-Agent':'Mozilla/5.0 AhmedGoldCommand/1.0'});
  if(!Array.isArray(data))throw new Error('calendar schema');
  const events:Event[]=data
    .filter((v:any)=>String(v?.country||'').toUpperCase()==='USD')
    .map((v:any,i:number):Event=>({
      id:'ff:'+String(v?.date||'')+':'+String(v?.title||i),
      time:Date.parse(String(v?.date||'')),
      name:String(v?.title||'USD event'),
      importance:String(v?.impact||'').toLowerCase()==='high'?3:String(v?.impact||'').toLowerCase()==='medium'?2:1,
      actual:String(v?.actual||''),
      forecast:String(v?.forecast||''),
      previous:String(v?.previous||''),
      source:'https://www.forexfactory.com/calendar',
      exactTime:true
    }))
    .filter((v:Event)=>Number.isFinite(v.time))
    .sort((a:Event,b:Event)=>a.time-b.time);
  const sunday=new Date();sunday.setUTCHours(0,0,0,0);sunday.setUTCDate(sunday.getUTCDate()-sunday.getUTCDay());
  if(!events.some(e=>e.time>=sunday.getTime()))throw new Error('calendar export is from a previous week');
  freeCalendarCache={at:Date.now(),value:events};return events;
}
function calendarImportance(name:string){
  if(/employment situation|consumer price index|producer price index|\bCPI\b|\bPPI\b|gross domestic product|personal income and outlays/i.test(name))return 3;
  if(/job openings|JOLTS|employment cost index|productivity|real earnings|import and export prices|international trade|corporate profits/i.test(name))return 2;
  return 1;
}
function icsText(v:string){return v.replace(/\\n/gi,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim();}
function zonedLocalToUtc(raw:string,timeZone:string){
  const m=raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);if(!m)return NaN;
  const wanted=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  let guess=wanted;
  for(let k=0;k<2;k++){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
    const p:Record<string,string>={};for(const x of parts)if(x.type!=='literal')p[x.type]=x.value;
    const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    guess+=wanted-shown;
  }
  return guess;
}
function icsDate(line:string){
  const i=line.indexOf(':');if(i<0)return NaN;
  const meta=line.slice(0,i),raw=line.slice(i+1).trim();
  if(/^\d{8}T\d{6}Z$/.test(raw))return Date.UTC(+raw.slice(0,4),+raw.slice(4,6)-1,+raw.slice(6,8),+raw.slice(9,11),+raw.slice(11,13),+raw.slice(13,15));
  const tz=meta.match(/TZID=([^;:]+)/i)?.[1]||'America/New_York';
  return zonedLocalToUtc(raw,tz);
}
function parseBlsIcs(text:string,now:number):Event[]{
  const unfolded=text.replace(/\r?\n[ \t]/g,''),blocks=unfolded.split('BEGIN:VEVENT').slice(1).map(x=>x.split('END:VEVENT')[0]);
  return blocks.map((block,i)=>{
    const lines=block.split(/\r?\n/),dateLine=lines.find(x=>x.startsWith('DTSTART')),summaryLine=lines.find(x=>x.startsWith('SUMMARY:'));
    const time=dateLine?icsDate(dateLine):NaN,name=summaryLine?icsText(summaryLine.slice(8)):'BLS release';
    return {id:'bls:'+String(time)+':'+i,time,name,importance:calendarImportance(name),actual:'',forecast:'',previous:'',source:'https://www.bls.gov/schedule/news_release/',exactTime:true} as Event;
  }).filter(e=>Number.isFinite(e.time)&&e.time>=now-86400000&&e.time<=now+120*86400000);
}
async function calendarFromOfficialUS(now=Date.now()):Promise<Event[]>{
  if(officialCalendarCache&&now-officialCalendarCache.at<6*3600000)return officialCalendarCache.value;
  const all:Event[]=[];
  try{
    const ics=await getText('https://www.bls.gov/schedule/news_release/bls.ics',{'User-Agent':'Mozilla/5.0 AhmedGoldCommand/1.0','Accept':'text/calendar,text/plain;q=0.9,*/*;q=0.8'});
    all.push(...parseBlsIcs(ics,now));
  }catch{}
  try{
    const data=await getJson('https://apps.bea.gov/API/signup/release_dates.json',{'User-Agent':'Mozilla/5.0 AhmedGoldCommand/1.0'});
    for(const [name,row] of Object.entries(data||{})){
      const dates=Array.isArray((row as any)?.release_dates)?(row as any).release_dates:[];
      for(const raw of dates){
        const time=Date.parse(String(raw));
        if(!Number.isFinite(time)||time<now-86400000||time>now+120*86400000)continue;
        all.push({id:'bea:'+name+':'+String(time),time,name,importance:calendarImportance(name),actual:'',forecast:'',previous:'',source:'https://www.bea.gov/news/schedule',exactTime:true});
      }
    }
  }catch{}
  const seen=new Set<string>(),events=all.filter(e=>{const key=e.name+'|'+e.time;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.time-b.time);
  if(!events.length)throw new Error('official US calendars unavailable');
  officialCalendarCache={at:now,value:events};return events;
}
async function backgroundFromTwelve(apiKey:string):Promise<BackgroundPoint[]>{const now=Date.now(),rt=getRuntimeEnv();if(backgroundCache&&now-backgroundCache.at<BACKGROUND_TTL_MS)return backgroundCache.value;const defs=[{key:'dxy' as const,label:'DXY',symbol:String(rt.BACKGROUND_DXY_SYMBOL||'DXY')},{key:'us2y' as const,label:'US 2Y',symbol:String(rt.BACKGROUND_US2Y_SYMBOL||'US02Y')},{key:'us10y' as const,label:'US 10Y',symbol:String(rt.BACKGROUND_US10Y_SYMBOL||'US10Y')}];const values=await Promise.all(defs.map(async d=>{try{const data=await getJson('https://api.twelvedata.com/quote?symbol='+encodeURIComponent(d.symbol),{Authorization:`apikey ${apiKey}`}),value=num(data?.close??data?.price),sourceTime=sourceTimeMs(data);if(value==null)throw new Error('no value');return{...d,value,change:num(data?.change),percentChange:num(data?.percent_change),sourceTime,status:statusFor(sourceTime,now),source:'Twelve Data'} as BackgroundPoint;}catch{return{...d,value:null,change:null,percentChange:null,sourceTime:null,status:'unavailable',source:'Twelve Data'} as BackgroundPoint;}}));backgroundCache={at:now,value:values};return values;}

export async function getMarketData(options:{force?:boolean}={}):Promise<MarketData>{
  const now=Date.now(),mt5CandlesNow=usableMt5Candles(now);
  if(!options.force&&marketCache&&now-marketCache.at<MARKET_TTL_MS){const cachedMt5=String(marketCache.value.priceSource||'').startsWith('Exness/MT5');if(Boolean(mt5CandlesNow)===cachedMt5)return marketCache.value;}
  const rt=getRuntimeEnv(),priceKey=rt.TWELVE_DATA_API_KEY,massiveKey=rt.MASSIVE_API_KEY||rt.POLYGON_API_KEY,calendarKey=rt.TRADING_ECONOMICS_API_KEY,result:MarketData={checkedAt:now,pricesReady:false,newsReady:false,backgroundReady:false,c1:[],c5:[],c15:[],c60:[],events:[],background:[],errors:[],priceSource:'unavailable'};
  if(!calendarKey)result.errors.push('Trading Economics غير مربوط؛ سيستخدم النظام تقويم USD المجاني كبديل.');
  const jobs:Promise<void>[]=[];
  jobs.push((async()=>{if(mt5CandlesNow){result.c1=mt5CandlesNow.c1;result.c5=mt5CandlesNow.c5;result.c15=mt5CandlesNow.c15;result.c60=mt5CandlesNow.c60;result.pricesReady=true;result.priceSource=`Exness/MT5 · ${getMt5BridgeStatus(now).status?.symbol||'broker'}`;return;}if(massiveKey){try{const[m1,m5,m15,h1]=await Promise.all([candlesFromMassive(massiveKey,'1m'),candlesFromMassive(massiveKey,'5m'),candlesFromMassive(massiveKey,'15m'),candlesFromMassive(massiveKey,'1h')]);result.c1=m1;result.c5=m5;result.c15=m15;result.c60=h1;result.pricesReady=true;result.priceSource='Massive · C:XAUUSD';return;}catch{result.errors.push('Massive XAUUSD غير متاح/غير مصرح للخطة؛ تجربة مصدر الذهب التالي.');}}if(priceKey){try{const base='https://api.twelvedata.com/time_series?symbol=XAU%2FUSD&outputsize=340&timezone=UTC&apikey='+encodeURIComponent(priceKey),[m1,m5,m15,h1]=await Promise.all([getJson(base+'&interval=1min'),getJson(base+'&interval=5min'),getJson(base+'&interval=15min'),getJson(base+'&interval=1h')]);result.c1=candles(m1);result.c5=candles(m5);result.c15=candles(m15);result.c60=h1;result.pricesReady=true;result.priceSource='Twelve Data · XAU/USD';return;}catch{result.errors.push('Twelve Data XAU/USD غير متاح مؤقتاً.');}}try{const[m1,m5,m15,h1]=await Promise.all([candlesFromYahoo('1m'),candlesFromYahoo('5m'),candlesFromYahoo('15m'),candlesFromYahoo('1h')]);result.c1=m1;result.c5=m5;result.c15=m15;result.c60=h1;result.pricesReady=true;result.priceSource='Yahoo Finance · COMEX GC=F proxy';result.errors.push('الشموع من عقود COMEX GC=F احتياطي تحليلي فقط وليست سعر تنفيذ XAUUSD.');return;}catch{result.errors.push('Yahoo GC=F غير متاح مؤقتاً.');}result.errors.push('تعذر الحصول على شموع MT5/Massive/Twelve Data/Yahoo للذهب.');})());
  if(priceKey)jobs.push((async()=>{try{result.background=await backgroundFromTwelve(priceKey);result.backgroundReady=result.background.filter(x=>x.value!=null&&x.status!=='unavailable').length>=2;if(!result.backgroundReady)result.errors.push('DXY والعوائد غير مكتملة؛ تستخدم كـConfirmation فقط ولن توقف الإشارة.');}catch{result.background=[];result.errors.push('تعذر تحديث DXY والعوائد؛ لن تستخدم في القرار.');}})());
  jobs.push((async()=>{
    const collected:Event[]=[];
    if(calendarKey){try{
      const start=new Date(now-86400000).toISOString().slice(0,10),end=new Date(now+30*86400000).toISOString().slice(0,10);
      const data=await getJson('https://api.tradingeconomics.com/calendar/country/united%20states/'+start+'/'+end+'?c='+encodeURIComponent(calendarKey)+'&f=json');
      if(!Array.isArray(data)||!data.length)throw new Error('empty');
      collected.push(...data.map((v:any):Event=>({id:String(v.CalendarId),time:utc(v.Date),name:String(v.Event),importance:Number(v.Importance),actual:String(v.Actual||''),forecast:String(v.Forecast||''),previous:String(v.Previous||''),source:String(v.SourceURL||''),exactTime:String(v.DateSpan)==='0'})).filter((v:Event)=>Number.isFinite(v.time)&&[1,2,3].includes(v.importance)));
    }catch{result.errors.push('Trading Economics غير متاح؛ تم التحويل إلى المصادر المجانية.');}}
    try{collected.push(...await calendarFromFaireconomy());}catch{result.errors.push('تقويم USD الأسبوعي غير متاح/قديم؛ تم تجاهله.');}
    try{collected.push(...await calendarFromOfficialUS(now));}catch{result.errors.push('تعذر الوصول إلى جزء من جداول BLS/BEA الرسمية.');}
    const merged=new Map<string,Event>();
    for(const e of collected){
      const key=e.name.toLowerCase().replace(/\s+/g,' ').trim()+'|'+Math.round(e.time/3600000);
      const prev=merged.get(key);
      if(!prev||(!prev.actual&&e.actual)||(!prev.forecast&&e.forecast)||e.source.includes('bls.gov')||e.source.includes('bea.gov'))merged.set(key,e);
    }
    result.events=[...merged.values()].filter(e=>e.time>=now-86400000&&e.time<=now+120*86400000).sort((a,b)=>a.time-b.time);
    result.newsReady=result.events.some(e=>e.time>=now-86400000);
    if(!result.newsReady)result.errors.push('لم يتم العثور على مواعيد اقتصادية حديثة بعد دمج المصادر.');
  })());
  await Promise.all(jobs);result.checkedAt=Date.now();marketCache={at:result.checkedAt,value:result};return result;
}
export async function getMarketSnapshot(){const[market,quote]=await Promise.all([getMarketData(),getQuoteData().catch(()=>null)]);return{ok:true,checkedAt:Date.now(),market,quote,mt5:getMt5BridgeStatus()};}
