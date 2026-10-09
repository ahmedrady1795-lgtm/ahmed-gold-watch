const DEFAULT_URL='https://ahmed-gold-watch-production.up.railway.app/api/ai-analysis';
const target=process.env.AI_ANALYSIS_URL||DEFAULT_URL;
const intervalMs=Math.max(2500,Math.min(60000,Number(process.env.LEARNING_INTERVAL_MS||3000)));
const requestTimeoutMs=Math.max(8000,Math.min(45000,Number(process.env.LEARNING_TIMEOUT_MS||30000)));

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

// Independent 24/7 paper-only scalp heartbeat. The heavyweight learning
// analysis cannot be relied upon to sample every <=10 seconds: its network
// and model jobs run sequentially and can be slow. This loop does not place
// real trades; /api/scalp owns all fresh-quote, hold, cost and paper gates.
// One in-flight request at a time, with configurable shutoff/backpressure.
const scalpEnabled=process.env.SCALP_PULSE_ENABLED!=='0';
const scalpTarget=process.env.SCALP_PULSE_URL||new URL('/api/scalp',target).toString();
const scalpIntervalMs=Math.max(3000,Math.min(30000,Number(process.env.SCALP_PULSE_INTERVAL_MS||5000)));
const scalpTimeoutMs=Math.max(5000,Math.min(30000,Number(process.env.SCALP_PULSE_TIMEOUT_MS||15000)));
async function scalpLoop(){
  let ticks=0,errors=0,lastHealthyAt=0;
  const lastLaneState=new Map();
  while(true){
    const start=Date.now();
    ticks++;
    try{
      const res=await fetch(scalpTarget,{
        cache:'no-store',
        headers:{'User-Agent':'Ahmed-Scalp-Pulse/1.0','X-Scalp-Pulse':'paper-monitor'},
        signal:AbortSignal.timeout(scalpTimeoutMs)
      });
      const payload=await res.json().catch(()=>null);
      if(!res.ok||!payload?.ok)throw new Error('HTTP '+res.status+' '+String(payload?.message||'scalp_unavailable'));
      lastHealthyAt=Date.now();
      for(const [asset,node] of [['GOLD',payload.gold],['BTC',payload.bitcoin]]){
        for(const entry of node?.entryConfirmations||[]){
          const key=asset+':'+entry.horizon;
          const current=String(entry.state||'WATCH');
          if((current==='ENTRY'||current==='ACTIVE')&&lastLaneState.get(key)!==current){
            console.log(JSON.stringify({tag:'SCALP-PULSE',status:'paper-state',
              asset,horizon:entry.horizon,state:current,
              checkedAt:Number(payload.checkedAt||start),
              brokerExecution:false}));
          }
          lastLaneState.set(key,current);
        }
      }
      if(ticks%24===0){
        const compact=(node)=>({
          confirmed:(node?.entryConfirmations||[]).filter(x=>x.state==='ENTRY').length,
          active:(node?.ledger?.lanes||[]).filter(x=>x.current?.state==='ACTIVE').length,
          settled:(node?.ledger?.lanes||[]).map(x=>({h:x.horizon,n:x.stats?.samples,netR:x.stats?.netR}))
        });
        console.log(JSON.stringify({tag:'SCALP-PULSE',status:'healthy',
          ticks,errors,lastHealthyAt,durationMs:Date.now()-start,
          gold:compact(payload.gold),btc:compact(payload.bitcoin),
          brokerExecution:false}));
      }
    }catch(e){
      errors++;
      // Do not flood logs on a short provider hiccup; unexpected outages
      // remain visible via error counters and every tenth failed request.
      if(errors<=3||errors%10===0)console.error(JSON.stringify({
        tag:'SCALP-PULSE',status:'error',ticks,errors,
        durationMs:Date.now()-start,
        error:e instanceof Error?e.message:String(e)
      }));
    }
    // Start-to-start cadence without overlapping calls. Slow responses are
    // never counted as extra evidence of fresh prices or a completed hold.
    await sleep(Math.max(300,scalpIntervalMs-(Date.now()-start)));
  }
}
if(scalpEnabled)void scalpLoop();

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

console.log(JSON.stringify({tag:'LEARNING-WORKER',status:'started',target,intervalMs,requestTimeoutMs,scalpEnabled,scalpTarget:scalpEnabled?scalpTarget:null,scalpIntervalMs:scalpEnabled?scalpIntervalMs:null,pid:process.pid}));
while(true){
  await runCycle();
  const penalty=failCount>0&&Date.now()-lastOk>120000?Math.min(30000,failCount*2000):0;
  await sleep(intervalMs+penalty);
}
