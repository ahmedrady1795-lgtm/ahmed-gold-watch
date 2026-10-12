import {getRuntimeEnv} from '../../../../lib/runtime';
import {getMt5BridgeStatus,getMt5FastSignal,setMt5BridgeStatus} from '../../../../lib/market-hub';
import {updateGoldMarketLead} from '../../../../lib/market-lead-ai';
export const dynamic='force-dynamic';
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function authorized(request:Request){const token=(getRuntimeEnv()).MT5_BRIDGE_TOKEN,auth=request.headers.get('authorization')||'';return Boolean(token&&auth.startsWith('Bearer ')&&safeEqual(auth.slice(7),token));}
export async function POST(request:Request){
  if(!authorized(request))return Response.json({ok:false,code:'UNAUTHORIZED'},{status:401});
  try{
    const body=await request.json();
    const status=setMt5BridgeStatus(body);
    const fast=getMt5FastSignal(Date.now());
    const lead=updateGoldMarketLead(fast,Date.now());
    return Response.json({
      ok:true,
      receivedAt:status.receivedAt,
      marketLead:{side:lead.side,stage:lead.stage,score:lead.score,confidence:lead.confidence,armed:lead.armed,stability:lead.stability}
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    return Response.json({ok:false,code:'BAD_MT5_STATUS',message:e instanceof Error?e.message:'invalid payload'},{status:400});
  }
}
export async function GET(){const s=getMt5BridgeStatus();return Response.json({ok:true,connected:s.connected,fresh:s.fresh,candlesFresh:s.candlesFresh,tickAgeMs:(s as any).tickAgeMs??null,bridgeAgeMs:(s as any).bridgeAgeMs??null,candlesAgeMs:(s as any).candlesAgeMs??null,status:s.status?{symbol:s.status.symbol,tickTimeMs:s.status.tickTimeMs,bid:s.status.bid,ask:s.status.ask,mode:s.status.mode,bridgeLatencyMs:s.status.bridgeLatencyMs,lastQuality:s.status.lastQuality,candleCounts:s.status.candles?{m1:s.status.candles.c1.length,m5:s.status.candles.c5.length,m15:s.status.candles.c15.length,h1:s.status.candles.c60.length}:null}:null},{headers:{'Cache-Control':'private, no-store'}});}
