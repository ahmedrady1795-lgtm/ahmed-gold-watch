// Repeated public Binance Spot measurements; never future/hidden order knowledge.
import type {Candidate} from './spot-radar';
import type {WhaleTape} from './spot-edge';
export type SpotLiquiditySample={
  sampledAt:number;freshAt:number;price:number;buyShare:number;
  volumeImpulse:number;flowDelta5m:number;bidShare:number;
  spreadBps:number;trapRisk:boolean;
};
export type SpotIgnition={
  state:'FLOW_CONFIRMED'|'BUILDING'|'FADING'|'NO_EVIDENCE';
  buyQuote5m:number;observations:1|2;intervalSeconds:number|null;
  evidence:string;adjustment:number;
};
export function spotLiquiditySample(coin:Candidate,now=Date.now()):SpotLiquiditySample|null{
  const book=coin.book;
  if(!book||!Number.isFinite(coin.price)||coin.price<=0||
     !Number.isFinite(book.bidShare)||!Number.isFinite(book.spreadBps)||
     book.spreadBps<=0||!Number.isFinite(coin.buyShare)||
     !Number.isFinite(coin.volumeImpulse)||!Number.isFinite(coin.flowDelta5m)||
     !Number.isFinite(coin.freshAt)||coin.freshAt>now+1000||
     now-coin.freshAt>150000)return null;
  return {sampledAt:now,freshAt:coin.freshAt,price:coin.price,
    buyShare:coin.buyShare,volumeImpulse:coin.volumeImpulse,
    flowDelta5m:coin.flowDelta5m,bidShare:book.bidShare,
    spreadBps:book.spreadBps,trapRisk:coin.trapRisk};
}
export function spotIgnition(
  coin:Candidate,whale:WhaleTape|null,previous:SpotLiquiditySample|null,
  now=Date.now()
):SpotIgnition{
  const snap=spotLiquiditySample(coin,now);
  const buyQuote5m=coin.candles.slice(-5).reduce((n,c)=>n+
    (Number.isFinite(c.buyQuote)?c.buyQuote:0),0);
  const single=(state:SpotIgnition['state'],evidence:string,adjustment=0):
    SpotIgnition=>({state,buyQuote5m,observations:1,intervalSeconds:null,evidence,adjustment});
  if(!snap)return single('NO_EVIDENCE','عمق السوق أو حداثة البيانات غير كافية');
  const active=snap.buyShare>=.53&&snap.volumeImpulse>=1.2&&
    snap.flowDelta5m>=Math.max(1000,coin.volume24h*.00025)&&
    snap.bidShare>=.51&&snap.spreadBps<=24&&!snap.trapRisk&&
    coin.change15m<5&&coin.change24h<14;
  if(whale?.state==='SELL_PRESSURE')
    return single('FADING','بيع كبير منفّذ يناقض ضغط الشراء',-18);
  if(!previous||now-previous.sampledAt<65000||
     now-previous.sampledAt>600000||
     snap.freshAt-previous.freshAt<60000)
    return single(active?'BUILDING':'NO_EVIDENCE',active?
      'شراء منفّذ وعمق داعم؛ نحتاج فحصًا آخر':'أدلة التدفق غير مكتملة');
  const intervalSeconds=Math.round((now-previous.sampledAt)/1000);
  const priorActive=previous.buyShare>=.51&&previous.volumeImpulse>=1.1&&
    previous.flowDelta5m>0&&previous.bidShare>=.49&&
    previous.spreadBps<=24&&!previous.trapRisk;
  const priceMove=(snap.price/previous.price-1)*100;
  if(priorActive&&(snap.bidShare<.43||snap.buyShare<.43||
       snap.trapRisk||priceMove< -2.5))
    return {state:'FADING',buyQuote5m,observations:2,intervalSeconds,
      evidence:'دعم دفتر الطلبات أو ضغط الشراء تراجع بين الفحصين',adjustment:-18};
  const confirmed=active&&priorActive&&priceMove>=-1.5&&priceMove<=3.5&&
    coin.outlook24h?.takerBuyShare12!==undefined&&
    coin.outlook24h.takerBuyShare12>=.51;
  if(confirmed)return {state:'FLOW_CONFIRMED',buyQuote5m,observations:2,
    intervalSeconds,evidence:whale?.state==='BUY_PRESSURE'?
      'شراء منفّذ مستمر + صفقات كبيرة + عمق ثابت في فحصين':
      'شراء منفّذ مستمر + عمق داعم في فحصين',
    adjustment:whale?.state==='BUY_PRESSURE'?12:8};
  return {state:active?'BUILDING':'NO_EVIDENCE',buyQuote5m,
    observations:2,intervalSeconds,evidence:active?
      'التدفق الحالي لم يثبت استمراره':'لم يثبت استمرار ضغط الشراء',
    adjustment:0};
}
