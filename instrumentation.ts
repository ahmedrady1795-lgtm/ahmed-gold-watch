import {startServerTickBrain} from './lib/server-tick-brain';
import {getNextMoveOutcome} from './lib/next-move-outcome';

declare global {
  // eslint-disable-next-line no-var
  var __predatorLearningLoopStarted: boolean | undefined;
}

export async function register(){
  if(process.env.NEXT_RUNTIME==='edge')return;
  startServerTickBrain();
  if(process.env.PREDATOR_BACKGROUND_LEARNING==='false')return;
  if(globalThis.__predatorLearningLoopStarted)return;
  globalThis.__predatorLearningLoopStarted=true;

  const port=process.env.PORT||'3000';
  const url='http://127.0.0.1:'+port+'/api/ai-analysis';
  let running=false;

  const tick=async()=>{
    if(running)return;
    running=true;
    try{
      const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(25000),headers:{'x-predator-background':'1'}});
      if(!r.ok)console.warn('[PREDATOR-LEARN] background cycle HTTP',r.status);
      else{
        const j=await r.json().catch(()=>null);
        const btc=j?.bitcoin?.selfEvolution,gold=j?.gold?.selfEvolution;
        console.info('[PREDATOR-LEARN]',JSON.stringify({model:j?.model,btcGeneration:btc?.generation,btcPromoted:btc?.promoted,btcRollback:btc?.rolledBack,goldGeneration:gold?.generation,goldPromoted:gold?.promoted,goldRollback:gold?.rolledBack}));
        if(j?.ok){
          try{
            const tg=await fetch('http://127.0.0.1:'+port+'/api/telegram/pulse',{
              method:'POST',
              cache:'no-store',
              headers:{'Content-Type':'application/json','x-predator-background':'1'},
              body:JSON.stringify({analysis:j}),
              signal:AbortSignal.timeout(12000)
            });
            const tj:any=await tg.json().catch(()=>null);
            if(!tg.ok)console.warn('[PREDATOR-TG] pulse HTTP',tg.status);
            else console.info('[PREDATOR-TG]',JSON.stringify({configured:Boolean(tj?.configured),enabled:Boolean(tj?.enabled),sent:Boolean(tj?.sent),reason:tj?.reason||null,minimumConfidence:tj?.minimumConfidence||null}));
          }catch(e){
            console.warn('[PREDATOR-TG] pulse failed',e instanceof Error?e.message:'unknown');
          }
        }
      }
    }catch(e){
      console.warn('[PREDATOR-LEARN] cycle failed',e instanceof Error?e.message:'unknown');
    }finally{
      running=false;
    }
  };

  const first=setTimeout(()=>{void tick();},10000);
  first.unref?.();
  const timer=setInterval(()=>{void tick();},30000);
  timer.unref?.();

  // Lightweight first-passage settlement: observe BTC price every 6s without rerunning the heavy AI stack.
  let settleBusy=false;
  const settleNextMove=async()=>{
    if(settleBusy)return;
    settleBusy=true;
    try{
      const r=await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker',{
        cache:'no-store',signal:AbortSignal.timeout(4500),
        headers:{'User-Agent':'Predator-NextMove-Settlement/1.0'}
      });
      const j:any=await r.json().catch(()=>null),price=Number(j?.price);
      if(r.ok&&Number.isFinite(price)&&price>0)getNextMoveOutcome('BTC',price,Date.now());
    }catch{}finally{settleBusy=false;}
  };
  const settleFirst=setTimeout(()=>{void settleNextMove();},7000);
  settleFirst.unref?.();
  const settleTimer=setInterval(()=>{void settleNextMove();},6000);
  settleTimer.unref?.();
}
