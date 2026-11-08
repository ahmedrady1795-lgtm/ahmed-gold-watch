import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMt5BtcVerifiedSnapshot} from '../../../../lib/mt5-btc-readonly';
import {planBtcDemoMarket,formatBtcDemoMarketWire} from '../../../../lib/mt5-btc-demo-market-plan';
import {recordBtcDemoMarketDecision} from '../../../../lib/mt5-btc-demo-market-diagnostics';

export const dynamic='force-dynamic';
export const runtime='nodejs';

function equalSecret(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function reply(body:string,code=200){
  return new Response(body,{status:code,headers:{
    'Content-Type':'text/plain; charset=utf-8',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'
  }});
}
// Server never places a trade. Separate explicit demo-market opt-in is
// independent of the old pending-LIMIT feature flag and of all live flags.
export async function GET(request:Request){
  const env=getRuntimeEnv();
  const token=env.MT5_BRIDGE_TOKEN;
  const auth=request.headers.get('authorization')||'';
  if(!token||!auth.startsWith('Bearer ')||!equalSecret(auth.slice(7),token))
    return reply('QBTCM1|WAIT|UNAUTHORIZED\n',401);
  if(env.MT5_BTC_DEMO_MARKET_SIGNALS_ENABLED!=='true')
    return reply('QBTCM1|WAIT|DEMO_MARKET_SIGNALS_DISABLED\n');
  const now=Date.now();
  const candidate=planBtcDemoMarket(getMt5BtcVerifiedSnapshot(now),now);
  recordBtcDemoMarketDecision(candidate,now);
  return reply(formatBtcDemoMarketWire(candidate));
}
