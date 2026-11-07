import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMt5BtcVerifiedSnapshot} from '../../../../lib/mt5-btc-readonly';
import {formatBtcDemoWire,planBtcDemoLimit} from '../../../../lib/mt5-btc-demo-plan';

export const dynamic='force-dynamic';
export const runtime='nodejs';

function safeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);
  return v===0;
}
const plain=(body:string,status=200)=>new Response(body,{
  status,headers:{
    'Content-Type':'text/plain; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  }
});

export async function GET(request:Request){
  const env=getRuntimeEnv();
  const token=env.MT5_BRIDGE_TOKEN,auth=request.headers.get('authorization')||'';
  if(!token||!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),token))
    return plain('QBTC1|WAIT|UNAUTHORIZED\n',401);

  // Explicit opt-in independently from ANY live trading flag.
  if(env.MT5_BTC_DEMO_SIGNALS_ENABLED!=='true')
    return plain('QBTC1|WAIT|DEMO_SIGNALS_DISABLED\n');

  // Even an accidentally enabled global live-execution mode cannot authorize
  // this endpoint to issue demo instructions.
  const decision=planBtcDemoLimit(getMt5BtcVerifiedSnapshot());
  return plain(formatBtcDemoWire(decision));
}
