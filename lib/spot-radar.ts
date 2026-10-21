import type {SpotEdge} from './spot-edge';
import type {SpotIgnition} from './spot-ignition';
import type {UpsideFocus} from './spot-high-upside';
// Qannas Spot: auditable public-data signals, not knowledge of future orders.
export type Candle={time:number;open:number;high:number;low:number;close:number;quoteVolume:number;buyQuote:number};
export type Book={bidShare:number;spreadBps:number;bidWallShare:number;askWallShare:number};
// Separate 24h ranking: hourly candles are observational evidence, never a
// calibrated probability that a pump will occur.
export type Spot24hOutlook={
  rankScore:number;state:'HIGH'|'POSSIBLE'|'AVOID';
  reason:string;hourlyChange24:number;volumeRatio24:number;
  takerBuyShare12:number;freshAt:number;
};

export type Absorption={
  state:'NONE'|'SELL_ABSORPTION'|'BUY_RECLAIM';
  sellShare:number;pressureRatio:number;holdPct:number;reclaimBuyShare:number;
  reboundPct:number;
};
export type Candidate={
  symbol:string;price:number;change24h:number;volume24h:number;
  score:number;phase:'EARLY'|'BUILDING'|'WATCH'|'EXTENDED';freshAt:number;
  volumeImpulse:number;buyShare:number;relative15m:number|null;change15m:number;
  flowDelta5m:number;flowShiftPct:number;rangeCompression:number;trapRisk:boolean;
  absorption:Absorption;
  book:Book|null;breakout:number;distancePct:number;invalidation:number;
  target1:number;target2:number;estimatedCostPct:number;netRR:number;
  reasons:string[];warnings:string[];outlook24h?:Spot24hOutlook;edge?:SpotEdge;highUpside?:UpsideFocus|null;
  spotIgnition?:SpotIgnition;
  candles:Candle[];
};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const safe=(v:unknown)=>Number(v);
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
/**
 * Observation-only selling absorption:
 * - Aggressive taker sells dominated an unusually busy PRIOR 7-minute window.
 * - Price resisted that pressure relative to recent baseline range.
 * - BUY_RECLAIM requires a subsequent five CLOSED bars with returning
 *   aggressive buys, reclaiming price and no dominant upper-wick supply.
 * It cannot identify a whale, iceberg, hidden order, or future pump.
 */
export function detectAbsorption(input:Candle[]):Absorption {
  const missing:Absorption={state:'NONE',sellShare:0,pressureRatio:0,
    holdPct:0,reclaimBuyShare:0,reboundPct:0};
  const xs=input.slice(-70);
  if(xs.length<62)return missing;
  const baseline=xs.slice(-62,-12),pressure=xs.slice(-12,-5),reclaim=xs.slice(-5);
  const baseVol=sum(baseline.map(x=>x.quoteVolume))/baseline.length;
  const sellVol=sum(pressure.map(x=>x.quoteVolume));
  const recentVol=sum(reclaim.map(x=>x.quoteVolume));
  if(baseVol<=0||sellVol<=0||recentVol<=0)return missing;
  const sellShare=1-sum(pressure.map(x=>x.buyQuote))/sellVol;
  const pressureRatio=(sellVol/pressure.length)/baseVol;
  const holdPct=(pressure.at(-1)!.close/pressure[0].open-1)*100;
  const reclaimBuyShare=sum(reclaim.map(x=>x.buyQuote))/recentVol;
  const reboundPct=(reclaim.at(-1)!.close/pressure.at(-1)!.close-1)*100;
  const typicalBarRangePct=sum(baseline.map(x=>(x.high-x.low)/x.close*100))/baseline.length;
  const maxDropPct=Math.max(.22,Math.min(.6,typicalBarRangePct*1.25));
  const recentUpperWick=sum(reclaim.map(x=>x.high-Math.max(x.open,x.close)));
  const recentRange=Math.max(1e-12,sum(reclaim.map(x=>x.high-x.low)));
  const heavyTopSupply=recentUpperWick/recentRange>.43;
  const pressureLow=Math.min(...pressure.map(x=>x.low));
  const supportHeld=reclaim.at(-1)!.close>=pressureLow&&
    reclaim.at(-1)!.close>=pressure.at(-1)!.close;
  const sellingAbsorbed=sellShare>=.6&&pressureRatio>=1.35&&
    holdPct>=-maxDropPct&&holdPct<=.8&&supportHeld;
  const recovered=sellingAbsorbed&&reclaimBuyShare>=.55&&
    reclaimBuyShare-(1-sellShare)>=.16&&
    reboundPct>=.08&&recentVol/reclaim.length>=baseVol*1.05&&!heavyTopSupply;
  return {state:recovered?'BUY_RECLAIM':sellingAbsorbed?'SELL_ABSORPTION':'NONE',
    sellShare,pressureRatio,holdPct,reclaimBuyShare,reboundPct};
}
export function parseKlines(raw:unknown,now=Date.now()):Candle[]{
  if(!Array.isArray(raw))return [];
  const rows:Candle[]=[];
  for(const k of raw){
    if(!Array.isArray(k)||k.length<11)continue;
    const time=safe(k[0]),closeTime=safe(k[6]),open=safe(k[1]),high=safe(k[2]),
      low=safe(k[3]),close=safe(k[4]),quoteVolume=safe(k[7]),buyQuote=safe(k[10]);
    if(![time,closeTime,open,high,low,close,quoteVolume,buyQuote].every(Number.isFinite)||
       time<=0||closeTime>now||time>now||Math.abs(closeTime-time-59999)>1000||
       low<=0||high<Math.max(open,close)||low>Math.min(open,close)||
       quoteVolume<0||buyQuote<0||buyQuote>quoteVolume*1.00001)continue;
    rows.push({time,open,high,low,close,quoteVolume,buyQuote});
  }
  return rows.sort((a,b)=>a.time-b.time).filter((c,i,a)=>i===0||c.time!==a[i-1].time);
}
export function parseBook(raw:unknown,price:number):Book|null{
  const x=raw as {bids?:unknown;asks?:unknown};
  if(!x||!Array.isArray(x.bids)||!Array.isArray(x.asks)||!price)return null;
  const calc=(levels:unknown,side:'bid'|'ask')=>{
    const vals:(number)[]=[];
    for(const v of levels as unknown[]){
      if(!Array.isArray(v))continue;
      const p=Number(v[0]),q=Number(v[1]);
      if(!Number.isFinite(p)||!Number.isFinite(q)||p<=0||q<=0)continue;
      if(Math.abs(p-price)/price<=0.01&&
        (side==='bid'?p<=price*1.0005:p>=price*.9995)) vals.push(p*q);
    }
    return {total:sum(vals),wall:vals.length?Math.max(...vals):0};
  };
  const bid=calc(x.bids,'bid'),ask=calc(x.asks,'ask');
  const bp=Number((x.bids[0] as unknown[])?.[0]),ap=Number((x.asks[0] as unknown[])?.[0]);
  if(!bid.total||!ask.total||!Number.isFinite(bp)||!Number.isFinite(ap)||ap<=bp)return null;
  return {bidShare:bid.total/(bid.total+ask.total),
    spreadBps:(ap-bp)/((ap+bp)/2)*10000,
    bidWallShare:bid.wall/bid.total,askWallShare:ask.wall/ask.total};
}
export function scoreCoin(
  symbol:string,change24h:number,volume24h:number,rawCandles:Candle[],
  btc15m:number|null,book:Book|null,now=Date.now()
):Candidate|null{
  const candles=rawCandles.slice(-70), n=candles.length;
  if(n<60||!Number.isFinite(change24h)||!Number.isFinite(volume24h)||
     volume24h<1500000||now-(candles[n-1].time+60000)>150000)return null;
  for(let i=n-60;i<n;i++)if(i>0&&candles[i].time-candles[i-1].time!==60000)return null;
  const price=candles[n-1].close;
  const recent=candles.slice(-5),past=candles.slice(-55,-5);
  const baseAvg=sum(past.map(c=>c.quoteVolume))/past.length;
  const recentVol=sum(recent.map(c=>c.quoteVolume));
  if(baseAvg<=0||recentVol<=0||!Number.isFinite(price)||price<=0)return null;
  const volumeImpulse=(recentVol/5)/baseAvg;
  const buyShare=clamp(sum(recent.map(c=>c.buyQuote))/recentVol,0,1);
  const prev20=candles.slice(-25,-5);
  const prev20Volume=sum(prev20.map(c=>c.quoteVolume));
  const prevBuyShare=prev20Volume>0?sum(prev20.map(c=>c.buyQuote))/prev20Volume:.5;
  // Taker buy quote volume minus taker sell quote volume: observed signed-flow estimate.
  const flowDelta5m=2*sum(recent.map(c=>c.buyQuote))-recentVol;
  const flowShiftPct=(buyShare-prevBuyShare)*100;
  const trueRange=(xs:Candle[])=>xs.map((c,i)=>Math.max(c.high-c.low,
    i?Math.abs(c.high-xs[i-1].close):0,i?Math.abs(c.low-xs[i-1].close):0));
  const recentTR=trueRange(candles.slice(-11));
  const prevTR=trueRange(candles.slice(-41,-11));
  const avg=(xs:number[])=>xs.length?sum(xs)/xs.length:0;
  const rangeCompression=prevTR.length&&avg(prevTR)>0?avg(recentTR)/avg(prevTR):1;
  const upperWickRatio=sum(recent.map(c=>c.high-Math.max(c.open,c.close)))/
    Math.max(1e-12,sum(recent.map(c=>c.high-c.low)));
  const trapRisk=upperWickRatio>.43&&volumeImpulse>1.8;
  const absorption=detectAbsorption(candles);
  const change15m=(price/candles[n-16].close-1)*100;
  const relative15m=btc15m===null?null:change15m-btc15m;
  const breakout=Math.max(...candles.slice(-36,-5).map(c=>c.high));
  const distancePct=(breakout/price-1)*100;
  const lastLow=Math.min(...candles.slice(-15).map(c=>c.low));
  const ranges=candles.slice(-16).map((c,i,a)=>Math.max(c.high-c.low,
    i?Math.abs(c.high-a[i-1].close):c.high-c.low,i?Math.abs(c.low-a[i-1].close):c.high-c.low));
  const atr=Math.max(sum(ranges)/ranges.length,price*.0008);
  const invalidation=Math.min(lastLow-atr*.2,price-atr*1.2);
  const target1=Math.max(price+atr*1.5,breakout+atr*1.2);
  const target2=target1+atr*1.6;
  // Paper-only friction assumption: 10bps fee on each side + 5bps total
  // slippage, plus one observed spread. Actual VIP/BNB fees may differ.
  const estimatedCostPct=(25+(book?.spreadBps??12))/100;
  const totalFriction=price*estimatedCostPct/100;
  const netReward=target1-price-totalFriction;
  const netRisk=price-invalidation+totalFriction;
  const netRR=netRisk>0?netReward/netRisk:-1;
  const extended=distancePct<-.018*100||change15m>6||change24h>16;
  let score=0;
  score+=clamp((volumeImpulse-0.8)/3.2,0,1)*25;
  score+=clamp((buyShare-.47)/.2,0,1)*22;
  score+=distancePct>=0&&distancePct<=1.8?15*(1-distancePct/2.7):distancePct<0&&distancePct>=-1?10:0;
  score+=relative15m===null?0:clamp((relative15m+.25)/2.5,0,1)*11;
  score+=clamp((change15m+.2)/2.8,0,1)*11;
  score+=clamp((flowShiftPct-2)/16,0,1)*8;
  score+=rangeCompression<.8&&volumeImpulse>1.3?5:0;
  if(absorption.state==='BUY_RECLAIM')score+=9;
  else if(absorption.state==='SELL_ABSORPTION')score+=3;
  score+=clamp(Math.log10(Math.max(1,volume24h)/1500000)/2,0,1)*7;
  if(book){score+=clamp((book.bidShare-.48)/.23,0,1)*9;
    if(book.spreadBps>25)score-=14;
  }
  if(extended)score-=24;
  if(change15m<-.8)score-=14;
  if(trapRisk)score-=12;
  if(netRR<1.15)score-=16;
  score=Math.round(clamp(score,0,100));
  const buyConfirmed=buyShare>=.55&&volumeImpulse>=1.6;
  const nearLevel=distancePct>=-.5&&distancePct<=1.35;
  const depthOk=book!==null&&book.bidShare>=.53&&book.spreadBps<=25;
  const phase:Candidate['phase']=extended?'EXTENDED':
    score>=72&&buyConfirmed&&nearLevel&&depthOk&&!trapRisk&&netRR>=1.15?'EARLY':
    score>=54&&buyShare>=.52&&volumeImpulse>=1.2&&!trapRisk&&
    change15m>=-.5&&netRR>=.5?'BUILDING':'WATCH';
  const reasons:string[]=[];
  if(volumeImpulse>=1.3)reasons.push('تسارع تداول فعلي ×'+volumeImpulse.toFixed(1));
  if(buyShare>=.53)reasons.push('شراء منفّذ '+Math.round(buyShare*100)+'٪');
  if(nearLevel)reasons.push('قريب من مقاومة '+Math.abs(distancePct).toFixed(2)+'٪');
  if(relative15m!==null&&relative15m>.4)reasons.push('أقوى من BTC خلال 15د');
  if(book&&book.bidShare>.54)reasons.push('طلبات شراء مرئية '+Math.round(book.bidShare*100)+'٪');
  if(flowShiftPct>=7)reasons.push('تغير ميزان الشراء +'+flowShiftPct.toFixed(0)+' نقطة');
  if(rangeCompression<.8&&volumeImpulse>1.3)reasons.push('انضغاط تقلب مع نشاط تداول');
  if(absorption.state==='BUY_RECLAIM')reasons.push('رُصد امتصاص بيع ثم عودة شراء منفّذ');
  else if(absorption.state==='SELL_ABSORPTION')reasons.push('ضغط بيع منفّذ والسعر متماسك: امتصاص محتمل');
  const warnings:string[]=[];
  if(extended)warnings.push('السعر ممتد؛ خطر مطاردة الارتفاع');
  if(absorption.state==='SELL_ABSORPTION')warnings.push('امتصاص محتمل فقط: لم يتأكد ارتداد الشراء بعد');
  if(trapRisk)warnings.push('ذيول علوية مرتفعة: احتمال تصريف أو فخ سيولة');
  if(netRR<1.15)warnings.push('الهدف الأول ضعيف بعد تقدير الرسوم والانزلاق والسبريد');
  if(volumeImpulse>1.8&&buyShare>.56&&Math.abs(change15m)<.4)
    warnings.push('شراء نشط بلا تقدم سعري: قد يكون العرض يمتص الشراء');
  if(book===null)warnings.push('عمق دفتر الأوامر غير مؤكد');
  if(book&&book.spreadBps>25)warnings.push('فارق سعري مرتفع');
  if(volumeImpulse<1.2)warnings.push('لم يثبت تسارع في السيولة');
  if(btc15m===null)warnings.push('المقارنة مع BTC غير متاحة');
  return {symbol,price,change24h,volume24h,score,phase,
    freshAt:candles[n-1].time+60000,volumeImpulse,buyShare,relative15m,
    flowDelta5m,flowShiftPct,rangeCompression,trapRisk,absorption,
    change15m,book,breakout,distancePct,invalidation,target1,target2,
    estimatedCostPct,netRR,
    reasons,warnings,candles:candles.slice(-70)};
}

const HOUR=3600000;
/** Never use the current unfinished Binance 1h candle for ranking. */
export function parseHourlyKlines(raw:unknown,now=Date.now()):Candle[]{
  if(!Array.isArray(raw))return [];
  const rows:Candle[]=[];
  for(const r of raw){
    if(!Array.isArray(r)||r.length<11)continue;
    const time=Number(r[0]),end=Number(r[6]),open=Number(r[1]),high=Number(r[2]),
      low=Number(r[3]),close=Number(r[4]),quoteVolume=Number(r[7]),buyQuote=Number(r[10]);
    if(![time,end,open,high,low,close,quoteVolume,buyQuote].every(Number.isFinite)||
      time<=0||end>now||time>now||Math.abs(end-time-(HOUR-1))>1000||
      low<=0||high<Math.max(open,close)||low>Math.min(open,close)||
      quoteVolume<0||buyQuote<0||buyQuote>quoteVolume*1.00001)continue;
    rows.push({time,open,high,low,close,quoteVolume,buyQuote});
  }
  return rows.sort((a,b)=>a.time-b.time).filter((c,i,a)=>i===0||c.time!==a[i-1].time);
}
export function score24hOutlook(
  coin:Candidate,hourly:Candle[],btc24h:number|null,now=Date.now()
):Spot24hOutlook|null{
  const h=hourly.slice(-72),n=h.length;
  if(n<55||now-(h[n-1].time+HOUR)>2*HOUR||h[n-1].time+HOUR>now+1000)return null;
  for(let i=n-54;i<n;i++)if(i>0&&h[i].time-h[i-1].time!==HOUR)return null;
  // Current minute spot and the previous hourly close must reflect the same venue.
  if(Math.abs(coin.price/h[n-1].close-1)>.04)return null;
  const latest24=h.slice(-24),previous24=h.slice(-48,-24),recent12=h.slice(-12);
  const v24=sum(latest24.map(x=>x.quoteVolume)),vPrev=sum(previous24.map(x=>x.quoteVolume));
  if(v24<=0||vPrev<=0)return null;
  const volumeRatio24=v24/vPrev;
  const takerBuyShare12=sum(recent12.map(x=>x.buyQuote))/
    Math.max(1,sum(recent12.map(x=>x.quoteVolume)));
  const hourlyChange24=(coin.price/h[n-25].close-1)*100;
  const change4=(coin.price/h[n-5].close-1)*100;
  const relative24=btc24h===null?null:hourlyChange24-btc24h;
  const priorHigh=Math.max(...h.slice(-52,-4).map(x=>x.high));
  const distanceToBreakout=(priorHigh/coin.price-1)*100;
  const volNow4=sum(h.slice(-4).map(x=>x.quoteVolume))/4;
  const volPrior20=sum(h.slice(-24,-4).map(x=>x.quoteVolume))/20;
  const surge4=volPrior20>0?volNow4/volPrior20:1;
  const alreadyRunning=hourlyChange24>12||change4>5||distanceToBreakout < -3;
  let score=0;
  score+=clamp((volumeRatio24-.8)/1.1,0,1)*23;
  score+=clamp((takerBuyShare12-.46)/.2,0,1)*19;
  score+=clamp((surge4-.85)/1.3,0,1)*10;
  score+=change4>=-.7&&change4<=3.5?11:change4>3.5&&change4<=5?5:0;
  score+=hourlyChange24>=-2&&hourlyChange24<=10?10:0;
  score+=distanceToBreakout>=0&&distanceToBreakout<=4?13*(1-distanceToBreakout/6):
    distanceToBreakout<0&&distanceToBreakout>=-1.5?7:0;
  score+=relative24===null?0:clamp((relative24+.7)/5,0,1)*9;
  score+=coin.buyShare>.54&&coin.flowDelta5m>0?7:0;
  score+=coin.absorption.state==='BUY_RECLAIM'?6:0;
  score+=coin.book?.bidShare!==undefined&&coin.book.bidShare>.54?4:0;
  if(alreadyRunning)score-=28;
  if(coin.trapRisk)score-=25;
  if(takerBuyShare12<.47)score-=15;
  if(hourlyChange24 < -7 || change4 < -3)score-=20;
  if(coin.book&&coin.book.spreadBps>25)score-=12;
  const rankScore=Math.round(clamp(score,0,100));
  const state:Spot24hOutlook['state']=alreadyRunning||coin.trapRisk?'AVOID':
    rankScore>=65&&takerBuyShare12>=.53&&volumeRatio24>=1?'HIGH':
    rankScore>=45?'POSSIBLE':'AVOID';
  const reasons:string[]=[];
  if(volumeRatio24>=1.15)reasons.push('نشاط سيولة 24 ساعة');
  if(takerBuyShare12>=.54)reasons.push('شراء منفذ يتفوق على البيع');
  if(distanceToBreakout>=0&&distanceToBreakout<=3)reasons.push('قرب مقاومة مهمة');
  if(coin.absorption.state==='BUY_RECLAIM')reasons.push('امتصاص بيع ثم عودة شراء');
  if(relative24!==null&&relative24>=2)reasons.push('قوة أعلى من بيتكوين');
  return {rankScore,state,reason:reasons.slice(0,2).join(' · ')||
    'متابعة قوة السعر والسيولة',hourlyChange24,volumeRatio24,
    takerBuyShare12,freshAt:h[n-1].time+HOUR};
}
