import {startServerTickBrain} from './lib/server-tick-brain';

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

  const first=setTimeout(()=>{void tick();},20000);
  first.unref?.();
  const timer=setInterval(()=>{void tick();},60000);
  timer.unref?.();
}
