/**
 * Forward-only, browser-persisted observer for the independent M1 movement radar.
 * Records what the user could see WHEN issued; never rewrites levels after the fact.
 * Outcomes use later, complete M1 candles from the same market data provider.
 * Neither this scorecard nor any alert permits broker execution.
 */
type Side='BUY'|'SELL';
type Bar={time:number;open:number;high:number;low:number;close:number};
export type MovementProof={
 id:string;asset:'GOLD'|'BTC';source:string;kind:'EARLY'|'BREAK';
 side:Side;sourceAt:number;issuedAt:number;priceAt:number;
 trigger:number|null;invalidation:number|null;target:number|null;
 status:'PENDING'|'TARGET'|'STOP'|'TIMEOUT'|'AMBIGUOUS'|'UNKNOWN'|'NO_TARGET';
 resolvedAt:number|null;detectedAfterMs:number;leadSeconds:number|null;
};
type Opportunity={phase:string;side:string;sourceAt:number|null;
 trigger:number|null;invalidation:number|null;targets:number[]};
const horizon=60*60000;
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const good=(x:any):x is Bar=>x&&[x.time,x.open,x.high,x.low,x.close].every(valid)&&
 x.time>0&&x.time%60000===0&&x.low>0&&x.high>=Math.max(x.open,x.close)&&
 x.low<=Math.min(x.open,x.close);
export function safeMovementProof(raw:unknown):MovementProof[]{
 if(!Array.isArray(raw))return [];
 return raw.filter((x:any)=>x&&typeof x.id==='string'&&x.id.length<220&&
  (x.asset==='GOLD'||x.asset==='BTC')&&typeof x.source==='string'&&x.source.length<150&&
  (x.kind==='EARLY'||x.kind==='BREAK')&&(x.side==='BUY'||x.side==='SELL')&&
  valid(x.issuedAt)&&valid(x.sourceAt)&&valid(x.priceAt)&&x.priceAt>0&&
  ['PENDING','TARGET','STOP','TIMEOUT','AMBIGUOUS','UNKNOWN','NO_TARGET'].includes(x.status)&&
  (x.target==null||valid(x.target))&&(x.invalidation==null||valid(x.invalidation))
 ).slice(-300).map((x:any)=>({...x,leadSeconds:valid(x.leadSeconds)?x.leadSeconds:null}));
}
export function advanceMovementProof(input:{
 prior:MovementProof[];now:number;asset:'GOLD'|'BTC';source:string;
 price:number|null;signal:Opportunity;bars:unknown
}):MovementProof[]{
 const {now,asset,source,signal}=input;
 if(!valid(now)||now<=0||!source)return input.prior;
 const rows=(Array.isArray(input.bars)?input.bars:[]).filter(good)
  .filter(x=>x.time+60000<=now).sort((a,b)=>a.time-b.time);
 const unique=[...new Map(rows.map(x=>[x.time,x])).values()].sort((a,b)=>a.time-b.time);
 let modified=false;
 let next=input.prior.map(item=>{
  if(item.asset!==asset||item.source!==source||item.status!=='PENDING')return item;
  const first=Math.ceil(item.issuedAt/60000)*60000;
  const end=item.issuedAt+horizon;
  const later=unique.filter(c=>c.time>=first&&c.time<end);
  let status:MovementProof['status']='PENDING',resolvedAt:number|null=null;
  let expected=first;
  for(const bar of later){
    if(bar.time!==expected){status='UNKNOWN';resolvedAt=bar.time+60000;break;}
    expected=bar.time+60000;
    const targetHit=item.target!=null&&(item.side==='BUY'?bar.high>=item.target:bar.low<=item.target);
    const stopHit=item.invalidation!=null&&(item.side==='BUY'?bar.low<=item.invalidation:bar.high>=item.invalidation);
    if(targetHit||stopHit){
      status=targetHit&&stopHit?'AMBIGUOUS':targetHit?'TARGET':'STOP';
      resolvedAt=bar.time+60000;break;
    }
  }
  if(status==='PENDING'&&now>=end+60000){
    status=expected>=end?'TIMEOUT':'UNKNOWN';
    resolvedAt=end;
  }
  if(status==='PENDING')return item;
  modified=true;return {...item,status,resolvedAt};
 });
 if((signal.phase==='PREPARE'||signal.phase==='BREAK_CONFIRMED')&&
   (signal.side==='SELL'||signal.side==='BUY')&&valid(input.price)&&input.price>0&&
   valid(signal.sourceAt)&&signal.sourceAt>0&&now>=signal.sourceAt&&
   now-signal.sourceAt<=120000){
   const kind:MovementProof['kind']=signal.phase==='PREPARE'?'EARLY':'BREAK';
   const id=[asset,source,kind,signal.side,signal.sourceAt].join(':');
   if(!next.some(x=>x.id===id)){
     const target=(Array.isArray(signal.targets)?signal.targets:[])
       .find(t=>valid(t)&&t>0&&(signal.side==='BUY'?t>input.price!:t<input.price!))??null;
     const invalidation=valid(signal.invalidation)&&signal.invalidation>0&&
       (signal.side==='BUY'?signal.invalidation<input.price:signal.invalidation>input.price)?
         signal.invalidation:null;
     const early=kind==='BREAK'?next.filter(x=>x.asset===asset&&x.source===source&&
       x.kind==='EARLY'&&x.side===signal.side&&x.issuedAt<=signal.sourceAt!&&
       signal.sourceAt!-x.issuedAt<=30*60000).at(-1):undefined;
     next=[...next,{
       id,asset,source,kind,side:signal.side,sourceAt:signal.sourceAt,
       issuedAt:now,priceAt:input.price,
       trigger:valid(signal.trigger)?signal.trigger:null,
       invalidation,target,
       status:target==null?'NO_TARGET':'PENDING',resolvedAt:null,
       detectedAfterMs:Math.max(0,now-signal.sourceAt),
       leadSeconds:early?Math.round((signal.sourceAt-early.issuedAt)/1000):null
     }];modified=true;
   }
 }
 return modified?next.slice(-300):input.prior;
}
export function movementProofScore(rows:MovementProof[],asset:'GOLD'|'BTC'){
 const all=rows.filter(x=>x.asset===asset);
 const breaks=all.filter(x=>x.kind==='BREAK');
 const hits=all.filter(x=>x.status==='TARGET');
 const settled=all.filter(x=>['TARGET','STOP','TIMEOUT'].includes(x.status));
 const lags=breaks.map(x=>x.detectedAfterMs/1000).filter(x=>valid(x)&&x>=0);
 const leads=breaks.map(x=>x.leadSeconds).filter(valid).filter(x=>x>=0);
 return {
  alerts:all.length,early:all.filter(x=>x.kind==='EARLY').length,breaks:breaks.length,
  hits:hits.length,settled:settled.length,
  targetRate:settled.length?Math.round(100*hits.length/settled.length):null,
  pending:all.filter(x=>x.status==='PENDING').length,
  missingTarget:all.filter(x=>x.status==='NO_TARGET').length,
  unscored:all.filter(x=>x.status==='UNKNOWN'||x.status==='AMBIGUOUS').length,
  averageLagSeconds:lags.length?Math.round(lags.reduce((a,b)=>a+b,0)/lags.length):null,
  earlyLeads:leads.length,
  averageLeadSeconds:leads.length?Math.round(leads.reduce((a,b)=>a+b,0)/leads.length):null,
  statisticallyThin:settled.length<30
 };
}
