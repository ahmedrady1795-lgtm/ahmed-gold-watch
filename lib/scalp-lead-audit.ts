/** Causal, read-only forward audit of scalp WATCH and AMBUSH observations.
 * NEVER a broker fill, calibrated win probability or live-order permission.
 * Only subsequent fresh same-source quotes may settle an observation.
 */
import fs from 'node:fs';

type Side='BUY'|'SELL';
type Lane='GOLD_M1'|'GOLD_M5'|'GOLD_AMBUSH';
type Outcome='OPEN'|'FAVORABLE_FIRST'|'ADVERSE_FIRST'|'NO_THRESHOLD'|'UNKNOWN';
export type LeadQuote={price:number|null;at:number|null;source:string};
export type LeadCandidate={
  id:string;side:Side;score:number;status:'WATCH'|'ARMED'|'AMBUSH';
  setup:string;cost:number;
};
export type LeadObservation={
  id:string;lane:Lane;side:Side;score:number;setup:string;status:LeadCandidate['status'];
  source:string;startedAt:number;lastQuoteAt:number;expiresAt:number;
  startPrice:number;threshold:number;maxFavorable:number;maxAdverse:number;
  result:Outcome;resolvedAt:number|null;reason:string;
};
type LaneState={active:LeadObservation|null;history:LeadObservation[];seen:string[]};
type Audit={version:1;lanes:Record<Lane,LaneState>};
const PATH='/data/scalp-lead-audit-v1.json';
const MAX_GAP_MS=15_000;
const MAX_QUOTE_AGE_MS=10_000;
declare global {var __qannasScalpLeadAudit:Audit|undefined;}
function blank():Audit{return {version:1,lanes:{GOLD_M1:{active:null,history:[],seen:[]},
  GOLD_M5:{active:null,history:[],seen:[]},GOLD_AMBUSH:{active:null,history:[],seen:[]}}};}
function load():Audit{
  if(globalThis.__qannasScalpLeadAudit)return globalThis.__qannasScalpLeadAudit;
  let state=blank();
  try{
    const parsed=JSON.parse(fs.readFileSync(PATH,'utf8'));
    if(parsed?.version===1&&parsed?.lanes&&typeof parsed.lanes==='object'){
      for(const lane of Object.keys(state.lanes) as Lane[]){
        const row=parsed.lanes[lane];
        if(row&&Array.isArray(row.history)&&Array.isArray(row.seen)){
          state.lanes[lane]={
            active:row.active&&typeof row.active==='object'?row.active:null,
            history:row.history.slice(0,500),seen:row.seen.slice(0,500)
          };
        }
      }
    }
  }catch{}
  globalThis.__qannasScalpLeadAudit=state;
  return state;
}
function save(state:Audit){
  try{
    if(!fs.existsSync('/data'))return false;
    fs.writeFileSync(PATH+'.tmp',JSON.stringify(state));
    fs.renameSync(PATH+'.tmp',PATH);return true;
  }catch{return false;}
}
function fixed(n:number){return Math.round(n*10000)/10000;}
function fresh(quote:LeadQuote,now:number){
  return quote.price!=null&&Number.isFinite(quote.price)&&quote.price>0&&
    quote.at!=null&&Number.isFinite(quote.at)&&quote.at>0&&
    now-quote.at>=0&&now-quote.at<=MAX_QUOTE_AGE_MS&&
    typeof quote.source==='string'&&quote.source.length>0;
}
export function startLeadObservation(
  lane:Lane,candidate:LeadCandidate,quote:LeadQuote,now:number
):LeadObservation|null{
  if(!fresh(quote,now)||!candidate.id||candidate.side!=='BUY'&&candidate.side!=='SELL'||
    !Number.isFinite(candidate.score)||(candidate.status!=='AMBUSH'&&candidate.score<70)||
    !Number.isFinite(candidate.cost)||candidate.cost<=0||
    !['WATCH','ARMED','AMBUSH'].includes(candidate.status))return null;
  const price=Number(quote.price),at=Number(quote.at);
  // Fixed at first observation. Never adjust thresholds after seeing outcomes.
  const threshold=Math.max(candidate.cost*2,price*.0001);
  return {id:candidate.id,lane,side:candidate.side,score:candidate.score,
    setup:candidate.setup,status:candidate.status,source:quote.source,
    startedAt:at,lastQuoteAt:at,
    expiresAt:at+(lane==='GOLD_M1'?60_000:lane==='GOLD_M5'?300_000:30_000),
    startPrice:price,threshold:fixed(threshold),maxFavorable:0,maxAdverse:0,
    result:'OPEN',resolvedAt:null,reason:'OBSERVING_FUTURE_QUOTES'};
}
export function advanceLeadObservation(
  record:LeadObservation,quote:LeadQuote,now:number
):LeadObservation{
  if(record.result!=='OPEN')return record;
  const close=(result:Outcome,reason:string,at:number,updated=record)=>({
    ...updated,result,reason,resolvedAt:at
  });
  if(now>o.expiresAt+MAX_GAP_MS)return close('UNKNOWN','UNOBSERVED_HORIZON',now);
  if(!fresh(quote,now))return record; // allow a brief outage; expiration will mark UNKNOWN
  const at=Number(quote.at),price=Number(quote.price);
  if(at<=record.lastQuoteAt)return record; // never re-evaluate or backdate a quote
  if(quote.source!==record.source)return close('UNKNOWN','SOURCE_CHANGED',at);
  if(at-record.lastQuoteAt>MAX_GAP_MS)return close('UNKNOWN','QUOTE_GAP',at);
  if(at>record.expiresAt+5000)return close('UNKNOWN','HORIZON_NOT_OBSERVED',at);
  const o={...record};
  const dir=o.side==='BUY'?1:-1,delta=dir*(price-o.startPrice);
  o.maxFavorable=fixed(Math.max(o.maxFavorable,delta));
  o.maxAdverse=fixed(Math.max(o.maxAdverse,-delta));
  o.lastQuoteAt=at;
  // Bid/ask execution and path between ticks are unknown. Only first
  // OBSERVED threshold touch is scored; a single quote cannot touch both.
  if(delta>=o.threshold)return close('FAVORABLE_FIRST','FORWARD_MOVE_OBSERVED',at,o);
  if(delta<=-o.threshold)return close('ADVERSE_FIRST','OPPOSITE_MOVE_OBSERVED',at,o);
  if(at>=o.expiresAt)return close('NO_THRESHOLD','NO_DECISIVE_MOVE',at,o);
  return o;
}
export function summarizeLeadObservations(history:LeadObservation[],active:LeadObservation|null){
  const done=history.filter(x=>x.result!=='OPEN');
  const favorable=done.filter(x=>x.result==='FAVORABLE_FIRST');
  const adverse=done.filter(x=>x.result==='ADVERSE_FIRST');
  const neutral=done.filter(x=>x.result==='NO_THRESHOLD');
  const unknown=done.filter(x=>x.result==='UNKNOWN');
  const directionallyResolved=favorable.length+adverse.length;
  const waitResults=done.filter(x=>x.status==='WATCH');
  const ambushResults=done.filter(x=>x.status==='AMBUSH');
  const averageMs=favorable.length?Math.round(favorable.reduce((sum,x)=>sum+
    Math.max(0,Number(x.resolvedAt)-x.startedAt),0)/favorable.length):null;
  const sources:Record<string,number>={};
  for(const x of done)sources[x.source]=(sources[x.source]||0)+1;
  return {
    version:'scalp-forward-observer-v1',mode:'DIRECTIONAL_SHADOW_NOT_TRADES',
    total:done.length,pending:active?1:0,favorableFirst:favorable.length,
    adverseFirst:adverse.length,noThreshold:neutral.length,unknown:unknown.length,
    resolved:directionallyResolved,observedFavorablePct:directionallyResolved?
      Math.round(favorable.length/directionallyResolved*1000)/10:null,
    meanTimeToFavorableMs:averageMs,watchOnlyResults:waitResults.length,
    ambushOnlyResults:ambushResults.length,bySource:sources,
    verdict:directionallyResolved>=50?'OBSERVED_SAMPLE_ONLY':'COLLECTING',
    caveat:'First observed quote threshold, not a fill, profit, verified timing before market move or Exness execution.'
  };
}
/** One tracker per lane, no overlapping signals or repeated plan IDs.
 * Called only when a fresh market poll happens. Without polls, evidence is
 * UNKNOWN, never retroactively inferred from historic highs/lows.
 */
export function observeScalpLead(
  lane:Lane,quote:LeadQuote,now:number,candidate:LeadCandidate|null
){
  const state=load(),row=state.lanes[lane];
  let changed=false,closed=false;
  if(row.active){
    const prior=row.active,updated=advanceLeadObservation(prior,quote,now);
    if(updated!==prior){row.active=updated;changed=true;}
    if(row.active.result!=='OPEN'){
      row.history.unshift(row.active);row.history=row.history.slice(0,500);
      row.active=null;closed=true;changed=true;
    }
  }
  if(!closed&&!row.active&&candidate&&fresh(quote,now)){
    const id=candidate.id;
    if(!row.seen.includes(id)){
      // Duplicate timestamps are not independent events.
      const started=startLeadObservation(lane,candidate,quote,now);
      if(started){
        row.active=started;row.seen.unshift(id);row.seen=row.seen.slice(0,500);
        changed=true;
      }
    }
  }
  const persisted=changed?save(state):fs.existsSync(PATH);
  return {...summarizeLeadObservations(row.history,row.active),persisted};
}
export function peekScalpLead(lane:Lane){
  const state=load(),row=state.lanes[lane];
  return {...summarizeLeadObservations(row.history,row.active),persisted:fs.existsSync(PATH)};
}
