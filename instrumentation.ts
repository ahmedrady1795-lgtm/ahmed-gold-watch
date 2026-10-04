declare global {
  // eslint-disable-next-line no-var
  var __predatorLearningLoopStarted: boolean | undefined;
}

export async function register(){
  if(process.env.NEXT_RUNTIME==='edge')return;
  if(process.env.PREDATOR_BACKGROUND_LEARNING==='false')return;
  if(globalThis.__predatorLearningLoopStarted)return;
  globalThis.__predatorLearningLoopStarted=true;

  const port=process.env.PORT||'3000';
  const url='http://127.0.0.1:'+port+'/api/ai-analysis';

  const tick=async()=>{
    try{
      const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(25000),headers:{'x-predator-background':'1'}});
      if(!r.ok)console.warn('[PREDATOR-LEARN] background cycle HTTP',r.status);
      else{
        const j=await r.json().catch(()=>null);
        const btc=j?.bitcoin?.selfEvolution,gold=j?.gold?.selfEvolution;
        console.info('[PREDATOR-LEARN]',JSON.stringify({model:j?.model,btcGeneration:btc?.generation,btcPromoted:btc?.promoted,btcRollback:btc?.rolledBack,goldGeneration:gold?.generation,goldPromoted:gold?.promoted,goldRollback:gold?.rolledBack}));
      }
    }catch(e){
      console.warn('[PREDATOR-LEARN] cycle failed',e instanceof Error?e.message:'unknown');
    }
  };

  const first=setTimeout(()=>{void tick();},20000);
  first.unref?.();
  const timer=setInterval(()=>{void tick();},60000);
  timer.unref?.();
}
