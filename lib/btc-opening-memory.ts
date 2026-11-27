import {goldOpeningRegime,type OpeningSide} from './gold-opening-call.ts';
import {marketSessionBucket,type MarketMemoryRow} from './gold-market-memory.ts';
import {btcOrderflowMatchesChart,compareBtcTapes,detectShortTapeWatch,type BtcOrderflow} from './btc-orderflow.ts';
import {detectWaveEnd,assessM5CandleLean} from './sniper-m5-candle-lean.ts';
import {classifyBtcPressure,type PressureReading} from './btc-pressure-persistence.ts';
export const BTC_OPENING_VERSION='BTC_M5_OPEN_V2';
type Side='BUY'|'SELL';
type Tick={at:number;price:number;source:string};
type Call={version:string;target:number;issued:number;side:Side;reason:string;source:string;quoteSource:string;quoteAt:number;priceAt:number};
export type BtcOpeningRow=MarketMemoryRow&{candidate?:Call;published?:boolean;block?:string;pressure?:PressureReading;legacySide?:OpeningSide;legacyPublished?:boolean};
const sources=['Kraken XBT/USD · fresh-candle fallback','Coinbase BTC-USD · extended M1'];
const isSide=(s:unknown):s is Side=>s==='BUY'||s==='SELL';
export function btcMemoryTick(source:string,tape:BtcOrderflow|null,now:number):Tick|null{
 const t=tape?.latestTrade;
 if(!sources.includes(source)||!tape?.ok||tape.status!=='LIVE_SAMPLE'||!btcOrderflowMatchesChart(source,tape.source,tape.source)||
  !t||!Number.isFinite(t.at)||t.at>now||now-t.at>10000||!Number.isFinite(t.price)||t.price<=0||
  tape.fetchedAt>now||now-tape.fetchedAt>10000)return null;
 return {at:t.at,price:t.price,source:tape.source};
}
export function validBtcOpeningCall(value:unknown,now:number):value is Call{
 const c=value as Call;
 return Boolean(c&&['BTC_M5_OPEN_V1',BTC_OPENING_VERSION].includes(c.version)&&sources.includes(c.source)&&btcOrderflowMatchesChart(c.source,c.quoteSource,c.quoteSource)&&
 Number.isSafeInteger(c.target)&&c.target%300000===0&&Number.isSafeInteger(c.issued)&&c.issued<=now&&
 c.target-c.issued>=1000&&c.target-c.issued<=30000&&now<c.target+300000&&isSide(c.side)&&typeof c.reason==='string'&&
 Number.isFinite(c.priceAt)&&c.priceAt>0&&Number.isFinite(c.quoteAt)&&c.quoteAt<=c.issued&&c.issued-c.quoteAt<=10000);
}
export function observeBtcOpening(now:number,chart:any,coinbase:BtcOrderflow|null,kraken:BtcOrderflow|null,previous:Tick|null):BtcOpeningRow|null{
 const target=(Math.floor(now/300000)+1)*300000,source=String(chart?.candleSource||'');
 if(target-now>30000||target-now<1000||!chart?.fresh)return null;
 const tape=source.startsWith('Kraken')?kraken:coinbase,tick=btcMemoryTick(source,tape,now);
 if(!tick)return null;
 const byTime=new Map<number,any>();
 for(const b of Array.isArray(chart.chartCandles)?chart.chartCandles:[]){
   if(!b||![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.time%60000!==0||b.time+60000>now-3000||
     b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))continue;
   const p=byTime.get(b.time);if(p&&[p.open,p.high,p.low,p.close].some((v,i)=>v!==[b.open,b.high,b.low,b.close][i]))return null;
   byTime.set(b.time,b);
 }
 const bars=[...byTime.values()].sort((a,b)=>a.time-b.time).slice(-24);
 if(bars.length<24||bars.at(-1).time!==target-120000||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000))return null;
 const ranges=bars.slice(-15).map((b,i,a)=>i?Math.max(b.high-b.low,Math.abs(b.high-a[i-1].close),Math.abs(b.low-a[i-1].close)):b.high-b.low);
 const atr=ranges.reduce((a,b)=>a+b,0)/ranges.length;if(!Number.isFinite(atr)||atr<=0)return null;
 const regime=goldOpeningRegime(bars,now),cross=compareBtcTapes(coinbase,kraken,now);
 const local=cross.venues.find(v=>v.source===tick.source);
 const flowSide:OpeningSide=local&&Math.abs(local.deltaPct)>=30?local.deltaPct>0?'BUY':'SELL':'WAIT';
 const row:BtcOpeningRow={target,observedAt:now,source,quoteAt:tick.at,mid:tick.price,spread:null,
  regime:regime.regime,baseline:regime.baseline,trend:regime.trend,atr,
  flowAt:local?.asOf??null,flowDelta:local?.deltaPct??null,fastDelta:local?.deltaPct??null,
  flowSources:cross.venues.length,flowSide,session:marketSessionBucket(target),outcome:'PENDING'};
 const setup=detectShortTapeWatch({now,price:tick.price,sourceMatches:true,tape,observedAt:tape!.fetchedAt,m1:bars});
 const end=detectWaveEnd({now,price:tick.price,quoteAt:tick.at,sourceReady:true,m1:bars});
 const lean=assessM5CandleLean({now,price:tick.price,sourceReady:true,m1:bars,m5:chart.chartHigherFrames?.m5});
 const legacySide=setup?.side??end?.side??(target-now<=15000&&lean.phase==='CLOSE'?lean.side:'WAIT');
 const pressure=classifyBtcPressure(tape?.pressureEvidence,now,atr,tick.price);
 // A reversal from absorption is a NEW setup, not a reversal of every
 // failed pressure call. Require proximity to a closed support/resistance.
 const recent=bars.slice(-6),low=Math.min(...recent.map(b=>b.low)),high=Math.max(...recent.map(b=>b.high));
 const level=pressure.level;
 const nearLevel=level!=null&&isSide(pressure.side)&&
   (pressure.side==='BUY'?Math.abs(level-low):Math.abs(level-high))<=atr*.35;
 const reclaim=pressure.kind==='ABSORPTION'&&nearLevel;
 const side=reclaim?pressure.side:legacySide;
 const oldSign=legacySide==='BUY'?1:-1;
 const oldAdvance=previous&&previous.source===tick.source&&previous.at<tick.at&&tick.at-previous.at<=10000&&oldSign*(tick.price-previous.price)>=atr*.02;
 const oldReversal=setup?.kind==='ABSORPTION'||end?.side===legacySide;
 const legacyPublished=Boolean(isSide(legacySide)&&cross.consensus!=='CONFLICT'&&
   (!isSide(cross.consensus)||cross.consensus===legacySide)&&oldAdvance&&
   (oldReversal||oldSign*(tick.price-bars.at(-6).open)<=3*atr)&&
   (regime.trend==='WAIT'||regime.trend===legacySide||oldReversal&&cross.consensus===legacySide)&&
   (flowSide===legacySide||setup?.kind==='ABSORPTION'&&cross.consensus===legacySide));
 const evidence={...row,pressure,legacySide,legacyPublished};
 if(!isSide(side))return evidence;
 const reason=reclaim?'انعكاس BTC محتمل · امتصاص ثم تحول التنفيذ واستعادة المستوى':
   setup?'تحضير BTC قبل الكسر · '+setup.kind:end?'انعكاس محتمل عند نهاية الموجة':'ترجيح BTC من إغلاقات M1';
 const candidate:Call={version:BTC_OPENING_VERSION,target,issued:now,side,reason,source,quoteSource:tick.source,quoteAt:tick.at,priceAt:tick.price};
 const sign=side==='BUY'?1:-1;
 const advance=previous&&previous.source===tick.source&&previous.at<tick.at&&tick.at-previous.at<=10000&&sign*(tick.price-previous.price)>=atr*.02;
 const opposing=regime.trend!=='WAIT'&&regime.trend!==side;
 const reversal=reclaim||end?.side===side||setup?.kind==='ABSORPTION'&&pressure.kind==='ABSORPTION'&&pressure.side===side;
 const extended=sign*(tick.price-bars.at(-6).open)>3*atr&&!reversal;
 const block=cross.consensus==='CONFLICT'?'CROSS_CONFLICT':
  isSide(cross.consensus)&&cross.consensus!==side?'CROSS_OPPOSITION':
  extended?'LATE_MOVE':!advance&&!reclaim?'NO_NEW_TICK_CONFIRMATION':
  opposing&&(!reversal||(!reclaim&&cross.consensus!==side))?'COUNTERTREND':
  pressure.kind==='TRANSIENT'?'TRANSIENT_PRESSURE':
  pressure.kind==='ABSORPTION'&&pressure.side!==side?'ABSORPTION_OPPOSITION':
  pressure.kind==='PERSISTENT'&&pressure.side===side||reclaim?null:
  'NO_PERSISTENT_PRESSURE';
 return {...evidence,candidate,published:!block,block:block??undefined};
}
/** Measure a distinct forward opportunity, not closing accuracy or P&L.
 * A hit requires an issued, visible-eligible forecast BEFORE M5 open,
 * pointing in the direction of its first unambiguous 1-ATR excursion.
 * Missing and ambiguous windows never count as wins. */
export function btcWaveCapture(rows:readonly BtcOpeningRow[]){
 const settled=rows.filter(r=>r.outcome==='SETTLED');
 const strong=settled.filter(r=>isSide(r.firstThreshold));
 const captured=strong.filter(r=>r.published===true&&r.candidate?.side===r.firstThreshold);
 const wrong=strong.filter(r=>r.published===true&&r.candidate&&r.candidate.side!==r.firstThreshold);
 const withheldCorrect=strong.filter(r=>r.published!==true&&r.candidate?.side===r.firstThreshold);
 const withheldWrong=strong.filter(r=>r.published!==true&&r.candidate&&r.candidate.side!==r.firstThreshold);
 const noCandidate=strong.filter(r=>!r.candidate);
 const leads=captured.map(r=>(r.target-r.candidate!.issued)/1000);
 return {definition:'FIRST_UNAMBIGUOUS_1_ATR_FROM_M5_OPEN',settled:settled.length,strong:strong.length,
  captured:captured.length,wrongPublished:wrong.length,withheldCorrect:withheldCorrect.length,
  withheldWrong:withheldWrong.length,noCandidate:noCandidate.length,
  missed:strong.length-captured.length,recallPct:strong.length?100*captured.length/strong.length:null,
  ambiguous:settled.filter(r=>r.firstThreshold==='AMBIGUOUS').length,
  noThreshold:settled.filter(r=>r.firstThreshold==='NONE').length,
  pending:rows.filter(r=>r.outcome==='PENDING').length,unknown:rows.filter(r=>r.outcome==='UNKNOWN').length,
  meanPreOpenLeadSeconds:leads.length?leads.reduce((a,b)=>a+b,0)/leads.length:null};
}
export function btcOpeningSummary(rows:readonly BtcOpeningRow[],now:number){
 const count=(published:boolean)=>{
  const a=rows.filter(r=>r.candidate&&Boolean(r.published)===published);
  const settled=a.filter(r=>r.outcome==='SETTLED'&&isSide(r.direction));
  const hits=settled.filter(r=>r.candidate!.side===r.direction).length;
  return {issued:a.length,hits,misses:settled.length-hits,pending:a.filter(r=>r.outcome==='PENDING').length,unknown:a.filter(r=>r.outcome==='UNKNOWN').length};
 };
 const published=rows.filter(r=>r.published&&r.candidate);
 const call=published.map(r=>r.candidate).filter(c=>validBtcOpeningCall(c,now)).at(-1)??null;
 return {versionQuality:countVersion(rows,BTC_OPENING_VERSION),pressureAudit:pressureAudit(rows),call,recent:published.slice(-36).map(r=>({call:r.candidate,outcome:r.outcome==='SETTLED'?r.direction==='FLAT'?'FLAT':r.candidate!.side===r.direction?'HIT':'MISS':r.outcome})),quality:count(true),withheldResearch:count(false),waveCapture:btcWaveCapture(rows),version:BTC_OPENING_VERSION};
}

function countVersion(rows:readonly BtcOpeningRow[],version:string){
 const a=rows.filter(r=>r.candidate?.version===version&&r.published===true&&r.outcome==='SETTLED'&&isSide(r.direction));
 const hits=a.filter(r=>r.direction===r.candidate!.side).length;return {hits,misses:a.length-hits};
}
function pressureAudit(rows:readonly BtcOpeningRow[]){
 const a=rows.filter(r=>r.pressure&&r.outcome==='SETTLED');
 const strong=a.filter(r=>isSide(r.firstThreshold));
 const legacy=strong.filter(r=>r.legacyPublished&&r.legacySide===r.firstThreshold).length;
 const next=strong.filter(r=>r.published&&r.candidate?.side===r.firstThreshold).length;
 return {sample:a.length,strong:strong.length,legacyCaptured:legacy,newCaptured:next,
   byKind:['UNAVAILABLE','BALANCED','TRANSIENT','PERSISTENT','ABSORPTION'].map(kind=>{
     const group=a.filter(r=>r.pressure?.kind===kind),eligible=group.filter(r=>isSide(r.firstThreshold));
     return {kind,n:group.length,strong:eligible.length,captured:eligible.filter(r=>r.published&&r.candidate?.side===r.firstThreshold).length};
   }),scope:'SAME_SNAPSHOT_RESEARCH_NOT_LIVE_V1_REPLAY'};
}
