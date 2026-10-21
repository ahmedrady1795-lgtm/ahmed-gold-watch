// Archive contains only public paper-scenario records. No credentials or account data.
export const ARCHIVE_URL='https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/sniper-audit-data/data/sniper-audit.json';
const statuses=['ACTIVE','COMPLETED','STOPPED','EXPIRED','AMBIGUOUS','UNOBSERVED','REVERSED'];
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const nonnegative=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function cleanRecord(r,now=Date.now()){
  if(!r||typeof r.id!=='string'||r.id.length>120||!['GOLD','BTC'].includes(r.asset)||!['BUY','SELL'].includes(r.side)||
    !statuses.includes(r.status)||![r.startedAt,r.modelAt,r.expiresAt,r.entry,r.stop,r.lastCheckedAt].every(positive)||
    r.startedAt>now+2000||r.modelAt>now+2000||r.lastCheckedAt>now+2000||r.expiresAt<=r.startedAt||r.expiresAt-r.startedAt>8*3600000||
    !nonnegative(r.confidence)||r.confidence>100||!nonnegative(r.processedBars)||
    !nonnegative(r.bestFavorableR)||!nonnegative(r.worstAdverseR)||
    !(r.side==='BUY'?r.stop<r.entry:r.stop>r.entry)||!Array.isArray(r.targets)||r.targets.length<1||r.targets.length>3)throw Error('Invalid paper record');
  const nullableTime=v=>v===null||positive(v)&&v>=r.startedAt&&v<=now+2000;
  if(![r.firstHitAt,r.resolvedAt].every(nullableTime)||!(r.lastBarOpen===null||positive(r.lastBarOpen)&&r.lastBarOpen<=now)||
    !(r.resolvedPrice===null||positive(r.resolvedPrice)))throw Error('Invalid outcome timestamp');
  let last=r.entry,lastStage=0;
  const marketSource=typeof r.marketSource==='string'&&r.marketSource.trim()&&
    r.marketSource.length<=160&&!/[\u0000-\u001f]/.test(r.marketSource)?r.marketSource:undefined;
  const planVersion=typeof r.planVersion==='string'&&/^[A-Z0-9_]{1,64}$/.test(r.planVersion)?r.planVersion:undefined;
  const targets=r.targets.map(t=>{
    if(![1,2,3].includes(t.stage)||t.stage<=lastStage||![t.price,t.low,t.high].every(positive)||t.low>t.price||t.high<t.price||
      !nonnegative(t.quality)||t.quality>100||!nullableTime(t.reachedAt)||!(r.side==='BUY'?t.price>last:t.price<last))throw Error('Invalid target');
    last=t.price;lastStage=t.stage;
    return {stage:t.stage,price:t.price,low:t.low,high:t.high,quality:t.quality,kind:String(t.kind||'STRUCTURAL').slice(0,60),reachedAt:t.reachedAt};
  });
  return {id:r.id,asset:r.asset,side:r.side,startedAt:r.startedAt,modelAt:r.modelAt,expiresAt:r.expiresAt,
    entry:r.entry,stop:r.stop,confidence:r.confidence,source:r.purpose==='OBSERVATION'?'H1/H4_WATCH':'M15/H1_STRUCTURAL',
    targets,status:r.status,lastBarOpen:r.lastBarOpen,lastCheckedAt:r.lastCheckedAt,firstHitAt:r.firstHitAt,
    resolvedAt:r.resolvedAt,resolvedPrice:r.resolvedPrice,bestFavorableR:r.bestFavorableR,worstAdverseR:r.worstAdverseR,
    note:String(r.note||'').slice(0,400),processedBars:r.processedBars,purpose:r.purpose==='OBSERVATION'?'OBSERVATION':'SCENARIO',
    ...(marketSource?{marketSource}:{}),...(planVersion?{planVersion}:{})};
}
export function cleanArchive(x,now=Date.now()){
  if(x?.schema!==1||!positive(x.savedAt)||x.savedAt>now+2000||!nonnegative(x.sourceUpdatedAt)||
    x.sourceUpdatedAt>now+2000||!Array.isArray(x.records)||x.records.length>10000)throw Error('Invalid archive');
  const records=x.records.map(r=>cleanRecord(r,now));
  if(new Set(records.map(r=>r.purpose+':'+r.id)).size!==records.length)throw Error('Duplicate archive record');
  return {schema:1,savedAt:x.savedAt,sourceUpdatedAt:x.sourceUpdatedAt,records};
}
export function mergeArchives(previous,current,now=Date.now()){
  const fresh=cleanArchive(current,now),old=previous?cleanArchive(previous,now):null,map=new Map();
  const rank=r=>r.status==='ACTIVE'?0:r.status==='UNOBSERVED'?1:2;
  for(const r of [...(old?.records||[]),...fresh.records]){
    const key=r.purpose+':'+r.id,p=map.get(key);
    if(!p||rank(r)>rank(p)||rank(r)===rank(p)&&r.lastCheckedAt>=p.lastCheckedAt)
      map.set(key,{...r,...(!r.marketSource&&p?.marketSource?{marketSource:p.marketSource}:{}),
        ...(!r.planVersion&&p?.planVersion?{planVersion:p.planVersion}:{})});
  }
  return {schema:1,savedAt:now,sourceUpdatedAt:Math.max(fresh.sourceUpdatedAt,old?.sourceUpdatedAt||0),
    records:[...map.values()].sort((a,b)=>a.startedAt-b.startedAt||a.id.localeCompare(b.id)).slice(-10000)};
}
export function restoredState(input,now=Date.now()){
  const archive=cleanArchive(input,now);
  // Preserve the original levels/cursor for closed-candle replay. A restored
  // record is pending evidence, never an actionable signal or a scored win.
  const records=archive.records.map(r=>r.status!=='ACTIVE'?r:!r.marketSource?
    {...r,status:'UNOBSERVED',resolvedAt:now,resolvedPrice:null,recoveryPending:false,
      note:'استعادة بلا مصدر شموع موثق؛ لا يمكن إثبات نتيجة من مزود آخر'}:
    {...r,recoveryPending:true,note:'استُعيد للمراجعة؛ انتظار شموع متصلة من المصدر الأصلي لتحديد النتيجة'});
  const watch=asset=>({state:null,bias:null,updatedAt:0,modelAt:0,rearmAfterM15:0,
    records:records.filter(r=>r.purpose==='OBSERVATION'&&r.asset===asset).slice(-600)});
  return {version:1,scenarios:records.filter(r=>r.purpose!=='OBSERVATION').slice(-600),updatedAt:0,
    watch:{GOLD:watch('GOLD'),BTC:watch('BTC')},block:{GOLD:'',BTC:''},blockAt:{GOLD:0,BTC:0}};
}
