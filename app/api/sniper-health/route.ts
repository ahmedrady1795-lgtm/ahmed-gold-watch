import {getAiSnapshot} from '../../../lib/ai-snapshot-cache';
import {getSniperAudit} from '../../../lib/sniper-audit-store';
import {aiRateLimitState} from '../../../lib/ai-service-backoff';

export const dynamic='force-dynamic';
export const runtime='nodejs';

/**
 * Cheap, read-only diagnostic of the *existing* Render deployment.
 * Unlike /api/live it does not declare an unhealthy AI to be a dead web
 * server. Never call outside providers or authorize broker trades here.
 */
export async function GET(){
  const now=Date.now();
  try{
    const snapshot=getAiSnapshot(now);
    const payload=snapshot.payload;
    const observedAt=Number(payload?.checkedAt||0);
    const ageMs=observedAt>0&&now>=observedAt?now-observedAt:null;
    const snapshotFresh=Boolean(payload?.ok===true&&ageMs!=null&&ageMs<=90000);
    const readiness=payload?.autopilot?.aiReadiness;
    const audit=getSniperAudit(now);
    const auditAge=audit.updatedAt>0&&now>=audit.updatedAt?now-audit.updatedAt:null;
    const auditFresh=Boolean(audit.ok&&auditAge!=null&&auditAge<=90000);
    const detail=(asset:'GOLD'|'BTC')=>({
      scenario:audit.current[asset]?.status??'NONE',
      watchFresh:Boolean(audit.watch[asset]?.updatedAt>0&&
        now>=audit.watch[asset].updatedAt&&
        now-audit.watch[asset].updatedAt<=90000),
      waitReason:audit.block[asset]||null
    });
    return Response.json({
      ok:true,checkedAt:now,operational:snapshotFresh&&auditFresh,
      snapshot:{fresh:snapshotFresh,ageMs,generation:snapshot.generation},
      ai:{mode:snapshotFresh?(readiness?.mode??'UNKNOWN'):'STALE',
        readyCount:snapshotFresh?Number(readiness?.readyCount||0):0,
        configuredCount:snapshotFresh?Number(readiness?.configuredCount||0):0,
        failures:snapshotFresh?(readiness?.activeFailures||[]):[],
        modelsReady:snapshotFresh&&readiness?.readyCount===readiness?.configuredCount&&
          Number(readiness?.configuredCount||0)>0,
        // Transport recovery and statistically validated directional edge are
        // separate conditions. These fields report 429 only, never returns URLs.
        throttles:{
          ml:aiRateLimitState(process.env.ML_ENGINE_URL,now),
          neural:process.env.NEURAL_ENABLED==='0'?
            aiRateLimitState(undefined,now):
            aiRateLimitState(process.env.NEURAL_ENGINE_URL,now)
        }},
      audit:{fresh:auditFresh,ageMs:auditAge,persistence:audit.persistence,
        durable:audit.persistence==='VOLUME'},
      gold:detail('GOLD'),bitcoin:detail('BTC'),
      note:'Research and paper tracking only. This diagnostic is not a broker entry or profit certification.'
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    return Response.json({ok:false,operational:false,
      message:'Sniper diagnostic unavailable, web server health is separate'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
