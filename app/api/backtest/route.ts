import {runBacktest,runWalkForward} from '../../../lib/backtest';
import {defaults,type Candle,type Rules} from '../../../lib/engine';
export const dynamic='force-dynamic';
function parseBinance(j:any):Candle[]{if(!Array.isArray(j))throw new Error('schema');return j.map((v:any)=>({time:Number(v?.[0]),open:Number(v?.[1]),high:Number(v?.[2]),low:Number(v?.[3]),close:Number(v?.[4])})).filter((c:Candle)=>Object.values(c).every(Number.isFinite)&&c.time>0&&c.low>0&&c.high>=c.low).sort((a:Candle,b:Candle)=>a.time-b.time);}
function clamp(v:string|null,min:number,max:number,fallback:number){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function fetchChunk(endTime?:number){
  const standard=new URLSearchParams({symbol:'XAUUSDT',interval:'5m',limit:'1200'}),continuous=new URLSearchParams({pair:'XAUUSDT',contractType:'PERPETUAL',interval:'5m',limit:'1200'});
  if(endTime){standard.set('endTime',String(endTime));continuous.set('endTime',String(endTime));}
  const urls=['https://fapi.binance.com/fapi/v1/klines?'+standard.toString(),'https://fapi.binance.com/fapi/v1/continuousKlines?'+continuous.toString()];
  let last='source unavailable';
  for(const url of urls){for(let attempt=0;attempt<2;attempt++){try{const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'AhmedGoldCommand/1.0'}}),j=await res.json();if(!res.ok||!Array.isArray(j))throw new Error(String(j?.msg||'HTTP '+res.status));const out=parseBinance(j);if(out.length)return out;throw new Error('empty history');}catch(e){last=e instanceof Error?e.message:'source unavailable';if(attempt===0)await sleep(250);}}}
  throw new Error(last);
}
async function deepHistory(chunks:number){
  const all:Candle[]=[];let end:number|undefined;
  for(let i=0;i<chunks;i++){try{const batch=await fetchChunk(end);if(!batch.length)break;all.push(...batch);end=batch[0].time-1;if(batch.length<1100)break;}catch(e){if(!all.length)throw e;break;}}
  const m=new Map<number,Candle>();for(const c of all)m.set(c.time,c);
  const out=[...m.values()].sort((a,b)=>a.time-b.time);if(out.length<800)throw new Error('history insufficient');return out;
}
export async function GET(request:Request){try{const q=new URL(request.url).searchParams,rules:Rules={...defaults,minScore:clamp(q.get('minScore'),70,90,defaults.minScore),adx:clamp(q.get('adx'),18,30,defaults.adx),spike:clamp(q.get('spike'),1.2,3,defaults.spike)},chunks=Math.round(clamp(q.get('chunks'),2,8,5)),spread=clamp(q.get('spread'),0,3,.45),slippage=clamp(q.get('slippage'),0,2,.12),candles=await deepHistory(chunks),options={spreadUsd:spread,slippageUsd:slippage},result=runBacktest(candles,rules,options),walkForward=runWalkForward(candles,rules,options);return Response.json({ok:true,checkedAt:Date.now(),strategyVersion:'3.1-binance-proxy-walkforward',rules,costs:{spreadUsd:spread,slippageUsd:slippage},history:{source:'Binance Futures XAUUSDT proxy',chunks,candles:candles.length,from:candles[0]?.time??null,to:candles.at(-1)?.time??null},result,walkForward},{headers:{'Cache-Control':'private, max-age=600'}});}catch(e){return Response.json({ok:false,message:'تعذر تشغيل الاختبار التاريخي الآن.',detail:e instanceof Error?e.message:'unknown'},{status:502});}}
