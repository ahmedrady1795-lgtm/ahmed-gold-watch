/**
 * Causal paper-only Coinbase BTC-USD radar scoreboard.
 * Entry is the actual recorded exchange trade BEFORE prediction.
 * Evaluation is the FIRST later executed trade at/after the due event time
 * within 20s, from an uninterrupted, healthy SAME venue stream.
 * No synthetic backfill, repaint, execution approval or calibrated probability.
 */
export const HORIZONS=[60_000,900_000];
const MAX_RECORDS=900;
const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
export const blankShadow=()=>({
 version:'coinbase-flow-shadow-v1',source:'Coinbase Exchange BTC-USD',
 updatedAt:0,records:[],lastKey:{PREPARE:'',CONFIRMED:''}
});
export function restoreShadow(input){
 const out=blankShadow();
 if(input?.version!==out.version||!Array.isArray(input.records))return out;
 out.records=input.records.filter(r=>
  r&&typeof r.id==='string'&&r.id.length<90&&finite(r.at)&&
  finite(r.entry)&&r.entry>0&&
  ['BUY','SELL'].includes(r.side)&&
  ['PREPARE','CONFIRMED'].includes(r.phase)&&
  [60_000,900_000].every(h=>r.outcomes?.[h]&&
    ['PENDING','WIN','LOSS','FLAT','GAP'].includes(r.outcomes[h].status))
 ).slice(-MAX_RECORDS);
 out.updatedAt=finite(input.updatedAt)?input.updatedAt:0;
 out.lastKey={
  PREPARE:String(input.lastKey?.PREPARE||'').slice(0,90),
  CONFIRMED:String(input.lastKey?.CONFIRMED||'').slice(0,90)
 };
 return out;
}
const dir=(d,bps=1.5)=>d>bps?'BUY':d< -bps?'SELL':'WAIT';
export function advanceShadow(shadow,{at,price,connected=true}){
 if(!finite(at)||!finite(price)||price<=0)return 0;
 let changed=0;
 for(const event of shadow.records){
  for(const ms of HORIZONS){
   const result=event.outcomes[ms];
   if(result.status!=='PENDING')continue;
   const due=event.at+ms;
   if(!connected||at>due+20_000){
    result.status='GAP';result.resolvedAt=at;changed++;continue;
   }
   if(at<due)continue;
   const movement=(price-event.entry)/event.entry*10000;
   const vote=dir(movement,1.5);
   result.status=vote==='WAIT'?'FLAT':vote===event.side?'WIN':'LOSS';
   result.moveBps=Number(movement.toFixed(3));
   result.exit=price;result.resolvedAt=at;changed++;
  }
 }
 if(changed)shadow.updatedAt=at;
 return changed;
}
export function interruptShadow(shadow,now){
 let changed=0;
 for(const event of shadow.records)for(const ms of HORIZONS){
  const result=event.outcomes[ms];
  if(result.status==='PENDING'){
   result.status='GAP';result.resolvedAt=now;changed++;
  }
 }
 if(changed)shadow.updatedAt=now;
 return changed;
}
export function addShadowSignal(shadow,input){
 const {view,at,price,sourceAt,baselineSide}=input;
 if(!view||!['PREPARE','CONFIRMED'].includes(view.phase)||
   !['BUY','SELL'].includes(view.side)||!finite(at)||!finite(price)||price<=0||
   !finite(sourceAt)||sourceAt>at+2000||at-sourceAt>3000||
   !finite(view.since)||view.since>at||
   at-view.since>120000||!finite(view.confirm)||!finite(view.invalidate)||
   view.confirm<=0||view.invalidate<=0||
   (view.side==='BUY'?view.confirm<=view.invalidate:view.confirm>=view.invalidate))
   return null;
 const phase=view.phase;
 const key=phase+':'+view.side+':'+Math.floor(view.since/1000);
 if(shadow.lastKey[phase]===key||shadow.records.some(r=>r.id===key))return null;
 // Limit correlated repeated observations per phase to one per two minutes.
 const prior=[...shadow.records].reverse().find(r=>r.phase===phase);
 if(prior&&at-prior.at<120000)return null;
 const event={
  id:key,source:'Coinbase Exchange BTC-USD',at,sourceAt,
  phase,side:view.side,entry:price,
  baselineSide:['BUY','SELL'].includes(baselineSide)?baselineSide:'WAIT',
  confirm:view.confirm,invalidate:view.invalidate,
  delta:Number(view.delta.toFixed(2)),
  imbalance:Number(view.imbalance.toFixed(2)),
  depthState:view.micro?.ready?view.micro.status:'UNAVAILABLE',
  outcomes:Object.fromEntries(HORIZONS.map(ms=>[ms,{
   status:'PENDING',resolvedAt:null,exit:null,moveBps:null
  }]))
 };
 shadow.records.push(event);
 shadow.records=shadow.records.slice(-MAX_RECORDS);
 shadow.lastKey[phase]=key;
 shadow.updatedAt=at;
 return event;
}
function wilsonLower(correct,n){
 if(!n)return 0;
 const z=1.96,p=correct/n,z2=z*z;
 return (p+z2/(2*n)-z*Math.sqrt((p*(1-p)+z2/(4*n))/n))/(1+z2/n);
}
function cohort(rows,ms){
 const complete=rows.filter(r=>['WIN','LOSS'].includes(r.outcomes[ms]?.status));
 const wins=complete.filter(r=>r.outcomes[ms].status==='WIN').length;
 const paired=complete.filter(r=>r.baselineSide!=='WAIT');
 const baselineWins=paired.filter(r=>{
  const move=r.outcomes[ms].moveBps;
  return dir(move)===r.baselineSide;
 }).length;
 const radarPairedWins=paired.filter(r=>r.outcomes[ms].status==='WIN').length;
 const gap=rows.filter(r=>r.outcomes[ms]?.status==='GAP').length;
 const flat=rows.filter(r=>r.outcomes[ms]?.status==='FLAT').length;
 const pending=rows.filter(r=>r.outcomes[ms]?.status==='PENDING').length;
 const n=complete.length;
 // OOS observational audit, not ML model certification. A minimum is not proof of edge.
 return {n,wins,losses:n-wins,flat,gap,pending,
  coverage:rows.length?Number((n/rows.length).toFixed(4)):0,
  accuracy:n>=40?Number((wins/n).toFixed(4)):null,
  lower95:n>=40?Number(wilsonLower(wins,n).toFixed(4)):null,
  pairedN:paired.length,
  pairedRadarWins:radarPairedWins,pairedBaselineWins:baselineWins,
  pairedRadarAccuracy:paired.length>=40?Number((radarPairedWins/paired.length).toFixed(4)):null,
  pairedBaselineAccuracy:paired.length>=40?Number((baselineWins/paired.length).toFixed(4)):null,
  edgeProven:false};
}
export function shadowReport(state,now){
 const rows=state.records.filter(r=>r&&r.at>0&&r.at<=now)
   .slice(-MAX_RECORDS);
 const report={};
 for(const phase of ['PREPARE','CONFIRMED']){
  const selected=rows.filter(x=>x.phase===phase);
  report[phase]={events:selected.length,
    m1:cohort(selected,60_000),m15:cohort(selected,900_000)};
 }
 return {ok:true,source:'Coinbase Exchange BTC-USD',
  status:'SHADOW_UNCALIBRATED',updatedAt:state.updatedAt,
  collected:rows.length,
  persistence:'PROCESS_OR_VOLUME_UNVERIFIED',
  report,latest:rows.slice(-8).reverse(),actionable:false,
  note:'Only uninterrupted live Coinbase trade tape counts; gaps are excluded, baseline uses the same dates, no proven predictive edge.'};
}
