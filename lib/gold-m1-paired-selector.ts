/** Past-only GOLD M1 paper challenger. Compare the last closed body against
 * the original pressure predictor on identical observed outcomes. Never
 * authorize broker execution or flip an issued forecast after the fact. */
type Side='BUY'|'SELL';
type Row={id:number;issuedAt:number;chartSource?:string;marketRegime?:string;originalSide?:Side;
 baselineSide?:Side|null;directionObserved?:string|null;directionEvaluatedAt?:number|null};
const isSide=(s:unknown):s is Side=>s==='BUY'||s==='SELL';
function compare(rows:Row[]){
 let n=0,baselineHits=0,pressureHits=0,baselineOnly=0,pressureOnly=0;
 for(const r of rows){
   n++;const b=r.baselineSide===r.directionObserved,p=r.originalSide===r.directionObserved;
   if(b)baselineHits++;if(p)pressureHits++;if(b&&!p)baselineOnly++;if(p&&!b)pressureOnly++;
 }
 const d=baselineOnly+pressureOnly,p=d?baselineOnly/d:0,z=1.96;
 const lower=d?(p+z*z/(2*d)-z*Math.sqrt((p*(1-p)+z*z/(4*d))/d))/(1+z*z/d):0;
 return {n,baselineHits,pressureHits,baselineOnly,pressureOnly,lower95:lower,
   qualified:n>=40&&d>=20&&baselineHits>pressureHits&&lower>.5};
}
export function chooseGoldM1Baseline(input:{history:readonly Row[];issuedAt:number;source?:string;regime?:string;baseline:Side|null;proposed:Side}){
 const {history,issuedAt,source,regime,baseline,proposed}=input;
 const seen=new Set<number>();
 const rows=history.filter(r=>source&&r.chartSource===source&&Number.isSafeInteger(r.id)&&r.id===r.issuedAt&&
   r.issuedAt+60000<=issuedAt&&Number.isSafeInteger(r.directionEvaluatedAt)&&
   r.directionEvaluatedAt!>=r.issuedAt+60000&&r.directionEvaluatedAt!<=issuedAt&&
   isSide(r.baselineSide)&&isSide(r.originalSide)&&isSide(r.directionObserved))
   .sort((a,b)=>b.issuedAt-a.issuedAt).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,180);
 const same=compare(rows.filter(r=>r.marketRegime===regime)),all=compare(rows);
 // Prefer same-regime evidence. A global winner must not override a regime
 // in which baseline has performed worse on at least 12 observed candles.
 const qualified=regime!=='INVALID'&&regime!=='LOW_ACTIVITY'&&
   (same.qualified||(all.qualified&&(same.n<12||same.baselineHits>=same.pressureHits)));
 const use=Boolean(qualified&&baseline&&baseline!==proposed);
 return {side:use?baseline!:proposed,applied:use,model:use?'PAIRED_BODY_BASELINE':'UNCHANGED',
   sameRegime:same,overall:all,tradeAuthorized:false as const};
}
