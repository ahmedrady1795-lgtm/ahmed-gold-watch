// Qannas SPOT: public exchange prints + futures positioning.
// Evidence-only; no claim of seeing hidden orders or a guaranteed future move.
export type WhaleTape={
  state:'BUY_PRESSURE'|'SELL_PRESSURE'|'NEUTRAL';
  largeBuyShare:number;largeNotional:number;sampleTrades:number;
  thresholdUSDT:number;lastTradeAt:number;
};
export type LeverageRisk={
  state:'CROWDED_LONGS'|'SPOT_LED_POSSIBLE'|'NEUTRAL';
  oiChange1hPct:number;fundingPct:number;asOf:number;
};
export type SpotEdge={
  whale:WhaleTape|null;leverage:LeverageRisk|null;
  adjustment:number;evidence:string[];warnings:string[];
};
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
export function largeTradeFootprint(raw:unknown,now=Date.now()):WhaleTape|null{
  if(!Array.isArray(raw))return null;
  const trades:{time:number;notional:number;buy:boolean}[]=[];
  for(const x of raw){
    if(!x||typeof x!=='object')continue;
    const t=Number(x.T),price=Number(x.p),quantity=Number(x.q);
    if(!Number.isFinite(t)||!Number.isFinite(price)||!Number.isFinite(quantity)||
       t>now||t<now-600000||price<=0||quantity<=0||typeof x.m!=='boolean')continue;
    // Binance m === true means buyer was MAKER, so the SELLER initiated.
    trades.push({time:t,notional:price*quantity,buy:!x.m});
  }
  if(trades.length<65)return null;
  trades.sort((a,b)=>a.time-b.time);
  if(now-trades.at(-1)!.time>120000||trades.at(-1)!.time-trades[0].time<30000)return null;
  const quantities=trades.map(t=>t.notional).sort((a,b)=>a-b);
  const thresholdUSDT=Math.max(2500,quantities[Math.floor(quantities.length*.88)]);
  const large=trades.filter(t=>t.notional>=thresholdUSDT);
  const total=large.reduce((acc,t)=>acc+t.notional,0);
  if(large.length<8||total<25000)return null;
  const largeBuyShare=large.reduce((acc,t)=>acc+(t.buy?t.notional:0),0)/total;
  return {state:largeBuyShare>=.64?'BUY_PRESSURE':largeBuyShare<=.36?'SELL_PRESSURE':'NEUTRAL',
    largeBuyShare,largeNotional:total,sampleTrades:trades.length,
    thresholdUSDT,lastTradeAt:trades.at(-1)!.time};
}
export function futuresCrowding(oiRaw:unknown,markRaw:unknown,now=Date.now()):LeverageRisk|null{
  if(!Array.isArray(oiRaw)||oiRaw.length<9||!markRaw||typeof markRaw!=='object')return null;
  const points:{time:number;oi:number}[]=[];
  for(const item of oiRaw){
    if(!item||typeof item!=='object')continue;
    const time=Number(item.timestamp),oi=Number(item.sumOpenInterest);
    if(Number.isFinite(time)&&Number.isFinite(oi)&&time<=now&&oi>0)
      points.push({time,oi});
  }
  points.sort((a,b)=>a.time-b.time);
  const end=points.at(-1);
  if(!end||now-end.time>1200000)return null;
  // Require a full, contiguous, past-only 1-hour (12 intervals of 5m).
  const target=end.time-3600000;
  const start=points.find(p=>Math.abs(p.time-target)<=70000);
  if(!start)return null;
  const within=points.filter(p=>p.time>=start.time&&p.time<=end.time);
  if(within.length<12||within.some((p,i)=>i>0&&(p.time-within[i-1].time>360000)))return null;
  const funding=Number((markRaw as {lastFundingRate?:unknown}).lastFundingRate);
  if(!Number.isFinite(funding)||Math.abs(funding)>.05)return null;
  const oiChange1hPct=(end.oi/start.oi-1)*100;
  const fundingPct=funding*100;
  const state:LeverageRisk['state']=oiChange1hPct>=7&&fundingPct>=.05?
    'CROWDED_LONGS':oiChange1hPct<=2&&Math.abs(fundingPct)<.04?
    'SPOT_LED_POSSIBLE':'NEUTRAL';
  return {state,oiChange1hPct,fundingPct,asOf:end.time};
}
export function blendEdge(baseScore:number,whale:WhaleTape|null,leverage:LeverageRisk|null):SpotEdge{
  let adjustment=0;
  const evidence:string[]=[],warnings:string[]=[];
  if(whale?.state==='BUY_PRESSURE'){
    adjustment+=clamp((whale.largeBuyShare-.59)*55,0,10);
    evidence.push('بصمة شراء كبير منفّذ '+Math.round(whale.largeBuyShare*100)+'٪');
  }else if(whale?.state==='SELL_PRESSURE'){
    adjustment-=14;warnings.push('الصفقات الكبيرة يغلب عليها البيع المنفّذ');
  }
  if(leverage?.state==='CROWDED_LONGS'){
    adjustment-=16;warnings.push('ازدحام عقود شراء ممولة: احتمال تصفية');
  }
  if(leverage?.state==='SPOT_LED_POSSIBLE'&&whale?.state==='BUY_PRESSURE'){
    adjustment+=6;
    evidence.push('شراء Spot مع غياب قفزة ازدحام العقود');
  }
  if(!whale)warnings.push('عينة الصفقات الكبيرة غير كافية للتحقق');
  if(!leverage)warnings.push('دليل ازدحام العقود غير متاح');
  return {whale,leverage,adjustment:Math.round(clamp(adjustment,-30,16)),
    evidence,warnings};
}
