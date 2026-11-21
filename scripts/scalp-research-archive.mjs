/**
 * Checkpoints are public, paper-only, forward research, not MT5 fills.
 * An old unresolved observation becomes UNKNOWN after reboot; never replay
 * an off-market quote, a stale LIMIT, or a successful paper outcome.
 */
export const SCALP_RESEARCH_URL=
 'https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/sniper-audit-data/data/scalp-research-v1.json';
const assets=['GOLD','BTC'];
const sides=['BUY','SELL'];
const states=['AWAIT_QUOTE','CONFIRMING','NO_EDGE','NO_BID_ASK','COST_UNVIABLE',
 'PENDING','ACTIVE','QUICK_TP','STOP','TIME_EXIT','EXPIRED','UNKNOWN'];
const unresolved=new Set(['AWAIT_QUOTE','CONFIRMING','PENDING','ACTIVE']);
const validTime=(v,now)=>Number.isSafeInteger(v)&&v>0&&v<=now+60000;
const revision=r=>Math.max(r.directionEvaluatedAt||0,r.closedAt||0,
 r.lastQuoteAt||0,r.issuedAt);
const rank=r=>Number(['BUY','SELL','FLAT','UNKNOWN'].includes(r.directionObserved))*2+
 Number(r.netR!=null&&Number.isFinite(r.netR)&&
  ['QUICK_TP','STOP','TIME_EXIT'].includes(r.state));

/** Allowlist prospectively observed early-flow rows from the public research
 * endpoint; preserve uncertainty and reject ambiguous or forged resolutions.
 * This audit is separate from paper LIMIT results and has no broker authority.
 */
function cleanEarlyObservations(rows,now){
 if(rows==null)return [];
 if(!Array.isArray(rows)||rows.length>600)
  throw Error('Invalid BTC early-flow cohort');
 const seen=new Set();
 return rows.map(r=>{
  if(!r||typeof r!=='object'||r.lane!=='BTC_EARLY_M1'||
   typeof r.id!=='string'||r.id.length<1||r.id.length>160||
   !sides.includes(r.side)||!['WATCH','ARMED'].includes(r.status)||
   !['OPEN','FAVORABLE_FIRST','ADVERSE_FIRST','NO_THRESHOLD','UNKNOWN'].includes(r.result)||
   typeof r.source!=='string'||!r.source||r.source.length>160||
   typeof r.setup!=='string'||r.setup.length>80||
   !validTime(r.startedAt,now)||now-r.startedAt>21*86400000||
   !validTime(r.expiresAt,now+60000)||r.expiresAt!==r.startedAt+60000||
   !validTime(r.lastQuoteAt,now)||r.lastQuoteAt>now+60000||
   !Number.isFinite(r.startPrice)||r.startPrice<=0||
   !Number.isFinite(r.threshold)||r.threshold<=0||
   !Number.isFinite(r.score)||r.score<0||r.score>100||
   !Number.isFinite(r.maxFavorable)||r.maxFavorable<0||
   !Number.isFinite(r.maxAdverse)||r.maxAdverse<0||
   (r.resolvedAt!=null&&(!validTime(r.resolvedAt,now)||
      r.resolvedAt<r.startedAt))||
   (r.result==='OPEN'&&r.resolvedAt!=null)||
   (r.result!=='OPEN'&&r.resolvedAt==null))
   throw Error('Invalid BTC early-flow observation');
  if(seen.has(r.id))throw Error('Duplicate BTC early-flow ID');
  seen.add(r.id);
  // A genuine first-threshold hit after the frozen horizon is UNKNOWN, not
  // a retrospective success. This also handles legacy data safely.
  const tooLate=r.result!=='UNKNOWN'&&r.result!=='OPEN'&&
   r.resolvedAt>r.expiresAt;
  return {id:r.id,lane:'BTC_EARLY_M1',side:r.side,
   score:r.score,setup:r.setup,status:r.status,source:r.source,
   startedAt:r.startedAt,lastQuoteAt:r.lastQuoteAt,
   expiresAt:r.expiresAt,startPrice:r.startPrice,
   threshold:r.threshold,maxFavorable:r.maxFavorable,
   maxAdverse:r.maxAdverse,result:tooLate?'UNKNOWN':r.result,
   resolvedAt:r.resolvedAt,reason:tooLate?'AFTER_HORIZON_UNVERIFIED':
    String(r.reason||'').slice(0,120)};
 }).sort((a,b)=>a.startedAt-b.startedAt).slice(-360);
}

export function cleanScalpResearch(input,now=Date.now()){
 if(input?.schema!==1||!validTime(input.savedAt,now)||
   !Array.isArray(input.records)||input.records.length>1000)
   throw Error('Invalid paper research checkpoint');
 const records=[],seen=new Set();
 for(const r of input.records){
  if(!r||typeof r!=='object'||!assets.includes(r.asset)||
   !sides.includes(r.side)||!states.includes(r.state)||
   !validTime(r.issuedAt,now)||r.id!==r.issuedAt||
   now-r.issuedAt>21*86400000||
   typeof r.note!=='string'||r.note.length>1000||
   (r.chartSource!=null&&
    (typeof r.chartSource!=='string'||r.chartSource.length>240))||
   !['BUY','SELL','FLAT','UNKNOWN',null,undefined].includes(r.directionObserved)||
   (r.directionEvaluatedAt!=null&&
    (!validTime(r.directionEvaluatedAt,now)||
      r.directionEvaluatedAt<r.issuedAt+60000))||
   (r.netR!=null&&!Number.isFinite(r.netR)))
   throw Error('Invalid dated or ambiguous research sample');
  const key=r.asset+':'+r.id;
  if(seen.has(key))throw Error('Duplicate research sample');
  seen.add(key);
  // Untrusted JSON cannot inject additional runtime properties into a ledger.
  // This archive is never authority to create an order or trade.
  const {asset,...sample}=r;
  records.push({...sample,asset});
 }
 return {schema:1,savedAt:input.savedAt,
  records:assets.flatMap(asset=>records.filter(r=>r.asset===asset)
    .sort((a,b)=>a.issuedAt-b.issuedAt).slice(-360)),
  earlyObservations:cleanEarlyObservations(input.earlyObservations,now)};
}
export function mergeScalpResearch(previous,current,now=Date.now()){
 const old=previous?cleanScalpResearch(previous,now):{records:[],earlyObservations:[]};
 const fresh=cleanScalpResearch(current,now);
 const merged=new Map();
 for(const r of [...old.records,...fresh.records]){
  const key=r.asset+':'+r.id,p=merged.get(key);
  if(p&&p.chartSource&&r.chartSource&&p.chartSource!==r.chartSource){
   merged.set(key,{...r,state:'UNKNOWN',directionObserved:'UNKNOWN',
    directionEvaluatedAt:now>=r.issuedAt+60000?now:null,
    filledAt:null,netR:null,closedAt:now,
    note:'تعارض مصدر السجل بعد الاستعادة؛ لا نتيجة معتمدة'});
   continue;
  }
  if(!p||rank(r)>rank(p)||rank(r)===rank(p)&&revision(r)>=revision(p))
   merged.set(key,r);
 }
 // Same frozen ID must always come from one source and immutable entry.
 // A later process can improve OPEN to a real observed result but must not
 // erase a finished result with an incomplete restart checkpoint.
 const early=new Map();
 const grade=r=>r.result==='OPEN'?0:r.result==='UNKNOWN'?1:2;
 for(const r of [...old.earlyObservations,...fresh.earlyObservations]){
  const p=early.get(r.id);
  if(p&&(p.source!==r.source||p.side!==r.side||
    p.startPrice!==r.startPrice||p.threshold!==r.threshold)){
   early.set(r.id,{...r,result:'UNKNOWN',
    resolvedAt:now,reason:'SOURCE_OR_FROZEN_THRESHOLD_CONFLICT'});
   continue;
  }
  if(!p||grade(r)>grade(p)||grade(r)===grade(p)&&
    (r.resolvedAt||r.lastQuoteAt)>=(p.resolvedAt||p.lastQuoteAt))
   early.set(r.id,r);
 }
 return cleanScalpResearch({schema:1,savedAt:now,
  records:[...merged.values()],earlyObservations:[...early.values()]},now);
}
export function restoredScalpResearch(input,asset,now=Date.now()){
 if(!assets.includes(asset))throw Error('Invalid asset for restore');
 const checkpoint=cleanScalpResearch(input,now);
 return {version:1,history:checkpoint.records.filter(r=>r.asset===asset)
  .map(({asset:discard,...r})=>{
   if(unresolved.has(r.state)||r.directionObserved==null){
    return {...r,state:'UNKNOWN',filledAt:null,netR:null,
     closedAt:now,directionObserved:r.directionObserved??'UNKNOWN',
     directionEvaluatedAt:r.directionEvaluatedAt??
      (now>=r.issuedAt+60000?now:null),
     note:'بحث قديم استُعيد دون رصد متصل؛ لا تنفيذ ولا نتيجة مفترضة'};
   }
   return r;
  })};
}

/** Recovered BTC flow audit: no old OPEN prediction can be retrospectively
 * graded using candles fetched after a Render restart.
 */
export function restoredBtcEarlyForward(input,now=Date.now()){
 const records=cleanScalpResearch(input,now).earlyObservations
  .map(r=>r.result==='OPEN'?{...r,result:'UNKNOWN',
     resolvedAt:now,reason:'UNOBSERVED_RENDER_RESTART'}:r)
  .sort((a,b)=>b.startedAt-a.startedAt).slice(0,360);
 return {version:1,lanes:{BTC_EARLY_M1:{active:null,
  history:records,seen:records.map(x=>x.id)}}};
}
