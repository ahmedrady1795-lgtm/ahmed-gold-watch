/* Public Coinbase BTC-USD shadow outcomes. Never live orders, account data or promises.
 * Every event is frozen at first genuine server observation, after its exchange
 * trade timestamp; a later exchange match is required to score each horizon. */
export const FLOW_SCHEMA='qannas-flow-shadow-v1';
const HORIZONS=[60_000,900_000];
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export function emptyFlowLedger(now=Date.now()){
 return {schema:FLOW_SCHEMA,updatedAt:now,source:'Coinbase Exchange BTC-USD',
  records:[],lastExchangeAt:0};
}
export function validateFlowLedger(raw,now=Date.now()){
 if(raw?.schema!==FLOW_SCHEMA||!Array.isArray(raw.records)||
    raw.records.length>4000||raw.source!=='Coinbase Exchange BTC-USD')
   throw Error('BAD_FLOW_ARCHIVE');
 const ids=new Set();
 for(const r of raw.records){
  if(!r||typeof r.id!=='string'||r.id.length>125||ids.has(r.id)||
    !['PREPARE','CONFIRMED'].includes(r.phase)||
    !['BUY','SELL'].includes(r.side)||!positive(r.at)||!positive(r.price)||
    !positive(r.tradeAt)||r.tradeAt>r.at+2000||r.at-r.tradeAt>5000||
    r.at>now+2000||typeof r.baselineSide!=='string'||
    !['BUY','SELL','WAIT'].includes(r.baselineSide)||!Array.isArray(r.results)||
    r.results.length!==2||!r.results.every((v,i)=>
    v.horizonMs===HORIZONS[i]&&['PENDING','SCORED','NEUTRAL','UNOBSERVED'].includes(v.status)&&
    (v.status==='SCORED'||v.status==='NEUTRAL'?
      positive(v.observedPrice)&&positive(v.observedAt)&&
      v.observedAt>=r.at+v.horizonMs&&
      v.observedAt<=r.at+v.horizonMs+15000:
      v.observedAt==null&&v.observedPrice==null)))
    throw Error('BAD_FLOW_RECORD');
  ids.add(r.id);
 }
 return {...raw,records:raw.records.slice(-3500)};
}
export function mergeFlowLedgers(oldRaw,newRaw,now=Date.now()){
 const old=oldRaw?validateFlowLedger(oldRaw,now):emptyFlowLedger(now);
 const incoming=validateFlowLedger(newRaw,now);
 const map=new Map(old.records.map(r=>[r.id,r]));
 const rank=r=>r.results.filter(x=>x.status!=='PENDING').length;
 for(const r of incoming.records){
  const previous=map.get(r.id);
  if(!previous){map.set(r.id,r);continue}
  // Immutable issuance; only pending horizon outcomes can be filled.
  if(previous.at!==r.at||previous.price!==r.price||
     previous.side!==r.side||previous.phase!==r.phase||
     previous.baselineSide!==r.baselineSide)continue;
  const merged={...previous,results:previous.results.map((v,i)=>
    v.status!=='PENDING'?v:r.results[i])};
  if(rank(merged)>=rank(previous))map.set(r.id,merged);
 }
 return {schema:FLOW_SCHEMA,source:'Coinbase Exchange BTC-USD',
  updatedAt:Math.max(old.updatedAt||0,incoming.updatedAt||0,now),
  lastExchangeAt:Math.max(old.lastExchangeAt||0,incoming.lastExchangeAt||0),
  records:[...map.values()].sort((a,b)=>a.at-b.at).slice(-3500)};
}
export function addRadarObservation(ledger,input){
 const {now,radar,tradeAt,price,baselineSide}=input;
 if(!positive(now)||!positive(price)||!positive(tradeAt)||
    now-tradeAt<0||now-tradeAt>4500||!radar?.micro?.ready||
    !['PREPARE','CONFIRMED'].includes(radar.phase)||
    !['BUY','SELL'].includes(radar.side)||
    !positive(radar.since)||radar.since>now||
    now-radar.since>120000||
    !['BUY','SELL','WAIT'].includes(baselineSide)||
    !positive(radar.confirm)||!positive(radar.invalidate)||
    !(radar.side==='BUY'?radar.confirm>radar.invalidate:
      radar.confirm<radar.invalidate))return false;
 const id='CB-BTC:'+radar.phase+':'+radar.since;
 if(ledger.records.some(r=>r.id===id))return false;
 // Suppress repeated reconnections from creating a false large sample.
 const latest=ledger.records.filter(r=>r.phase===radar.phase).at(-1);
 if(latest&&now-latest.at<120000)return false;
 ledger.records.push({id,at:now,tradeAt,price,side:radar.side,
  phase:radar.phase,baselineSide,confirm:radar.confirm,
  invalidate:radar.invalidate,delta:Number(radar.delta.toFixed(2)),
  imbalance:Number(radar.imbalance.toFixed(2)),
  spreadBps:radar.micro.spreadBps,
  depthSampleCount:radar.micro.snapshots,
  possibleBidPull:radar.micro.possibleBidPull,
  possibleAskPull:radar.micro.possibleAskPull,
  results:HORIZONS.map(horizonMs=>({
    horizonMs,status:'PENDING',observedAt:null,observedPrice:null
  }))});
 ledger.records=ledger.records.slice(-3500);
 ledger.updatedAt=now;return true;
}
export function applyExchangeMatch(ledger,input){
 const {at,price,now}=input;
 if(!positive(at)||!positive(price)||!positive(now)||at>now+2000||
    now-at>5000)return 0;
 let count=0;
 for(const r of ledger.records){
  if(r.at>=at)continue;
  for(const v of r.results){
   if(v.status!=='PENDING')continue;
   const target=r.at+v.horizonMs;
   if(at<target||at>target+15000)continue;
   // The first genuine matched trade at/after deadline decides outcome.
   v.observedAt=at;v.observedPrice=price;
   const moveBps=Math.abs(price-r.price)/r.price*10000;
   const deadzone=v.horizonMs===60000?2:5;
   v.status=moveBps<=deadzone?'NEUTRAL':'SCORED';
   count++;
  }
 }
 if(count){ledger.updatedAt=now;ledger.lastExchangeAt=at;}
 return count;
}
export function expireMissingFlow(ledger,now){
 let count=0;
 for(const r of ledger.records)for(const v of r.results)
   if(v.status==='PENDING'&&now>r.at+v.horizonMs+15000){
    v.status='UNOBSERVED';count++;
   }
 if(count)ledger.updatedAt=now;
 return count;
}
export function flowScorecard(ledger){
 const cohorts=[];
 for(const phase of ['PREPARE','CONFIRMED'])
  for(const horizonMs of HORIZONS){
   const rows=ledger.records.filter(r=>r.phase===phase);
   const resolved=rows.map(r=>({r,o:r.results.find(x=>x.horizonMs===horizonMs)}))
     .filter(x=>x.o?.status==='SCORED');
   const selected=resolved.length;
   const hits=resolved.filter(({r,o})=>
     (o.observedPrice>r.price?'BUY':'SELL')===r.side).length;
   const paired=resolved.filter(({r})=>r.baselineSide!=='WAIT');
   const baselineHits=paired.filter(({r,o})=>
     (o.observedPrice>r.price?'BUY':'SELL')===r.baselineSide).length;
   const winsPaired=paired.filter(({r,o})=>
     (o.observedPrice>r.price?'BUY':'SELL')===r.side).length;
   const wilson=n=>{
    if(!n)return 0;
    const p=hits/n,z=1.96,a=z*z;
    return Math.max(0,(p+a/(2*n)-z*Math.sqrt((p*(1-p)+a/(4*n))/n))/(1+a/n));
   };
   cohorts.push({phase,horizonMs,total:rows.length,evaluated:selected,
    correct:hits,accuracy:selected?+(hits/selected).toFixed(4):null,
    paired:paired.length,pairedAccuracy:paired.length?
      +(winsPaired/paired.length).toFixed(4):null,
    baselineAccuracy:paired.length?
      +(baselineHits/paired.length).toFixed(4):null,
    lower95:selected?+wilson(selected).toFixed(4):null,
    neutral:rows.filter(r=>r.results.find(x=>x.horizonMs===horizonMs)?.status==='NEUTRAL').length,
    unobserved:rows.filter(r=>r.results.find(x=>x.horizonMs===horizonMs)?.status==='UNOBSERVED').length,
    pending:rows.filter(r=>r.results.find(x=>x.horizonMs===horizonMs)?.status==='PENDING').length,
    eligibleForReview:selected>=100&&paired.length>=70,
    qualified:false,actionable:false});
  }
 return {source:'Coinbase Exchange BTC-USD',status:'SHADOW_ONLY',
  basis:'independently captured live radar events and later executed Coinbase prints',
  caveat:'The strategy was not randomized; this is forward shadow observation, not proof of an out-of-sample edge or net profitability.',
  cohorts};
}
