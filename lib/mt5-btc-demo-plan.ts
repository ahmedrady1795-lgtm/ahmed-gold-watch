import type {Candle} from './engine';

export type BtcDemoSnapshot={
  symbol:string;bid:number;ask:number;tickTimeMs:number;observedAt:number;
  ticks:{time:number;bid:number;ask:number}[];
  candles:{c1:Candle[];c5:Candle[];c15:Candle[];c60:Candle[]};
};
export type BtcDemoDecision=
  |{ready:false;reason:string}
  |{ready:true;side:'BUY_LIMIT'|'SELL_LIMIT';symbol:'BTCUSDm';
    candleAt:number;signalTickTimeMs:number;expiresAt:number;entry:number;stop:number;target:number;
    bid:number;ask:number;atr:number};

function ema(rows:Candle[],length:number){
  const chosen=rows.slice(-Math.max(80,length*3));
  if(chosen.length<length*2)return NaN;
  const weight=2/(length+1);
  let average=chosen[0].close;
  for(let i=1;i<chosen.length;i++)average=
    chosen[i].close*weight+average*(1-weight);
  return average;
}
function atr(rows:Candle[],n=14){
  if(rows.length<n+1)return NaN;
  let total=0;
  for(let i=rows.length-n;i<rows.length;i++){
    const x=rows[i],before=rows[i-1];
    total+=Math.max(x.high-x.low,Math.abs(x.high-before.close),
      Math.abs(x.low-before.close));
  }
  return total/n;
}
function continuous(rows:Candle[],ms:number,count:number){
  if(rows.length<count)return false;
  const sub=rows.slice(-count);
  return sub.every((x,i)=>i===0||x.time-sub[i-1].time===ms);
}
const wait=(reason:string):BtcDemoDecision=>({ready:false,reason});
const price=(x:number)=>Math.round(x*100)/100;

/**
 * Initial, intentionally conservative demo-only hypothesis, NOT a validated
 * profitable scalp strategy. Uses only broker quotes and CLOSED Exness bars.
 * It emits a passive LIMIT setup, never an instruction to trade live.
 */
export function planBtcDemoLimit(s:BtcDemoSnapshot|null,now=Date.now()):BtcDemoDecision{
  if(!s)return wait('BROKER_NOT_FRESH');
  if(s.symbol!=='BTCUSDm')return wait('SYMBOL_MISMATCH');
  const {c1,c5}=s.candles;
  if(!continuous(c1,60000,36)||!continuous(c5,300000,26))
    return wait('HISTORY_GAP');
  const last=c1.at(-1)!;
  const closedAt=last.time+60000;
  if(closedAt>now||now-closedAt>59000)return wait('CLOSED_M1_TOO_OLD');
  if(now-s.tickTimeMs<0||now-s.tickTimeMs>8000||
    now-s.observedAt<0||now-s.observedAt>15000)
    return wait('STALE_BROKER_QUOTE');
  const mid=(s.ask+s.bid)/2,spread=s.ask-s.bid;
  if(!Number.isFinite(mid)||mid<=0||!Number.isFinite(spread)||
    spread<=0||spread/mid>0.0004)return wait('SPREAD_TOO_WIDE');
  const a=atr(c1),m5a=atr(c5);
  // A 3x-ATR/spread requirement rejected otherwise feasible BTC M1 retests.
  // This is a *precheck*, not permission to trade a loss-making spread:
  // both sides still need a fresh 3-tick Exness reversal, SL/TP geometry,
  // a passive LIMIT entry and a target covering >=2.4 observed spreads.
  // Keep a smaller noise floor; do not waive the later cost/stop safeguards.
  if(!Number.isFinite(a)||!Number.isFinite(m5a)||
    a<=0||m5a<=0||a<spread*1.5||m5a<spread*1.5)
    return wait('VOLATILITY_TOO_LOW');
  if(Math.abs(c5.at(-1)!.close-last.close)>
     Math.max(4*m5a,mid*.006))return wait('M5_BROKER_CONTEXT_MISMATCH');
  if(last.high-last.low>2.7*a)return wait('SPIKE_CANDLE');
  if(Math.abs(mid-last.close)>0.65*a)return wait('PRICE_AWAY_FROM_CLOSED_M1');
  const trend1=ema(c1,8)-ema(c1,21);
  const trend5=ema(c5,8)-ema(c5,21);
  if(!Number.isFinite(trend1)||!Number.isFinite(trend5))
    return wait('EMA_NOT_READY');
  const side=trend1>0.10*a&&trend5>0.04*m5a?'BUY_LIMIT':
    trend1< -0.10*a&&trend5< -0.04*m5a?'SELL_LIMIT':null;
  if(!side)return wait('TREND_NOT_ALIGNED');
  const tickVolume=Number(last.tickVolume??0);
  const averageVolume=c1.slice(-20,-1).reduce((sum,x)=>
    sum+Number(x.tickVolume??0),0)/19;
  if(averageVolume<=0||tickVolume<averageVolume*.55)
    return wait('WEAK_OBSERVED_TICK_VOLUME');
  const bullish=last.close>last.open&&last.close>=c1.at(-2)!.close;
  const bearish=last.close<last.open&&last.close<=c1.at(-2)!.close;
  if(side==='BUY_LIMIT'&&!bullish||side==='SELL_LIMIT'&&!bearish)
    return wait('LAST_CLOSED_BAR_UNCONFIRMED');
  // Require a NEW, time-ordered 3-tick reversal from Exness itself.
  // Without it there is no new intra-minute setup, even when M1 trend agrees.
  const trail=s.ticks?.slice(-3)??[];
  if(trail.length!==3||trail[2].time!==s.tickTimeMs||
     trail[0].time>=trail[1].time||trail[1].time>=trail[2].time||
     now-trail[0].time>25000||trail[0].time>now||
     trail.some(x=>!Number.isFinite(x.bid)||!Number.isFinite(x.ask)||
       x.bid<=0||x.ask<=x.bid))return wait('NO_FRESH_THREE_TICK_SETUP');
  const v=trail.map(x=>(x.bid+x.ask)/2);
  const minReversal=Math.max(spread*.35,a*.025);
  const buyTurn=v[0]-v[1]>=minReversal&&v[2]-v[1]>=minReversal&&
    v[2]-v[0]<.35*a;
  const sellTurn=v[1]-v[0]>=minReversal&&v[1]-v[2]>=minReversal&&
    v[0]-v[2]<.35*a;
  if(side==='BUY_LIMIT'&&!buyTurn||side==='SELL_LIMIT'&&!sellTurn)
    return wait('NO_NEW_TICK_REVERSAL');
  const lastSix=c1.slice(-6),padding=spread*.15;
  let entry:number,stop:number,target:number;
  if(side==='BUY_LIMIT'){
    entry=price(Math.min(last.close-.12*a,s.bid-.5*spread));
    stop=price(Math.min(...lastSix.map(x=>x.low),entry-.72*a)-padding);
    const risk=entry-stop;
    target=price(entry+1.5*risk);
    if(entry<=0||entry>=s.bid||stop>=entry||target<=entry||
      s.bid-entry>.55*a||risk>1.4*a||target-entry>2.2*a||
      target-entry<2.4*spread)return wait('BUY_LIMIT_GEOMETRY');
  }else{
    entry=price(Math.max(last.close+.12*a,s.ask+.5*spread));
    stop=price(Math.max(...lastSix.map(x=>x.high),entry+.72*a)+padding);
    const risk=stop-entry;
    target=price(entry-1.5*risk);
    if(target<=0||entry<=s.ask||stop<=entry||target>=entry||
      entry-s.ask>.55*a||risk>1.4*a||entry-target>2.2*a||
      entry-target<2.4*spread)return wait('SELL_LIMIT_GEOMETRY');
  }
  // A fixed, short expiry prevents a stale candidate from turning into a
  // passive order after the scenario has moved. Broker must enforce this too.
  return {ready:true,side,symbol:'BTCUSDm',candleAt:last.time,
    signalTickTimeMs:s.tickTimeMs,expiresAt:now+11000,
    entry,stop,target,bid:price(s.bid),ask:price(s.ask),atr:price(a)};
}
export function formatBtcDemoWire(d:BtcDemoDecision){
  if(!d.ready)return 'QBTC1|WAIT|'+d.reason+'\n';
  return ['QBTC1',d.side,d.symbol,d.candleAt,d.expiresAt,
    d.entry,d.stop,d.target,d.bid,d.ask,d.atr,d.signalTickTimeMs].join('|')+'\n';
}
