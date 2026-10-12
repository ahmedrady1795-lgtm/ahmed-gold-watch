import fs from 'node:fs';
import path from 'node:path';
import {buildSniperOutlook} from './sniper-outlook';
import {advanceScenario,scorecard,startScenario,terminal,type Scenario,type Asset} from './sniper-scorecard';
import {buildContinuousBias} from './continuous-direction';
import {analyzeFourHours} from './four-hour-structure';
import {advanceWatch,emptyWatch,type WatchMemory} from './sniper-watch';
import {evaluateSniperStrategies} from './sniper-strategies';

// Railway Gold Watch has an existing dedicated persistent volume at /data.
// /tmp fallback intentionally does NOT claim persistence across deploys.
const STORAGE='/data/predator-sniper-audit-v1.json';
const FALLBACK='/tmp/predator-sniper-audit-v1.json';
type AuditFile={version:1;scenarios:Scenario[];updatedAt:number;watch:Record<Asset,WatchMemory>;
  block:Record<Asset,string>;blockAt:Record<Asset,number>};
const blank=():AuditFile=>({version:1,scenarios:[],updatedAt:0,
  watch:{GOLD:emptyWatch(),BTC:emptyWatch()},block:{GOLD:'',BTC:''},blockAt:{GOLD:0,BTC:0}});
let memory:AuditFile|null=null,persisted=false,lastSave=0,dirty=false;

function load(refresh=false){
  // Next route bundles can hold independent module caches. A reader that
  // started before the worker must notice later file writes without a restart.
  if(memory&&(!refresh||dirty))return memory;
  for(const f of [STORAGE,FALLBACK]){
    try{
      const obj=JSON.parse(fs.readFileSync(f,'utf8'));
      if(obj?.version===1&&Array.isArray(obj.scenarios)){
        if(memory&&Number(obj.updatedAt||0)<=memory.updatedAt)return memory;
        const restore=(asset:Asset):WatchMemory=>{
          const saved=obj.watch?.[asset];
          return saved&&Array.isArray(saved.records)?{...emptyWatch(),...saved,records:saved.records.slice(-600)}:emptyWatch();
        };
        memory={version:1,scenarios:obj.scenarios.slice(-600),updatedAt:Number(obj.updatedAt||0),
          watch:{GOLD:restore('GOLD'),BTC:restore('BTC')},
          block:{GOLD:String(obj.block?.GOLD||'').slice(0,250),
            BTC:String(obj.block?.BTC||'').slice(0,250)},
          blockAt:{GOLD:Number(obj.blockAt?.GOLD||0),
            BTC:Number(obj.blockAt?.BTC||0)}};
        persisted=f===STORAGE;
        return memory;
      }
    }catch{}
  }
  memory=memory||blank();return memory;
}
function save(now:number,force=false){
  const state=load();
  if(!dirty||!force&&now-lastSave<5000)return;
  const file=fs.existsSync(path.dirname(STORAGE))?STORAGE:FALLBACK;
  try{
    const tmp=file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify({...state,updatedAt:now}));
    fs.renameSync(tmp,file);
    state.updatedAt=now;persisted=file===STORAGE;lastSave=now;dirty=false;
  }catch(e){
    persisted=false;
    console.warn('[SNIPER-AUDIT] Persist failed:',e instanceof Error?e.message:'IO');
  }
}
// Persist the actual no-entry reason so other Next.js route instances can show it.
function noteBlock(asset:Asset,reason:string,now:number){
  const state=load();
  if(state.block[asset]!==reason||now-state.blockAt[asset]>=30000){
    state.block[asset]=reason;state.blockAt[asset]=now;dirty=true;
  }
}
function latest(s:AuditFile,asset:Asset){
  return [...s.scenarios].reverse().find(r=>r.asset===asset)||null;
}
function candidate(asset:Asset,x:any,now:number,modelAt:number){
  const sniper=buildSniperOutlook(asset,x,null,now,modelAt);
  const v=sniper.view,targets=sniper.targets;
  const blockers:string[]=[];
  const strategy=evaluateSniperStrategies({frames:x?.chartHigherFrames,now,price:v.price,
    side:v.side,sourceReady:v.priceFresh&&v.forecastFresh,targets,stop:v.invalidation});
  if(!strategy.eligible)blockers.push('تأكيد الاستراتيجية: '+strategy.reason);
  const historical=scorecard(load().scenarios,asset);
  const priorT1=historical.targets[0];
  // An empirical circuit-breaker only after a meaningful audit sample.
  // It can DISABLE new forecasts; it must never inflate model confidence.
  if(priorT1.samples>=60&&priorT1.observedPct!=null&&priorT1.observedPct<50)
    blockers.push('توقف حماية: معدل الوصول للهدف الأول ضعيف في آخر السجل');
  if(!v.priceFresh||!v.forecastFresh)blockers.push('السعر أو التحليل متأخر');
  if(v.quality==='UNQUALIFIED')blockers.push('التحقق التاريخي من الاتجاه ضعيف');
  if(v.side==='WAIT')blockers.push('لا يوجد اتفاق اتجاه مؤهل');
  if(x?.forwardMove?.status==='STABILITY_HOLD')blockers.push('الإشارة السابقة محفوظة للمراقبة فقط');
  if(targets.length<2)blockers.push('محتاجين هدفين هيكليين مستقلين على الأقل');
  if(Number(targets[0]?.quality||0)<67)blockers.push('جودة الهدف الهيكلي الأول منخفضة');
  const confirms=x?.forwardMove?.confirmations||{};
  const support=[confirms.m5,confirms.m15,confirms.h4].filter(vote=>vote===v.side).length;
  if(support<2)blockers.push('مفيش تأكيد من فريمين متوسط/كبير');
  const invalid=v.invalidation,price=v.price;
  if(invalid==null||price==null||Math.abs(invalid-price)<=0)blockers.push('إبطال غير محدد');
  const rr=invalid!=null&&price!=null&&Math.abs(price-invalid)>0&&targets[0]?
    Math.abs(targets[0].price-price)/Math.abs(price-invalid):0;
  if(rr<1.35)blockers.push('العائد للمخاطرة دون 1.35');
  const meaningful=modelAt>0&&now-modelAt<=90000;
  if(!meaningful)blockers.push('لقطة النموذج غير حديثة');
  const produced=blockers.length===0&&v.side!=='WAIT'&&price!=null&&invalid!=null?
    startScenario({asset,side:v.side,at:now,modelAt,price,stop:invalid,
      confidence:Number(v.confidence||0),targets,durationMs:75*60000}):null;
  return {produced,blockers};
}
function runAsset(asset:Asset,x:any,modelAt:number,now:number){
  const state=load();
  let prior=latest(state,asset);
  if(prior&&prior.status==='ACTIVE'){
    const result=advanceScenario(prior,x?.chartCandles,now);
    if(JSON.stringify(result)!==JSON.stringify(prior)){
      const at=state.scenarios.findIndex(y=>y.id===prior!.id);
      if(at>=0){state.scenarios[at]=result;dirty=true;}
      prior=result;
    }
  }
  const fresh=Number(x?.chartCandles?.at?.(-1)?.time||0)+60000;
  const feedFresh=fresh>0&&now>=fresh&&now-fresh<=180000;
  if(!feedFresh){
    noteBlock(asset,'آخر شمعة M1 متأخرة؛ التقييم متوقف',now);
    return;
  }
  const next=candidate(asset,x,now,modelAt);
  // The visible reason must agree with the actual cooldown/active-entry gate.
  // No rapid-fire cycling from the same forecast. Keep 15-minute cooldown
  // after a settled/expired forecast; do not resurrect an old stop.
  const canStart=!prior||(terminal(prior.status)&&
    now-Math.max(prior.resolvedAt??prior.startedAt,prior.startedAt)>=15*60000&&
    modelAt>prior.modelAt+5*60000);
  noteBlock(asset,prior?.status==='ACTIVE'?
    'سيناريو مؤهل نشط بالفعل؛ لا نكرر الدخول':
    !canStart?'فترة تهدئة بعد آخر سيناريو؛ لا نفتح هدفًا جديدًا':
    next.blockers[0]||'شروط القناص الهيكلي مكتملة',now);
  if(canStart&&next.produced){
    state.scenarios.push(next.produced);
    if(state.scenarios.length>600)state.scenarios.splice(0,state.scenarios.length-600);
    dirty=true;
    console.info('[SNIPER-AUDIT] New',asset,next.produced.id,'targets',next.produced.targets.map(t=>t.price));
  }
}
// Closed-candle observation continues while expensive inference warms.
// It never starts ENTRY records or presents a candle close as a live tick.
export function updateStructuralWatchFromChart(payload:any,now=Date.now()){
  load(true);
  let changed=false;
  for(const asset of ['GOLD','BTC'] as const){
    const x=asset==='GOLD'?payload?.gold:payload?.bitcoin;
    const last=x?.chartCandles?.at(-1),price=Number(last?.close),closedAt=Number(last?.time||0)+60000;
    if(!last||!Number.isFinite(price)||price<=0||closedAt>now||now-closedAt>90000)continue;
    const previous=load().watch[asset];
    if(closedAt<=previous.modelAt)continue;
    const fourHour=analyzeFourHours({asset,candles:x.chartCandles,frames:x.chartHigherFrames,now,
      source:x.candleSource,referencePrice:price});
    const raw=buildContinuousBias({asset,frames:x.chartHigherFrames,price,now,sourceReady:true,fourHour});
    const next=advanceWatch(previous,raw,asset,price,x.chartCandles,now,closedAt);
    if(next!==previous){load().watch[asset]=next;dirty=true;changed=true;}
  }
  save(now,changed);
  return getSniperAudit(now);
}
export function updateSniperAudit(payload:any,now=Date.now()){
  const modelAt=Number(payload?.checkedAt||0);
  if(!payload?.ok||!modelAt)return getSniperAudit(now);
  try{
    load(true);
    let watchChanged=false;
    for(const asset of ['GOLD','BTC'] as const){
      const x=asset==='GOLD'?payload.gold:payload.bitcoin;
      const view=buildSniperOutlook(asset,x,null,now,modelAt).view;
      const fourHour=analyzeFourHours({asset,candles:x?.chartCandles,frames:x?.chartHigherFrames,
        now,source:x?.candleSource,referencePrice:view.price});
      const raw=buildContinuousBias({asset,frames:x?.chartHigherFrames,price:view.price,now,
        sourceReady:view.priceFresh&&view.forecastFresh,fourHour});
      const previous=load().watch[asset];
      const next=advanceWatch(previous,raw,asset,view.price,x?.chartCandles,now,modelAt);
      if(next!==previous){load().watch[asset]=next;dirty=true;watchChanged=true;}
    }
    runAsset('GOLD',payload.gold,modelAt,now);
    runAsset('BTC',payload.bitcoin,modelAt,now);
    // Keep the persistent audit heartbeat current even while no setup passes.
    // This distinguishes "no qualified setup" from a dead/missing ledger.
    if(now-load().updatedAt>=30000)dirty=true;
    // Persist accepted watch changes before returning them to any browser.
    save(now,watchChanged);
  }catch(e){
    console.warn('[SNIPER-AUDIT] update:',e instanceof Error?e.message:'unknown');
  }
  return getSniperAudit(now);
}
export function getSniperAudit(now=Date.now()){
  const state=load(true);
  // The persisted flag is true only after an actual /data read or write.
  const show=(asset:Asset)=>{
    const entry=latest(state,asset);
    return entry&&now-entry.startedAt<=8*3600000?entry:null;
  };
  const records=state.scenarios;
  return {ok:true,version:1,persistence:persisted?'VOLUME':'NOT_DURABLE',
    updatedAt:state.updatedAt,
    current:{GOLD:show('GOLD'),BTC:show('BTC')},
    metrics:{GOLD:scorecard(records,'GOLD'),BTC:scorecard(records,'BTC')},
    block:Object.fromEntries((['GOLD','BTC'] as const).map(asset=>[
      asset,state.blockAt[asset]>0&&state.blockAt[asset]<=now+2000&&
        now-state.blockAt[asset]<=90000?state.block[asset]:'سبب الانتظار غير حديث'
    ])),
    blockAt:state.blockAt,
    watch:Object.fromEntries((['GOLD','BTC'] as const).map(asset=>{
      const w=state.watch[asset],current=w.records.at(-1)||null;
      // Render Free can sleep between updates. Keep the confirmed historical
    // direction in memory, but never re-serve an old LIVE path as actionable.
    const live=Number.isFinite(w.modelAt)&&w.modelAt>0&&w.modelAt<=now&&
      now-w.modelAt<=90000&&w.updatedAt>0&&w.updatedAt<=now&&
      now-w.updatedAt<=90000;
    const bias=!live&&w.bias?{...w.bias,active:false,status:'PAUSED' as const,
      targets:[],invalidation:null,
      reason:'تحديثات القناص متوقفة مؤقتًا؛ الاتجاه السابق محفوظ تاريخيًا فقط'}:w.bias;
    return [asset,{state:w.state,bias,stale:!live,updatedAt:w.updatedAt,modelAt:w.modelAt,
        current,metrics:scorecard(w.records,asset),
        recent:w.records.filter(r=>terminal(r.status)).slice(-5).reverse()}];
    })),
    recent:records.filter(r=>terminal(r.status)).slice(-15).reverse().map(r=>({
      id:r.id,asset:r.asset,side:r.side,status:r.status,startedAt:r.startedAt,
      resolvedAt:r.resolvedAt,targets:r.targets.map(t=>({stage:t.stage,price:t.price,reachedAt:t.reachedAt})),
      note:r.note
    }))}
}
