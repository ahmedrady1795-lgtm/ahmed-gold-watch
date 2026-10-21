// Three independent closed-5m observation windows, based on PUBLIC Binance Spot 1m bars.
// Positive taker-buy volume can still be absorbed by passive sellers.
// This is an observation about flow, not access to hidden liquidity or future orders.
import type {Candidate,Candle} from './spot-radar';
export type SpotAccumulation={
  state:'BUY_BUILDUP'|'BUY_ABSORBED'|'WATCH'|'NONE';
  flowCandidate:boolean;netBuyQuote5m:number;buyIntensity:number;
  buyAccelerationPct:number;adjustment:number;reason:string;
};
const sum=(bars:Candle[],f:(x:Candle)=>number)=>bars.reduce((s,x)=>s+f(x),0);
export function spotAccumulationPulse(coin:Candidate):SpotAccumulation{
  const none=(state:SpotAccumulation['state']='NONE',reason='لا يوجد تسارع شراء مثبت',
    adjustment=0,netBuyQuote5m=0,buyIntensity=0,buyAccelerationPct=0,
    flowCandidate=false):SpotAccumulation=>({
    state,reason,adjustment,netBuyQuote5m,buyIntensity,buyAccelerationPct,flowCandidate
  });
  const bars=coin.candles.slice(-65);
  if(bars.length<60||!Number.isFinite(coin.price)||coin.price<=0||
    !Number.isFinite(coin.volume24h)||coin.volume24h<1_500_000||
    !Number.isFinite(coin.change24h)||coin.change24h>=12||
    !Number.isFinite(coin.change15m)||coin.change15m>=3.2||
    coin.change15m<-.75||coin.trapRisk)return none();
  for(let i=1;i<bars.length;i++)if(bars[i].time-bars[i-1].time!==60_000)return none();
  if(bars.some(c=>!Number.isFinite(c.quoteVolume)||!Number.isFinite(c.buyQuote)||
    c.quoteVolume<0||c.buyQuote<0||c.buyQuote>c.quoteVolume))return none();
  const background=bars.slice(-55,-15),prior=bars.slice(-10,-5),latest=bars.slice(-5);
  const baselineBuyPerMin=sum(background,x=>x.buyQuote)/background.length;
  const priorBuy=sum(prior,x=>x.buyQuote),newBuy=sum(latest,x=>x.buyQuote);
  const priorVol=sum(prior,x=>x.quoteVolume),newVol=sum(latest,x=>x.quoteVolume);
  if(baselineBuyPerMin<=0||priorBuy<=0||priorVol<=0||newVol<=0)return none();
  const latestShare=newBuy/newVol,priorShare=priorBuy/priorVol;
  const netBuyQuote5m=2*newBuy-newVol;
  const buyIntensity=newBuy/(baselineBuyPerMin*5);
  const buyAccelerationPct=(newBuy/priorBuy-1)*100;
  const move5mPct=(latest[4].close/prior[4].close-1)*100;
  const upperWick=sum(latest,c=>Math.max(0,c.high-Math.max(c.open,c.close)));
  const ranges=sum(latest,c=>Math.max(0,c.high-c.low));
  const wickRatio=upperWick/Math.max(1e-9,ranges);
  const closePosition=(latest[4].close-latest[4].low)/
    Math.max(1e-9,latest[4].high-latest[4].low);
  const participation=latestShare>=.58&&priorShare>=.51&&
    buyIntensity>=1.5&&buyAccelerationPct>=18&&
    netBuyQuote5m>=Math.max(1700,coin.volume24h*.00025)&&
    coin.volumeImpulse>=1.35;
  // An aggressive buy imbalance with a stalled price can mean passive
  // supply is absorbing demand. Treat it as a penalty, NOT accumulation.
  if(participation&&(move5mPct<.09||wickRatio>.38))
    return none('BUY_ABSORBED','شراء منفّذ قوي لكن السعر لا يتقدم: احتمال امتصاص بيع',
      -10,netBuyQuote5m,buyIntensity,buyAccelerationPct);
  const flowCandidate=participation&&move5mPct>=.09&&move5mPct<=1.9&&
    wickRatio<=.38&&closePosition>=.57&&coin.distancePct>=-.9&&
    coin.distancePct<=2.8&&coin.rangeCompression<=1.6;
  if(!flowCandidate)return none('NONE','لا يوجد تسارع شراء مثبت',0,
    netBuyQuote5m,buyIntensity,buyAccelerationPct);
  const depth=coin.book;
  if(!depth||depth.spreadBps<=0||depth.spreadBps>23||depth.bidShare<.52)
    return none('WATCH','تسارع شراء منفّذ؛ لم يؤكده عمق دفتر الأوامر',0,
      netBuyQuote5m,buyIntensity,buyAccelerationPct,true);
  return none('BUY_BUILDUP','شراء Spot يتسارع عبر نوافذ منفصلة والسعر متماسك قبل الاختراق',
    10,netBuyQuote5m,buyIntensity,buyAccelerationPct,true);
}
