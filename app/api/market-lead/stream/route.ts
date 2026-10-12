import {getMt5FastSignal,subscribeMt5BridgeUpdates} from '../../../../lib/market-hub';
import {updateGoldMarketLead} from '../../../../lib/market-lead-ai';
import {getServerTickSignal,startServerTickBrain} from '../../../../lib/server-tick-brain';

export const dynamic='force-dynamic';
startServerTickBrain();

export async function GET(){
  const encoder=new TextEncoder();
  let cleanup:()=>void=()=>{};
  const stream=new ReadableStream({
    start(controller){
      let closed=false;
      const send=(payload:any,event='lead')=>{
        if(closed)return;
        try{
          controller.enqueue(encoder.encode('event: '+event+'\n'+'data: '+JSON.stringify(payload)+'\n\n'));
        }catch{closed=true;}
      };
      const push=()=>{
        const now=Date.now();
        const fast=getMt5FastSignal(now);
        const lead=updateGoldMarketLead(fast,now,getServerTickSignal('GOLD',now));
        send(lead);
      };
      // Send current state immediately, then every new MT5 update is pushed directly.
      push();
      const unsubscribe=subscribeMt5BridgeUpdates(()=>push());
      const heartbeat=setInterval(()=>{push();send({at:Date.now()},'ping');},1500);
      cleanup=()=>{
        if(closed)return;
        closed=true;
        clearInterval(heartbeat);
        unsubscribe();
        try{controller.close();}catch{}
      };
    },
    cancel(){cleanup();}
  });
  return new Response(stream,{
    headers:{
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no'
    }
  });
}
