// Qannas Spot: auditable public-data signals, not knowledge of future orders.
export type Candle={time:number;open:number;high:number;low:number;close:number;quoteVolume:number;buyQuote:number};
export type Book={bidShare:number;spreadBps:number;bidWallShare:number;askWallShare:number};
export type Candidate={
  symbol:string;price:number;change24h:number;volume24h:number;
  score:number;phase:'EARLY'|'BUILDING'|'WATCH'|'EXTENDED';freshAt:number;
  volumeImpulse:number;buyShare:number;relative15m:number|null;change15m:number;
  flowDelta5m:number;flowShiftPct:number;rangeCompression:number;trapRisk:boolean;
  book:Book|null;breakout:number;distancePct:number;invalidation:number;
  target1:number;target2:number;estimatedCostPct:number;netRR:number;
  reasons:string[];warnings:string[];
  candles:Candle[];
};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const safe=(v:unknown)=>Number(v);
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
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
  const warnings:string[]=[];
  if(extended)warnings.push('السعر ممتد؛ خطر مطاردة الارتفاع');
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
    flowDelta5m,flowShiftPct,rangeCompression,trapRisk,
    change15m,book,breakout,distancePct,invalidation,target1,target2,
    estimatedCostPct,netRR,
    reasons,warnings,candles:candles.slice(-70)};
}
