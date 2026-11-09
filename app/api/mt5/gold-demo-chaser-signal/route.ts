import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMt5BridgeStatus} from '../../../../lib/market-hub';
import {GET as readGoldAmbushDemo} from '../scalp-demo/route';
import {decideGoldDemoSniperSignal,goldDemoSniperWire} from '../../../../lib/mt5-gold-demo-sniper-wire';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const plain=(wire:string,status=200)=>new Response(wire,{status,headers:{
  'Content-Type':'text/plain; charset=utf-8',
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff'
}});
function equalSecret(a:string,b:string){
  if(a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);
  return d===0;
}

// The endpoint uses the SAME real gold Ambush engine already visible in
// /api/mt5/scalp-demo, not the Candle Chaser's local M1 approximation.
// It only serves short-lived directions. The Exness EA submits protected
// pending STOP orders on a DEMO account; this route NEVER places orders.
export async function GET(request:Request){
  const token=getRuntimeEnv().MT5_BRIDGE_TOKEN;
  const auth=request.headers.get('authorization')||'';
  if(!token||!auth.startsWith('Bearer ')||!equalSecret(auth.slice(7),token))
    return plain('QGOLD1|WAIT|UNAUTHORIZED\n',401);
  const now=Date.now();
  const broker=getMt5BridgeStatus(now);
  if(!broker.fresh||!broker.candlesFresh||
     broker.status?.symbol!=='XAUUSDm')
    return plain('QGOLD1|WAIT|EXNESS_GOLD_BRIDGE_STALE\n');
  try{
    const result=await readGoldAmbushDemo(request);
    if(result.status!==200)
      return plain('QGOLD1|WAIT|SNIPER_ANALYSIS_UNAVAILABLE\n');
    const payload=await result.json();
    return plain(goldDemoSniperWire(
      decideGoldDemoSniperSignal(payload,Date.now(),broker.status.symbol)));
  }catch{
    return plain('QGOLD1|WAIT|SNIPER_ANALYSIS_ERROR\n');
  }
}
