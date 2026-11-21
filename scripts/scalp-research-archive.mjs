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
   (r.chartSource!=null&&\n    (typeof r.chartSource!=='string'||r.chartSource.length>240))||
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
    .sort((a,b)=>a.issuedAt-b.issuedAt).slice(-360))};
}
export function mergeScalpResearch(previous,current,now=Date.now()){
 const old=previous?cleanScalpResearch(previous,now):{records:[]};
 const fresh=cleanScalpResearch(current,now);
 const merged=new Map();
 for(const r of [...old.records,...fresh.records]){
  const key=r.asset+':'+r.id,p=merged.get(key);
  if(p&&p.chartSource&&r.chartSource&&p.chartSource!==r.chartSource){
   merged.set(key,{...r,state:'UNKNOWN',directionObserved:'UNKNOWN',
    directionEvaluatedAt:now>=r.issuedAt+60000?now:null,\n    filledAt:null,netR:null,closedAt:now,
    note:'تعارض مصدر السجل بعد الاستعادة؛ لا نتيجة معتمدة'});
   continue;
  }
  if(!p||rank(r)>rank(p)||rank(r)===rank(p)&&revision(r)>=revision(p))
   merged.set(key,r);
 }
 return cleanScalpResearch({schema:1,savedAt:now,
  records:[...merged.values()]},now);
}
export function restoredScalpResearch(input,asset,now=Date.now()){
 if(!assets.includes(asset))throw Error('Invalid asset for restore');
 const checkpoint=cleanScalpResearch(input,now);
 return {version:1,history:checkpoint.records.filter(r=>r.asset===asset)
  .map(({asset:discard,...r})=>{
   if(unresolved.has(r.state)||r.directionObserved==null){
    return {...r,state:'UNKNOWN',filledAt:null,netR:null,
     closedAt:now,directionObserved:r.directionObserved??'UNKNOWN',
     directionEvaluatedAt:r.directionEvaluatedAt??\n      (now>=r.issuedAt+60000?now:null),
     note:'بحث قديم استُعيد دون رصد متصل؛ لا تنفيذ ولا نتيجة مفترضة'};
   }
   return r;
  })};
}
