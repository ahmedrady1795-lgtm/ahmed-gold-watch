const DEFAULT_URL='https://ahmed-gold-watch-production.up.railway.app/api/ai-analysis';
const target=process.env.AI_ANALYSIS_URL||DEFAULT_URL;
const intervalMs=Math.max(2500,Math.min(60000,Number(process.env.LEARNING_INTERVAL_MS||3000)));
const requestTimeoutMs=Math.max(8000,Math.min(45000,Number(process.env.LEARNING_TIMEOUT_MS||30000)));

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let cycle=0,okCount=0,failCount=0,lastOk=0;

async function runCycle(){
  cycle++;
  const started=Date.now();
  const u=new URL(target);
  u.searchParams.set('worker','1');
  u.searchParams.set('cycle',String(cycle));
  u.searchParams.set('_',String(started));
  try{
    const r=await fetch(u,{
      cache:'no-store',
      headers:{'User-Agent':'Ahmed-Learning-Worker/1.0','X-Learning-Worker':'railway-24x7'},
      signal:AbortSignal.timeout(requestTimeoutMs)
    });
    const body=await r.json().catch(()=>null);
    if(!r.ok||!body?.ok)throw new Error('HTTP '+r.status+' '+String(body?.message||body?.detail||'analysis_failed'));
    okCount++;lastOk=Date.now();
    const gp=Number(body?.gold?.price);
    const bp=Number(body?.bitcoin?.price);
    const gSide=String(body?.gold?.zoneForecast?.pathForecast?.side||body?.gold?.nextMove?.side||'WAIT');
    const bSide=String(body?.bitcoin?.zoneForecast?.pathForecast?.side||body?.bitcoin?.nextMove?.side||'WAIT');
    console.log(JSON.stringify({
      tag:'LEARNING-WORKER',status:'ok',cycle,okCount,failCount,
      durationMs:Date.now()-started,
      gold:Number.isFinite(gp)?gp:null,goldSide:gSide,
      btc:Number.isFinite(bp)?bp:null,btcSide:bSide,
      checkedAt:Number(body?.checkedAt||Date.now())
    }));
  }catch(e){
    failCount++;
    console.error(JSON.stringify({
      tag:'LEARNING-WORKER',status:'error',cycle,okCount,failCount,
      durationMs:Date.now()-started,error:e instanceof Error?e.message:String(e)
    }));
  }
}

console.log(JSON.stringify({tag:'LEARNING-WORKER',status:'started',target,intervalMs,requestTimeoutMs,pid:process.pid}));
while(true){
  await runCycle();
  const penalty=failCount>0&&Date.now()-lastOk>120000?Math.min(30000,failCount*2000):0;
  await sleep(intervalMs+penalty);
}
