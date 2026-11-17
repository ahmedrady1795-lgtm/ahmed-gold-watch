import type {SentimentReading} from './sniper-market-context';
export function parseSentiment(asset:'GOLD'|'BTC',raw:unknown,now:number):SentimentReading{
 const result:SentimentReading={asset,kind:asset==='GOLD'?'VIX_DAILY':'CRYPTO_FEAR_GREED',
  value:null,asOf:null,source:asset==='GOLD'?'Cboe VIX daily close':'Alternative.me',available:false};
 if(asset==='GOLD'&&typeof raw==='string'){
  // Official daily close, never advertised as an intraday GOLD fear index.
  const rows=raw.trim().split(/\r?\n/).slice(1);
  for(const row of rows){
   const [date,,,,close]=row.split(',');
   if(!/^\d{2}\/\d{2}\/\d{4}$/.test(date||''))continue;
   const [m,d,y]=date.split('/').map(Number);
   // Available only after that US session has ended, conservatively 22:00 UTC.
   const at=Date.UTC(y,m-1,d,22),value=Number(close);
   if(close?.trim()&&Number.isFinite(value)&&value>0&&value<=100&&at<=now&&
     now-at<=4*86400000&&at>(result.asOf??0))Object.assign(result,{value,asOf:at,available:true});
  }
 }else if(asset==='BTC'){
  const item=(raw as any)?.data?.[0];
  const value=Number(item?.value),at=Number(item?.timestamp)*1000;
  if(item?.value!=null&&String(item.value).trim()&&Number.isFinite(value)&&value>=0&&value<=100&&
    Number.isFinite(at)&&at>0&&at<=now&&now-at<=36*3600000)
    Object.assign(result,{value,asOf:at,available:true});
 }
 return result;
}
const cache=new Map<string,{at:number;value:SentimentReading}>();
const pending=new Map<string,Promise<SentimentReading>>();
export async function getMarketSentiment(asset:'GOLD'|'BTC'):Promise<SentimentReading>{
 const now=Date.now(),old=cache.get(asset);
 if(old&&now-old.at<15*60000)return old.value;
 const existing=pending.get(asset);if(existing)return existing;
 const job=(async()=>{
  let value=parseSentiment(asset,null,now);
  try{
   const url=asset==='GOLD'?'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv':
    'https://api.alternative.me/fng/?limit=1';
   const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(4500)});
   if(r.ok)value=parseSentiment(asset,asset==='GOLD'?await r.text():await r.json(),Date.now());
  }catch{/* Unknown stays unknown. Price analysis remains available. */}
  cache.set(asset,{at:Date.now(),value});return value;
 })().finally(()=>pending.delete(asset));
 pending.set(asset,job);return job;
}
