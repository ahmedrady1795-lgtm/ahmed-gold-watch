import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMt5BtcStatus,setMt5BtcStatus} from '../../../../lib/mt5-btc-readonly';

export const dynamic='force-dynamic';
export const runtime='nodejs';

function safeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let n=0;
  for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);
  return n===0;
}
export async function POST(request:Request){
  const token=getRuntimeEnv().MT5_BRIDGE_TOKEN;
  const auth=request.headers.get('authorization')||'';
  if(!token||!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),token))
    return Response.json({ok:false,code:'UNAUTHORIZED'},{status:401});
  try{
    const incoming=await request.json();
    const received=setMt5BtcStatus(incoming);
    return Response.json({ok:true,receivedAt:Date.now(),symbol:received.status?.symbol,
      fresh:received.fresh,candlesFresh:received.candlesFresh},
      {headers:{'Cache-Control':'no-store'}});
  }catch{
    return Response.json({ok:false,code:'BAD_BTC_BROKER_STATUS'},
      {status:400,headers:{'Cache-Control':'no-store'}});
  }
}
export async function GET(){
  return Response.json({ok:true,executionEnabled:false,brokerSource:'Exness MT5 BTCUSD CFD',
    ...getMt5BtcStatus()},
    {headers:{'Cache-Control':'private, no-store'}});
}
