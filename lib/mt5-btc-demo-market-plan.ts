import type {BtcDemoSnapshot} from './mt5-btc-demo-plan';
import type {Candle} from './engine';

export type BtcDemoMarketDecision=
  |{ready:false;reason:string}
  |{ready:true;side:'BUY_MARKET'|'SELL_MARKET';symbol:'BTCUSDm';
    candleAt:number;signalTickTimeMs:number;expiresAt:number;
    stopDistance:number;targetDistance:number;bid:number;ask:number;atr:number};

const wait=(reason:string):BtcDemoMarketDecision=>({ready:false,reason});
const money=(v:number)=>Math.round(v*100)/100;
function continuous(rows:Candle[],step:number,count:number){
  if(rows.length<count)return false;
  const xs=rows.slice(-count);
  return xs.every((v,i)=>i===0||v.time-xs[i-1].time===step);
}
function atr(rows:Candle[],n=14){
  if(rows.length<n+1)return NaN;
  let sum=0;
  for(let i=rows.length-n;i<rows.length;i++){
    const v=rows[i],p=rows[i-1];
    sum+=Math.max(v.high-v.low,Math.abs(v.high-p.close),
      Math.abs(v.low-p.close));
  }
  return sum/n;
}
function ema(rows:Candle[],n:number){
  const xs=rows.slice(-Math.max(80,n*3));
  if(xs.length<n*2)return NaN;
  let m=xs[0].close;
  const w=2/(n+1);
  for(let i=1;i<xs.length;i++)m=w*xs[i].close+(1-w)*m;
  return m;
}
/**
 * BTCUSDm Exness demo-only market-order HYPOTHESIS.
 * Every fresh completed M1 candle gets independently evaluated; only valid,
 * fee-covered directionally supported conditions produce a candidate.
 * This emits a short-lived decision, never an executable broker order.
 * The MT5 EA must re-price everything from its own latest broker quote.
 */
export function planBtcDemoMarket(s:BtcDemoSnapshot|null,now=Date.now()):BtcDemoMarketDecision{
  if(!s)return wait('BROKER_NOT_FRESH');
  if(s.symbol!=='BTCUSDm')return wait('SYMBOL_MISMATCH');
  const {c1,c5}=s.candles;
  if(!continuous(c1,60000,36)||!continuous(c5,300000,26))
    return wait('HISTORY_GAP');
  const last=c1.at(-1)!;
  const barEnd=last.time+60000;
  const barAge=now-barEnd;
  // The EA closes at the END of the entry M1, so only issue early candidates.
  if(barAge<0||barAge>35000)return wait('CLOSED_M1_TOO_OLD');
  if(now-s.tickTimeMs<0||now-s.tickTimeMs>6000||
     now-s.observedAt<0||now-s.observedAt>12000)
    return wait('STALE_BROKER_QUOTE');
  const spread=s.ask-s.bid,mid=(s.ask+s.bid)/2;
  if(!Number.isFinite(spread)||spread<=0||!Number.isFinite(mid)||
     mid<=0||spread/mid>0.0004)return wait('SPREAD_TOO_WIDE');
  const a=atr(c1),a5=atr(c5);
  if(!Number.isFinite(a)||!Number.isFinite(a5)||a<=0||a5<=0||
    a<1.35*spread||a5<1.35*spread)return wait('NO_COST_COVERED_M1_MOVE');
  if(Math.abs(c5.at(-1)!.close-last.close)>
    Math.max(4*a5,mid*.006))return wait('M5_BROKER_CONTEXT_MISMATCH');
  if(last.high-last.low>4.0*a)return wait('SHOCK_CANDLE');
  if(Math.abs(mid-last.close)>1.8*a)return wait('PRICE_DISLOCATED');
  const observedTickVolume=Number(last.tickVolume??0);
  if(!Number.isFinite(observedTickVolume)||observedTickVolume<=0)
    return wait('NO_OBSERVED_VOLUME');
  const body=last.close-last.open;
  const movingBias=ema(c1,8)-ema(c1,21);
  // All fresh M1 candles get a directional attempt: combine previous-bar
  // pressure with trend and available LIVE broker quote momentum. Broker
  // ticks are price changes, NOT actual Level-2/order-book flow.
  const ticks=s.ticks.filter(t=>Number.isFinite(t.bid)&&Number.isFinite(t.ask)&&
    t.ask>=t.bid&&now-t.time>=0&&now-t.time<=20000);
  const tickPressure=ticks.length>=2?
    ((ticks.at(-1)!.bid+ticks.at(-1)!.ask)-
      (ticks[0].bid+ticks[0].ask))/2:0;
  const trend=Number.isFinite(movingBias)?movingBias:0;
  const combined=.48*body+.37*trend+.15*tickPressure;
  const bias=Math.abs(combined)>1e-8?combined:
    (Math.abs(body)>1e-8?body:Math.abs(trend)>1e-8?trend:tickPressure);
  // A genuinely information-free/flat tape cannot justify invented direction.
  if(!Number.isFinite(bias)||Math.abs(bias)<=1e-8)
    return wait('DIRECTION_UNCONFIRMED');
  const risk=Math.max(.60*a,1.35*spread);
  const reward=Math.max(1.45*risk,2.5*spread);
  if(!Number.isFinite(risk)||!Number.isFinite(reward)||
    risk<=0||reward<=0||risk>1.4*a||reward>2.25*a||
    reward<2.4*spread||reward/risk<1.4)
    return wait('MARKET_COST_GEOMETRY');
  const result:BtcDemoMarketDecision={
    ready:true,side:bias>0?'BUY_MARKET':'SELL_MARKET',symbol:'BTCUSDm',
    candleAt:last.time,signalTickTimeMs:s.tickTimeMs,expiresAt:now+8000,
    stopDistance:money(risk),targetDistance:money(reward),
    bid:money(s.bid),ask:money(s.ask),atr:money(a)
  };
  if(result.stopDistance<=0||result.targetDistance<1.4*result.stopDistance||
    result.targetDistance<2.4*spread)
    return wait('MARKET_ROUNDING_GEOMETRY');
  return result;
}
export function formatBtcDemoMarketWire(d:BtcDemoMarketDecision){
  if(!d.ready)return 'QBTCM1|WAIT|'+d.reason+'\n';
  return ['QBTCM1',d.side,d.symbol,d.candleAt,d.expiresAt,
    d.stopDistance,d.targetDistance,d.bid,d.ask,d.atr,d.signalTickTimeMs]
    .join('|')+'\n';
}
