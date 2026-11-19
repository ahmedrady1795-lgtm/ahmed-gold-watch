import {readPaxgFlow,type PaxgFlow} from '../../../lib/paxg-flow';
import {spotBackoffMs} from '../../../lib/binance-cooldown';
export const dynamic='force-dynamic';
let cache:PaxgFlow|null=null;
let retryAt=0;
let pending:Promise<PaxgFlow>|null=null;
async function read(path:string){
 const response=await fetch('https://data-api.binance.vision/api/v3/'+path,{
   cache:'no-store',signal:AbortSignal.timeout(5000)});
 if(!response.ok){
   retryAt=Math.max(retryAt,Date.now()+spotBackoffMs(response.status,response.headers.get('retry-after')));
   throw new Error('Binance unavailable');
 }
 const serverTime=Date.parse(response.headers.get('date')||'');
 if(!Number.isFinite(serverTime)||Math.abs(Date.now()-serverTime)>10000)
   throw new Error('Old Binance snapshot');
 return response.json();
}
async function sample():Promise<PaxgFlow>{
 try{
   const [book,trades]=await Promise.all([read('depth?symbol=PAXGUSDT&limit=5'),
     read('aggTrades?symbol=PAXGUSDT&limit=100')]);
   return readPaxgFlow(book,trades,Date.now());
 }catch{return {side:'UNAVAILABLE',tradeAt:0,observedAt:Date.now(),count:0};}
}
export async function GET(){
 if(!cache||Date.now()>=Math.max(cache.observedAt+5000,retryAt)){
   pending??=sample().then(result=>cache=result).finally(()=>{pending=null;});
   await pending;
 }
 return Response.json(cache,{headers:{'Cache-Control':'no-store'}});
}
