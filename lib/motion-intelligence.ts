import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Stage='WAIT'|'PRE_MOVE'|'IGNITION'|'REVERSAL_ALERT';

type Snap={at:number;price:number;pressure:number;microEdge:number;deltaPct:number;acceleration:number};

export type MotionIntelligence={
  ok:boolean;
  side:Side;
  stage:Stage;
  score:number;
  confidence:number;
  reasons:string[];
  components:{
    pressureTrend:number;
    pressurePersistence:number;
    micropriceLead:number;
    flowLead:number;
    acceleration:number;
    compression:number;
    sweepReclaim:number;
    liveVelocityBps:number;
    trapSide:Side;
  };
  diagnostics:{
    samples:number;
    compressionRatio:number;
    recentRangePosition:number;
    precursorCount:number;
  };
};

const history:Snap[]=[];
const clamp=(n:number,min=-100,max=100)=>Math.max(min,Math.min(max,n));
const finite=(v:any)=>Number.isFinite(Number(v));

function range(c:Candle){return Math.max(0,c.high-c.low);}
function avg(xs:number[]){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;}
function sign(v:number,gate=0){return v>gate?1:v<-gate?-1:0;}

function compressionScore(c1:Candle[]){
  const rows=c1.slice(-28);if(rows.length<16)return {score:0,ratio:1};
  const recent=rows.slice(-6).map(range),prior=rows.slice(0,-6).map(range);
  const r=avg(recent),p=avg(prior);
  if(!finite(r)||!finite(p)||p<=0)return {score:0,ratio:1};
  const ratio=r/p;
  const score=ratio<=.45?100:ratio<=.6?82:ratio<=.75?60:ratio<=.9?35:0;
  return {score,ratio:Number(ratio.toFixed(2))};
}

function sweepReclaim(c1:Candle[]){
  const x=c1.slice(-14);if(x.length<8)return {side:'WAIT' as Side,score:0};
  const last=x.at(-1)!,prior=x.slice(0,-1),hi=Math.max(...prior.map(v=>v.high)),lo=Math.min(...prior.map(v=>v.low));
  const body=Math.max(1e-9,last.high-last.low),closePos=(last.close-last.low)/body;
  if(last.low<lo&&last.close>lo&&closePos>=.58){
    const depth=(lo-last.low)/body;
    return {side:'BUY' as Side,score:Math.min(92,Math.round(58+depth*34))};
  }
  if(last.high>hi&&last.close<hi&&closePos<=.42){
    const depth=(last.high-hi)/body;
    return {side:'SELL' as Side,score:Math.min(92,Math.round(58+depth*34))};
  }
  return {side:'WAIT' as Side,score:0};
}

function recentRangePosition(c1:Candle[],price:number){
  const x=c1.slice(-20);if(!x.length)return 50;
  const hi=Math.max(...x.map(v=>v.high)),lo=Math.min(...x.map(v=>v.low));
  return hi>lo?Math.round(Math.max(0,Math.min(1,(price-lo)/(hi-lo)))*100):50;
}

export function getMotionIntelligence(price:number|null,liquidity:any,c1:Candle[],now=Date.now()):MotionIntelligence{
  const p=Number(price);
  if(!finite(p)||p<=0||!liquidity?.ok){
    return {ok:false,side:'WAIT',stage:'WAIT',score:0,confidence:0,reasons:['بيانات الحركة أو السيولة غير كافية.'],components:{pressureTrend:0,pressurePersistence:0,micropriceLead:0,flowLead:0,acceleration:0,compression:0,sweepReclaim:0,liveVelocityBps:0,trapSide:'WAIT'},diagnostics:{samples:0,compressionRatio:1,recentRangePosition:50,precursorCount:0}};
  }

  const snap:Snap={at:now,price:p,pressure:Number(liquidity?.pressure||0),microEdge:Number(liquidity?.book?.microEdge||0),deltaPct:Number(liquidity?.flow?.deltaPct||0),acceleration:Number(liquidity?.dynamics?.acceleration||0)};
  history.push(snap);
  while(history.length>12||history[0]&&now-history[0].at>45000)history.shift();

  const h=history.slice(-8),first=h[0],last=h.at(-1)!;
  const pressureTrend=h.length>=3?(last.pressure-first.pressure):0;
  const samePressure=h.filter(x=>sign(x.pressure,7)===sign(last.pressure,7)&&sign(last.pressure,7)!==0).length;
  const pressurePersistence=h.length?Math.round(samePressure/h.length*100):0;
  const liveVelocityBps=first?.price?(last.price-first.price)/first.price*10000:0;

  const comp=compressionScore(c1),sweep=sweepReclaim(c1),rangePos=recentRangePosition(c1,p);
  const trapSide:Side=liquidity?.absorption?.trapDetected?(liquidity?.absorption?.side||'WAIT'):'WAIT';

  const buy:number[]=[0],sell:number[]=[0],reasons:string[]=[];
  const add=(side:Side,pts:number,reason:string)=>{if(side==='BUY')buy.push(pts);else if(side==='SELL')sell.push(pts);if(side!=='WAIT'&&pts>0)reasons.push(reason);};

  const pSide=sign(last.pressure,8)>0?'BUY':sign(last.pressure,8)<0?'SELL':'WAIT';
  add(pSide,Math.min(20,Math.abs(last.pressure)*.45),'ضغط السيولة الحالي متجه '+pSide);
  const ptSide=sign(pressureTrend,8)>0?'BUY':sign(pressureTrend,8)<0?'SELL':'WAIT';
  add(ptSide,Math.min(16,Math.abs(pressureTrend)*.35),'ضغط السيولة يتسارع '+ptSide);
  if(pressurePersistence>=60)add(pSide,12,'ضغط متكرر عبر عدة لقطات');

  const micro=Number(liquidity?.book?.microEdge||0);
  const microSide=sign(micro,18)>0?'BUY':sign(micro,18)<0?'SELL':'WAIT';
  add(microSide,Math.min(14,Math.abs(micro)*.13),'Microprice يسبق المنتصف ناحية '+microSide);

  const accel=Number(liquidity?.dynamics?.acceleration||0);
  const accelSide=sign(accel,10)>0?'BUY':sign(accel,10)<0?'SELL':'WAIT';
  add(accelSide,Math.min(12,Math.abs(accel)*.16),'تسارع Order Flow ناحية '+accelSide);

  const delta=Number(liquidity?.flow?.deltaPct||0),priceBps=Number(liquidity?.flow?.priceChangeBps||0);
  const followBuy=delta>=22&&priceBps>=1.8,followSell=delta<=-22&&priceBps<=-1.8;
  if(followBuy)add('BUY',14,'Buy Delta معه متابعة سعرية');
  if(followSell)add('SELL',14,'Sell Delta معه متابعة سعرية');

  if(trapSide!=='WAIT'){
    const pts=Math.min(24,Number(liquidity?.absorption?.score||0)*.24);
    add(trapSide,pts,'Trap/Absorption يرجّح '+trapSide);
  }

  if(sweep.side!=='WAIT')add(sweep.side,Math.min(18,sweep.score*.20),'Sweep ثم Reclaim على M1');

  const rawBuy=buy.reduce((a,b)=>a+b,0),rawSell=sell.reduce((a,b)=>a+b,0);
  let buyScore=rawBuy,sellScore=rawSell;
  const pressureDirection:Side=rawBuy-rawSell>=8?'BUY':rawSell-rawBuy>=8?'SELL':'WAIT';

  if(comp.score>=60&&pressureDirection!=='WAIT'){
    const bonus=Math.min(16,comp.score*.16);
    if(pressureDirection==='BUY')buyScore+=bonus;else sellScore+=bonus;
    reasons.push('Volatility Compression مع ضغط '+pressureDirection);
  }

  const velSide=sign(liveVelocityBps,.8)>0?'BUY':sign(liveVelocityBps,.8)<0?'SELL':'WAIT';
  if(velSide!=='WAIT'&&velSide===pressureDirection){
    const bonus=Math.min(12,Math.abs(liveVelocityBps)*2.2);
    if(velSide==='BUY')buyScore+=bonus;else sellScore+=bonus;
    reasons.push('بدأ Ignition سعري في نفس اتجاه الضغط');
  }

  if(trapSide==='BUY')sellScore*=.62;
  if(trapSide==='SELL')buyScore*=.62;

  const b=Math.min(92,Math.round(buyScore)),s=Math.min(92,Math.round(sellScore)),gap=Math.abs(b-s),side:Side=b-s>=8?'BUY':s-b>=8?'SELL':'WAIT',score=Math.max(b,s);
  const precursorCount=[
    Math.abs(last.pressure)>=10,
    Math.abs(pressureTrend)>=8,
    pressurePersistence>=60,
    Math.abs(micro)>=18,
    Math.abs(accel)>=10,
    comp.score>=60,
    sweep.side===side,
    trapSide===side
  ].filter(Boolean).length;

  let stage:Stage='WAIT';
  if(side!=='WAIT'&&score>=58&&precursorCount>=3)stage='PRE_MOVE';
  if(stage==='PRE_MOVE'&&velSide===side&&Math.abs(liveVelocityBps)>=1.0&&score>=66)stage='IGNITION';
  if(trapSide!=='WAIT'&&side===trapSide&&Number(liquidity?.absorption?.score||0)>=70)stage='REVERSAL_ALERT';

  const confidence=Math.min(90,Math.round(score*.65+Math.min(100,precursorCount*14)*.20+Math.min(100,pressurePersistence)*.15));
  return {
    ok:true,side,stage,score,confidence,reasons:[...new Set(reasons)].slice(0,7),
    components:{
      pressureTrend:Number(pressureTrend.toFixed(1)),pressurePersistence,micropriceLead:Math.round(micro),flowLead:Number(delta.toFixed(1)),acceleration:Number(accel.toFixed(1)),compression:comp.score,sweepReclaim:sweep.side===side?sweep.score:0,liveVelocityBps:Number(liveVelocityBps.toFixed(2)),trapSide
    },
    diagnostics:{samples:h.length,compressionRatio:comp.ratio,recentRangePosition:rangePos,precursorCount}
  };
}
