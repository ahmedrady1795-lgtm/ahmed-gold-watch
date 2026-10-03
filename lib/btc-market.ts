import type {Candle} from './engine';

type BtcMarket={c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[];source:string;checkedAt:number};
let cache:{at:number;value:BtcMarket}|null=null;

async function json(url:string){
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}});
  const j=await r.json();
  if(!r.ok)throw new Error('HTTP '+r.status);
  return j;
}
function normalize(rows:any[]):Candle[]{
  const out=rows.map((r:any)=>({time:Number(r[0])*1000,low:Number(r[1]),high:Number(r[2]),open:Number(r[3]),close:Number(r[4])}))
    .filter((c:Candle)=>Number.isFinite(c.time)&&Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&Number.isFinite(c.close)&&c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close))
    .sort((a:Candle,b:Candle)=>a.time-b.time);
  return out.filter((c,i)=>i===0||c.time!==out[i-1].time);
}
async function coinbase(granularity:number){
  const rows=await json('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity='+granularity);
  if(!Array.isArray(rows))throw new Error('coinbase schema');
  const c=normalize(rows);
  if(c.length<80)throw new Error('coinbase insufficient');
  return c;
}
async function binance(interval:string){
  const rows=await json('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval='+interval+'&limit=300');
  if(!Array.isArray(rows))throw new Error('binance schema');
  const out=rows.map((r:any)=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4])} as Candle))
    .filter((c:Candle)=>Number.isFinite(c.time)&&Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&Number.isFinite(c.close)&&c.low>0)
    .sort((a:Candle,b:Candle)=>a.time-b.time);
  if(out.length<80)throw new Error('binance insufficient');
  return out;
}
export async function getBtcMarket(force=false):Promise<BtcMarket>{
  const now=Date.now();
  if(!force&&cache&&now-cache.at<5000)return cache.value;
  try{
    const [c1,c5,c15,c60]=await Promise.all([coinbase(60),coinbase(300),coinbase(900),coinbase(3600)]);
    if(c5.length<220||c15.length<220||c60.length<220)throw new Error('coinbase history short');
    const value={c1,c5,c15,c60,source:'Coinbase BTC-USD',checkedAt:now};cache={at:now,value};return value;
  }catch{}
  const [c1,c5,c15,c60]=await Promise.all([binance('1m'),binance('5m'),binance('15m'),binance('1h')]);
  if(c5.length<220||c15.length<220||c60.length<220)throw new Error('BTC history unavailable');
  const value={c1,c5,c15,c60,source:'Binance BTCUSDT',checkedAt:now};cache={at:now,value};return value;
}
