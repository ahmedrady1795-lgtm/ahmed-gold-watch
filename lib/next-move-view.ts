// View-only safety gate for the 15-minute movement outlook.
// Never turns a probabilistic forecast into a broker order.
type Side='BUY'|'SELL'|'WAIT';
export type NextMoveView={
  side:Side;reason:string;price:number|null;sourceAgeSeconds:number|null;
  priceFresh:boolean;forecastFresh:boolean;target:number|null;
  invalidation:number|null;targetDistancePct:number|null;
  riskDistancePct:number|null;confidence:number|null;
  quality:'MONITOR'|'UNQUALIFIED'|'STALE'|'READY';
  hasHistoricalBand:boolean;bandLower:number|null;bandUpper:number|null;
  evidenceCount:number;directionAccuracy:number|null
};
function num(x:unknown):number|null{
  if(x===null||x===undefined||x==='')return null;
  const v=Number(x);return Number.isFinite(v)?v:null;
}
function validPrice(x:unknown){const v=num(x);return v!=null&&v>0?v:null;}
function validTs(x:unknown,now:number){
  const v=num(x);return v!=null&&v>0&&v<=now+1500?v:null;
}
export function buildNextMoveView(
  asset:'GOLD'|'BTC',x:any,liveGoldQuote:any,now:number,snapshotAt:unknown
):NextMoveView{
  const forecast=x?.forwardMove;
  const scalp=x?.scalpDesk;
  const quotes=[
    asset==='GOLD'&&liveGoldQuote?{
      price:liveGoldQuote.price,time:liveGoldQuote.sourceTime,
      valid:liveGoldQuote.ok===true
    }:null,
    {price:scalp?.quote?.price,time:scalp?.quote?.at,valid:true},
    {price:x?.livePulse?.price,time:x?.livePulse?.sourceTime,valid:true}
  ].filter(Boolean) as Array<{price:unknown;time:unknown;valid:boolean}>;
  const ranked=quotes.filter(q=>q.valid&&validPrice(q.price)!=null&&validTs(q.time,now)!=null)
    .sort((a,b)=>Number(b.time)-Number(a.time));
  // Never label a cached stale quote as live simply because the server refreshed.
  const quote=ranked[0];
  const price=quote?validPrice(quote.price):null;
  const priceAt=quote?validTs(quote.time,now):null;
  const sourceAgeSeconds=priceAt!=null?Math.max(0,Math.ceil((now-priceAt)/1000)):null;
  const priceFresh=price!=null&&sourceAgeSeconds!=null&&sourceAgeSeconds<=20;
  const produced=validTs(snapshotAt,now);
  const forecastFresh=produced!=null&&now-produced<=90000;
  const hits=Number(x?.forecastValidation15m?.global?.hits||0);
  const misses=Number(x?.forecastValidation15m?.global?.fails||0);
  const evidenceCount=Math.max(0,hits+misses);
  const acc=num(x?.forecastValidation15m?.global?.accuracy);
  // The gold model's observed near-chance validation is not an entry signal.
  const unqualified=evidenceCount>=100&&acc!=null&&acc<55;
  const indicated:Side=forecast?.side==='BUY'||forecast?.side==='SELL'?forecast.side:'WAIT';
  const rawTarget=validPrice(forecast?.targets?.t1?.price??forecast?.target);
  const rawInvalidation=validPrice(forecast?.targets?.invalidation??forecast?.invalidation);
  const orientedTarget=price!=null&&rawTarget!=null&&
    (indicated==='BUY'?rawTarget>price:indicated==='SELL'?rawTarget<price:false)?rawTarget:null;
  const orientedStop=price!=null&&rawInvalidation!=null&&
    (indicated==='BUY'?rawInvalidation<price:indicated==='SELL'?rawInvalidation>price:false)?rawInvalidation:null;
  const guard=priceFresh&&forecastFresh&&!unqualified&&orientedTarget!=null&&orientedStop!=null&&indicated!=='WAIT';
  const side:Side=guard?indicated:'WAIT';
  const quality:NextMoveView['quality']=!priceFresh||!forecastFresh?'STALE':unqualified?'UNQUALIFIED':guard?'READY':'MONITOR';
  const reason=!priceFresh?'مفيش سعر حديث موثوق؛ التوقع مش قابل للاستخدام دلوقتي':
    !forecastFresh?'آخر تحليل قديم؛ استنى تحديث جديد':
    unqualified?'توقع الاتجاه غير مؤهل تاريخيًا؛ ممنوع اعتباره إشارة':
    indicated==='WAIT'?'السوق لسه مفيهوش اتجاه 15 دقيقة متأكد':
    !orientedTarget||!orientedStop?'الهدف أو مستوى الإبطال مش متوافق مع اتجاه السعر الحالي':
    'سيناريو حركة مشروط، مش أمر دخول أو احتمال ربح';
  const envelope=x?.movementEnvelope?.m15;
  const bandLower=validPrice(envelope?.lowerPrice);
  const bandUpper=validPrice(envelope?.upperPrice);
  const hasHistoricalBand=envelope?.status==='READY'&&
    envelope?.walkForward?.rangeQuality!=='MIS_CALIBRATED'&&
    bandLower!=null&&bandUpper!=null&&bandLower<bandUpper;
  const target=side==='WAIT'?null:orientedTarget;
  const invalidation=side==='WAIT'?null:orientedStop;
  return {
    side,reason,price,sourceAgeSeconds,priceFresh,forecastFresh,
    target,invalidation,quality,
    targetDistancePct:target!=null&&price!=null?Math.abs(target-price)/price*100:null,
    riskDistancePct:invalidation!=null&&price!=null?Math.abs(invalidation-price)/price*100:null,
    confidence:side==='WAIT'?null:num(forecast?.confidence),
    hasHistoricalBand,bandLower:hasHistoricalBand?bandLower:null,
    bandUpper:hasHistoricalBand?bandUpper:null,evidenceCount,
    directionAccuracy:evidenceCount>=20?acc:null
  };
}
