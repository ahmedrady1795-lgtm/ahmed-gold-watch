// Evidence-oriented market analysis skills for the voice assistant.
// Only explain observed indicators. Never fabricate a trade, broker fill, or price.
export type AnalysisSkill='TREND'|'SCALP'|'BREAKOUT'|'LIQUIDITY'|'COST'|'FORECAST'|'RISK'|'VALIDATION'|'MARKET_REVIEW';
const n=(x:unknown):number|null=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const obj=(x:any)=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const take=(s:unknown,max=240)=>String(s??'').slice(0,max);
const arr=(v:any,len=5)=>Array.isArray(v)?v.slice(0,len):[];
function kind(q:string):AnalysisSkill{
 if(/سبريد|عمول|انزلاق|تكلف|صافي|spread|fee|cost|rr|ربح بعد/.test(q))return 'COST';
 if(/اختراق|كسر|breakout|تأكيد|تاكيد|فخ|مصيدة/.test(q))return 'BREAKOUT';
 if(/سيول|اوردر بوك|أوردر بوك|order book|حجم التداول|تجميع|تصريف/.test(q))return 'LIQUIDITY';
 if(/سكالب|سكالبينج|دقيق|ثوان|م1|m1|m5|30 ثاني|30 ثان|صفق/.test(q))return 'SCALP';
 if(/موثوق|دقة|نتائج|اختبار|نسبة نجاح|قياس|اتحقق|فاشل|الأداء/.test(q))return 'VALIDATION';
 if(/وقف|مخاطر|أمان|خسار|خطورة|risk|إبطال|إلغاء/.test(q))return 'RISK';
 if(/توقع|هدف|هيوصل|بعد شوية|ربع ساعة|15 دق|forecast/.test(q))return 'FORECAST';
 if(/اتجاه|صعود|هبوط|يرتفع|ينزل|ترند|trend/.test(q))return 'TREND';
 return 'MARKET_REVIEW';
}
export function marketIntent(message:string){
 return /ذهب|دهب|gold|xau|بتكوين|بيتكوين|bitcoin|btc|سوق|اسعار|أسعار|تداول|صفق|سكالب|سيول|اختراق|فريم|شموع|بورص|ميتاتريدر|meta.?trader|exness|مؤشر|مقاومة|دعم|شراء|بيع|سبريد|التحليل|السعر|تحليل السوق/i.test(message);
}
function signal(s:any){
 const x=obj(s);
 return x.side==='BUY'||x.side==='SELL'||x.side==='WAIT'?x.side:'UNKNOWN';
}
function plan(p:any){
 return {horizon:n(p?.horizon),status:take(p?.status,40),side:signal(p),
  reason:take(p?.reason||p?.blockers?.[0],200),netRR:n(p?.netRR),
  estimatedCost:n(p?.cost),entry:n(p?.entry??p?.entryPrice),
  stop:n(p?.stop??p?.sl),target:n(p?.target??p?.tp)};
}
function view(key:'gold'|'bitcoin',raw:any,client:any,now:number){
 const src=obj(raw),live=obj(client);
 const x=Object.keys(src).length?src:live;
 const l=obj(x.livePulse),lead=obj(x.marketLead),d=obj(x.recommendation),f=obj(x.forwardMove);
 const str=obj(x.movementStructure),mesh=obj(x.marketToolMesh),liq=obj(x.liquidity),h4=obj(x.h4Context);
 const scalp=obj(x.scalpDesk),cScalp=arr(live.scalp,3);
 const plans=arr(scalp.plans,4).map(plan);
 const quoteTime=n(l.sourceTime??x.checkedAt??live.checkedAt);
 const ageMs=quoteTime?Math.max(0,now-quoteTime):null;
 const snapAge=ageMs==null?'UNKNOWN':ageMs<15000?'FRESH':ageMs<60000?'DELAYED':'STALE';
 return {
  asset:key==='gold'?'GOLD':'BTC',price:n(x.price??l.price??live.price),
  priceSource:take(l.source||x.priceSource||'',100),priceTime:quoteTime,priceAgeMs:ageMs,
  priceFreshness:snapAge,
  recommendation:{side:signal({side:d.action??live.side}),confidence:n(d.confidence??live.confidence),
    quality:take(d.quality||live.quality,60),invalidation:n(d.invalidation)},
  marketLead:{side:signal(lead),stage:take(lead.stage,40),
    confidence:n(lead.confidence),armed:Boolean(lead.armed),
    stability:n(lead.stability),reason:take(lead.reason,230)},
  timeframes:{m1:str.m1?{side:signal(str.m1),confidence:n(str.m1.confidence),
     phase:take(str.m1.phase,35),structure:take(str.m1.structure,70)}:null,
    m5:str.m5?{side:signal(str.m5),confidence:n(str.m5.confidence),
     phase:take(str.m5.phase,35),structure:take(str.m5.structure,70)}:null,
    h4:h4.ok?{side:signal(h4),confidence:n(h4.confidence),
     structure:take(h4.structure,85),support:n(h4.support),resistance:n(h4.resistance)}:null},
  forecast15:{side:signal(f.side?f:live.forecastSide?{side:live.forecastSide}:{}),
    confidence:n(f.confidence??live.forecastConfidence),target:n(f.target??live.target),
    reason:take(f.reason||arr(f.reasons,1)[0],230),
    invalidation:n(f.invalidation)},
  liquidity:{ok:Boolean(liq.ok),mode:take(liq.mode,50),side:signal(liq),
    quality:n(liq.quality),source:take(liq.source,110),
    warnings:arr(liq.warnings,3).map((v:any)=>take(v,160))},
  execution:{plans:plans.length?plans:cScalp.map(plan),
    note:'Plans are analysis/watch candidates, not real broker execution. netRR and cost are estimates.'},
  validation:{m1:x.directionValidation?.m1?{qualified:Boolean(x.directionValidation.m1.qualified),
    status:take(x.directionValidation.m1.status,35),
    oosSamples:n(x.directionValidation.m1.holdout?.n),oosAccuracyPct:n(x.directionValidation.m1.holdout?.accuracyPct)}:null,
    m5:x.directionValidation?.m5?{qualified:Boolean(x.directionValidation.m5.qualified),
    status:take(x.directionValidation.m5.status,35),
    oosSamples:n(x.directionValidation.m5.holdout?.n),oosAccuracyPct:n(x.directionValidation.m5.holdout?.accuracyPct)}:null},
  toolConsensus:mesh.summary?{side:signal(mesh.summary),agreement:n(mesh.summary.agreement),
    available:n(mesh.summary.available),total:n(mesh.summary.total),
    priceSpreadBps:n(mesh.summary.priceSpreadBps),
    warnings:arr(mesh.summary.warnings,3).map((v:any)=>take(v,110))}:null
 };
}
export function buildCoreAnalysisSkills(message:string,payload:any,client:any,now=Date.now()){
 if(!marketIntent(message))return null;
 const q=message.toLowerCase(),skill=kind(q);
 const btc=/بيتكوين|بتكوين|btc|bitcoin/i.test(q);
 const gold=/ذهب|دهب|gold|xau/i.test(q);
 const choose=gold&&!btc?['gold']:btc&&!gold?['bitcoin']:['gold','bitcoin'];
 const requiredChecks={
  TREND:['Compare M1/M5 with H4 and market lead; describe agreement or disagreement.','If candles are stale or frames conflict, say WAIT rather than infer momentum.'],
  SCALP:['Examine ARMED status, real-time quote age, M1/M5 agreement, estimated spread/cost/netRR.','Without broker bid/ask fill simulation and fresh ticks, no guaranteed entry or exact target.'],
  BREAKOUT:['Look for a confirmed close and retest, volume/liquidity support, and avoid false-breakout traps.','If the evidence omits actual closed-candle confirmation, say unconfirmed.'],
  LIQUIDITY:['Separate real DOM/order book from candle-volume proxy.','Do not treat proxy volumes as institutional order flow.'],
  COST:['Compare indicative execution costs with expected excursion, RR after cost, and possible slippage.','Do not claim exact Exness commissions without verified account-specific data.'],
  FORECAST:['Compare the 15-minute scenario, M1/M5 confirmation, opposing hypothesis and invalidation.','Targets and probabilities are not guarantees.'],
  RISK:['Check available invalidation, spread volatility, stale feeds, weak confidence and contradictory signals.','Never invent lot size, stop, take profit or account risk.'],
  VALIDATION:['Check out-of-sample sample size, selection bias, calibration and performance vs baseline.','Never equate historical directional accuracy to expected financial profit.'],
  MARKET_REVIEW:['Describe what the data genuinely supports, counterargument, and one clear next condition.','Make uncertainties and source freshness explicit.']
 }[skill];
 const source=obj(payload);
 return {skill,checkedAt:now,sourceSnapshotAt:n(source.checkedAt??client?.checkedAt),
  sourceSnapshotAgeMs:n(source.checkedAt??client?.checkedAt)?Math.max(0,now-Number(source.checkedAt??client?.checkedAt)):null,
  checks:requiredChecks,assets:choose.map(k=>view(k as 'gold'|'bitcoin',source[k],obj(client)[k],now)),
  protocol:['Independent market evidence takes priority over online claims.','Explain supporting evidence and contradicting evidence.','If data is missing, admit uncertainty and prefer WAIT over fabricated entries.','This is scenario analysis, not broker order execution.']};
}
