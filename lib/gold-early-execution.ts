import type {Candle} from './engine';
import type {ScalpQuote} from './scalp-opportunities';
import type {Mt5GoldDomReading} from './gold-mt5-dom';
import type {EarlyExecutionLead} from './scalp-early-execution';
import {observedForwardReach} from './scalp-selection';

export type GoldEarlyLead=EarlyExecutionLead&{
  evidenceClass:'CLOSED_M1_ONLY'|'MT5_BROKER_DISPLAYED_DEPTH';
  flowIsExecutedTrades:false;
  goldMarketOpen:boolean;
  brokerDomStatus:Mt5GoldDomReading['status']|'NO_SOURCE';
};
type Args={
 c1:readonly Candle[];candleSource:string;quote:ScalpQuote;
 dom:Mt5GoldDomReading|null;now:number;marketOpen:boolean;
 estimatedRoundTripCost:number|null;
};
const stamp=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const num=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const round=(n:number)=>Math.round(n*100)/100;
const priceSourceMatches=(quoteSource:string,candleSource:string)=>
  (candleSource==='Biquote · MT5 XAUUSD candles'&&quoteSource==='Biquote · MT5 XAUUSD')||
  (candleSource==='Massive · C:XAUUSD'&&quoteSource==='Massive · XAUUSD institutional FX')||
  (candleSource==='Twelve Data · XAU/USD'&&quoteSource==='Twelve Data')||
  (/^Exness\/MT5 · XAUUSD[a-z0-9._-]*$/i.test(candleSource)&&
   quoteSource===candleSource);

/** GOLD research signal. Broker-displayed DOM is not executed trade flow.
 * Without real MT5 DOM, a sweep/reclaim may still be a non-actionable
 * PRICE-ONLY early watch. The watch never becomes an executable entry.
 * With live Exness quote, same-source bars and mature DOM, the algorithm
 * may show a conditional PAPER LIMIT candidate after risk/cost feasibility.
 */
export function detectGoldEarlyLead(a:Args):GoldEarlyLead{
 const {quote,now,dom}=a,source=String(quote.source||'unavailable');
 const brokerSource=/^Exness\/MT5 · XAUUSD[a-z0-9._-]*$/i.test(source);
 const domStatus=dom?.status||'NO_SOURCE';
 const basis:GoldEarlyLead={
  status:'WAIT',side:'WAIT',setup:'NONE',
  researchOnly:true,brokerExecutionVerified:false,
  evidenceClass:'CLOSED_M1_ONLY',flowIsExecutedTrades:false,
  goldMarketOpen:a.marketOpen,brokerDomStatus:domStatus,
  checkedAt:now,issuedFromClosedM1At:null,score:0,
  entryType:null,entry:null,stop:null,target:null,
  estimatedRoundTripCost:null,netR:null,reachCap:null,
  quoteSource:source,flowSource:dom?.source||'NONE',
  evidence:[],blockers:[],
  reason:'لا توجد فرصة ذهب مبكرة بأدلة سعرية من مصدر واحد'
 };
 const out=(status:GoldEarlyLead['status'],reason:string,
   extra:Partial<GoldEarlyLead>={}):GoldEarlyLead=>({...basis,...extra,status,reason});
 if(!a.marketOpen)return out('STALE','سوق الذهب مغلق؛ لا إشارة جديدة');
 if(!priceSourceMatches(source,a.candleSource))
   return out('STALE','مصدر سعر الذهب لا يطابق مصدر شموع M1؛ يمنع خلط مزودين');
 if(!stamp(quote.at)||!num(quote.price)||quote.price<=0||
   !num(now)||now-quote.at<0||now-quote.at>6000)
   return out('STALE','سعر الذهب قديم أو غير صالح');
 const closed=a.c1.filter(x=>stamp(x.time)&&x.time%60000===0&&
   x.time+60000<=now&&[x.open,x.high,x.low,x.close].every(num)&&
   x.low>0&&x.low<=Math.min(x.open,x.close)&&
   x.high>=Math.max(x.open,x.close))
   .sort((u,v)=>u.time-v.time);
 const last=closed.at(-1),recent=closed.slice(-80);
 if(!last||recent.length<80||now-last.time-60000>75000||
   recent.some((c,i)=>i>0&&c.time-recent[i-1].time!==60000))
   return out('STALE','شموع الذهب المغلقة غير متصلة أو قديمة؛ لا توقع');
 const at=last.time+60000;
 const prior=recent.slice(-13,-1);
 const trailing=recent.slice(-22);
 const trs=trailing.map((c,i)=>i===0?c.high-c.low:Math.max(
   c.high-c.low,Math.abs(c.high-trailing[i-1].close),
   Math.abs(c.low-trailing[i-1].close)));
 const atr=trs.slice(-20).reduce((sum,n)=>sum+n,0)/20;
 if(!Number.isFinite(atr)||atr<=0)
   return out('STALE','مدى الشموع غير صالح');
 const low=Math.min(...prior.map(c=>c.low)),high=Math.max(...prior.map(c=>c.high));
 const pad=Math.max(atr*.03,.02);
 const upSweep=last.low<low-pad&&last.close>low+pad;
 const downSweep=last.high>high+pad&&last.close<high-pad;
 if(upSweep===downSweep)
   return out('WAIT',upSweep?'سحب قمة وقاع متعارضان':'لا يوجد استرداد مستوى سيولة مؤكد بإغلاق M1');
 const side=upSweep?'BUY':'SELL',dir=upSweep?1:-1;
 const opened=quote.price;
 const maxMove=dir*(opened-last.close);
 if(maxMove>atr*.50||Math.abs(opened-last.close)>atr*.92)
   return out('LATE','الذهب تحرك بعيدًا بالفعل عن إعادة الاختبار؛ لا مطاردة',
     {side,setup:'SWEEP_RECLAIM',issuedFromClosedM1At:at,
      evidence:['استرداد مستوى من شمعة مغلقة · لكن السعر فات نقطة الدخول']});
 const near=upSweep?
   opened>=low-atr*.40&&opened<=low+atr*.55:
   opened<=high+atr*.40&&opened>=high-atr*.55;
 if(!near)return out('WAIT','الذهب ابتعد عن منطقة استرداد السيولة قبل الرصد',
   {issuedFromClosedM1At:at});
 const baseline=upSweep?'سحب سيولة من قاع سابق ثم استرداده بإغلاق M1':
   'سحب سيولة من قمة سابقة ثم رفضها بإغلاق M1';
 const initial={side,setup:'SWEEP_RECLAIM' as const,
   issuedFromClosedM1At:at,
   score:Math.min(78,55+Math.round(Math.abs(last.close-(upSweep?low:high))/atr*20)),
   evidence:[baseline,'سعر وOHLC من نفس مصدر الذهب · لا توجد صفقات هجومية مؤكدة']};
 if(!brokerSource||!dom||dom.source!=='MT5_BROKER_DOM'||
    !dom.available||dom.status!=='OBSERVING'||
    dom.symbol==null||source!=='Exness/MT5 · '+dom.symbol||
    !stamp(dom.asOf)||now-dom.asOf<0||now-dom.asOf>4500||
    dom.samples<3||dom.spanMs<8000)
   return out('EARLY_WATCH','تحضير سعري مبكر فقط؛ لا يوجد عمق MT5 مؤهل لنفس رمز الذهب',
    {...initial,blockers:['عمق وسيط Exness غير متاح/غير ناضج، لا تؤهل دخولًا'],
     evidenceClass:'CLOSED_M1_ONLY'});
 if(!num(dom.imbalancePct)||
   dom.possibleBidWithdrawal||dom.possibleAskWithdrawal)
   return out('EARLY_WATCH','عمق الوسيط غير مستقر؛ لا تأكيد تداول',
    {...initial,blockers:['قد يكون عمق الطلب أو العرض قد انسحب من دفتر MT5']});
 const agrees=upSweep?(dom.imbalancePct>=10&&dom.bidPersistent):
   (dom.imbalancePct<=-10&&dom.askPersistent);
 if(!agrees)
   return out('EARLY_WATCH','السعر استرد مستوى السيولة لكن دفتر MT5 المعلن لم يؤكد الاتجاه',
    {...initial,evidenceClass:'MT5_BROKER_DISPLAYED_DEPTH',
     evidence:[...initial.evidence,'عمق وسيط معلن وليس تنفيذات بورصة']});
 if(!num(quote.bid)||!num(quote.ask)||quote.bid<=0||
    quote.ask<=quote.bid)
   return out('EARLY_WATCH','سبريد الذهب عند وسيط MT5 غير صالح',
    {...initial,evidenceClass:'MT5_BROKER_DISPLAYED_DEPTH'});
 const hold=upSweep?Math.min(quote.bid,opened):Math.max(quote.ask,opened);
 const entry=round(hold-dir*Math.max(.01,atr*.025));
 const extreme=upSweep?Math.min(low,last.low):Math.max(high,last.high);
 const stop=round(extreme-dir*Math.max(.02,atr*.10));
 const risk=dir*(entry-stop);
 const cost=a.estimatedRoundTripCost;
 const c=num(cost)&&cost>0?cost:null;
 const reach=observedForwardReach(closed,side,1,240);
 const cap=reach.samples>=30&&reach.favorableP55!=null?
   Math.min(atr*1.7,reach.favorableP55):null;
 const blocked:string[]=[];
 if(!(risk>0&&risk<=atr*1.55))
   blocked.push('الوقف الهيكلي أبعد من حركة دقيقة معقولة');
 if(c==null)blocked.push('رسوم/انزلاق الذهب غير مقدّرة');
 if(cap==null)blocked.push('لا توجد 30 نافذة حركة بعد دخول تاريخي مغلق');
 else if(c!=null&&c>cap*.35)
   blocked.push('تكلفة التداول تستهلك أكثر من 35% من حركة الهدف المتوقعة');
 const required=c==null?null:risk*1.25+c*2.25;
 const distance=cap!=null&&required!=null&&required<=cap?
   Math.min(cap,Math.max(atr*.6,required)):null;
 const target=distance!=null?round(entry+dir*distance):null;
 const netR=target!=null&&c!=null&&risk>0?
   round((dir*(target-entry)-c)/(risk+c)):null;
 if(netR==null||netR<1.25)
   blocked.push('الهدف المتاح لا يغطي 1.25R صافيًا بعد تكلفة التداول');
 const details:Partial<GoldEarlyLead>={
  ...initial,score:Math.min(87,initial.score+8+
   Math.min(8,Math.round(Math.abs(dom.imbalancePct)*.12))),
  evidenceClass:'MT5_BROKER_DISPLAYED_DEPTH',flowSource:'MT5_BROKER_DOM',
  evidence:[...initial.evidence,'توزيع عرض/طلب معلن من Exness/MT5 · ليس أوامر منفذة'],
  entryType:upSweep?'BUY_LIMIT':'SELL_LIMIT',
  entry,stop,target,reachCap:cap,netR,estimatedRoundTripCost:c,blockers:blocked
 };
 if(blocked.length)return out('COST_BLOCKED',blocked[0],details);
 return out('ENTRY_CANDIDATE','LIMIT بحثي مشروط من عمق وسيط معلن وهدف بعد التكلفة؛ لا صفقة Exness منفذة',
  details);
}
