import type {Candle} from './engine';

type BtcMarket={c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[];source:string;checkedAt:number};
let cache:{at:number;value:BtcMarket}|null=null;
let longM1Cache:{at:number;value:Candle[]}|null=null;

async function json(url:string){
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});
  const j=await r.json();
  if(!r.ok)throw new Error('HTTP '+r.status);
  return j;
}
function normalize(rows:any[]):Candle[]{
  const out=rows.map((r:any)=>({time:Number(r[0])*1000,low:Number(r[1]),high:Number(r[2]),open:Number(r[3]),close:Number(r[4]),realVolume:Number(r[5]||0)}))
    .filter((c:Candle)=>Number.isFinite(c.time)&&Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&Number.isFinite(c.close)&&c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close))
    .sort((a:Candle,b:Candle)=>a.time-b.time);
  return out.filter((c,i)=>i===0||c.time!==out[i-1].time);
}
function latestClosedAge(c:Candle[],ms:number,now:number){
  const last=c.filter(x=>x.time+ms<=now).at(-1);
  return last?Math.max(0,now-(last.time+ms)):Infinity;
}
function assertFresh(c1:Candle[],c5:Candle[],c15:Candle[],c60:Candle[],now:number,provider:string){
  const ages={m1:latestClosedAge(c1,60000,now),m5:latestClosedAge(c5,300000,now),m15:latestClosedAge(c15,900000,now),h1:latestClosedAge(c60,3600000,now)};
  if(ages.m1>150000||ages.m5>480000||ages.m15>1200000||ages.h1>4500000)throw new Error(provider+' stale candles');
  return ages;
}
async function coinbase(granularity:number,start?:number,end?:number){
  const q=new URLSearchParams({granularity:String(granularity)});
  if(Number.isFinite(start)&&Number.isFinite(end)){
    q.set('start',new Date(Number(start)).toISOString());
    q.set('end',new Date(Number(end)).toISOString());
  }
  const rows=await json('https://api.exchange.coinbase.com/products/BTC-USD/candles?'+q.toString());
  if(!Array.isArray(rows))throw new Error('coinbase schema');
  const c=normalize(rows);
  if(c.length<40)throw new Error('coinbase insufficient');
  return c;
}
async function coinbaseLongM1(now:number,latest:Candle[]){
  if(longM1Cache&&now-longM1Cache.at<10*60*1000&&longM1Cache.value.length>=500){
    const merged=normalize([...longM1Cache.value,...latest].map(x=>[x.time/1000,x.low,x.high,x.open,x.close]));
    return merged.slice(-900);
  }
  try{
    const step=290*60*1000;
    const end1=now-285*60*1000,start1=end1-step;
    const end2=start1-60*1000,start2=end2-step;
    const [older1,older2]=await Promise.all([coinbase(60,start1,end1),coinbase(60,start2,end2)]);
    const merged=normalize([...older2,...older1,...latest].map(x=>[x.time/1000,x.low,x.high,x.open,x.close])).slice(-900);
    if(merged.length>=500)longM1Cache={at:now,value:merged};
    return merged;
  }catch{
    return latest;
  }
}
async function kraken(interval:number){
  const j=await json('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval='+interval);
  const result=j?.result||{},key=Object.keys(result).find(k=>k!=='last'),rows=key?result[key]:null;
  if(!Array.isArray(rows))throw new Error('kraken schema');
  const out=rows.map((r:any)=>({time:Number(r[0])*1000,open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),realVolume:Number(r[6]||0)} as Candle))
    .filter((c:Candle)=>Number.isFinite(c.time)&&Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&Number.isFinite(c.close)&&c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close))
    .sort((a:Candle,b:Candle)=>a.time-b.time)
    .filter((c:Candle,i:number,a:Candle[])=>i===0||c.time!==a[i-1].time);
  if(out.length<220)throw new Error('kraken insufficient');
  return out.slice(-300);
}
export async function getBtcMarket(force=false):Promise<BtcMarket>{
  const now=Date.now();
  if(!force&&cache&&now-cache.at<5000)return cache.value;
  try{
    const [latest1,c5,c15,c60]=await Promise.all([coinbase(60),coinbase(300),coinbase(900),coinbase(3600)]);
    if(c5.length<220||c15.length<220||c60.length<220)throw new Error('coinbase history short');
    const c1=await coinbaseLongM1(now,latest1);
    assertFresh(c1,c5,c15,c60,now,'Coinbase');
    const value={c1,c5,c15,c60,source:'Coinbase BTC-USD · extended M1',checkedAt:now};cache={at:now,value};return value;
  }catch{}
  const [c1,c5,c15,c60]=await Promise.all([kraken(1),kraken(5),kraken(15),kraken(60)]);
  if(c5.length<220||c15.length<220||c60.length<220)throw new Error('BTC history unavailable');
  assertFresh(c1,c5,c15,c60,now,'Kraken');
  const value={c1,c5,c15,c60,source:'Kraken XBT/USD · fresh-candle fallback',checkedAt:now};cache={at:now,value};return value;
}
