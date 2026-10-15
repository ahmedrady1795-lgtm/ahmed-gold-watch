import type {Candle} from './engine';
type Side='BUY'|'SELL'|'WAIT';
const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const mean=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
// The model is only a paper/shadow illustration. Every feature must come from
// chronologically ordered, fully closed candles; no forming/future bar votes.
export function validateFusionFrame(raw:Candle[],periodMs:number,now:number,minRows:number,maxAgeMs:number){
  const seen=new Map<number,Candle>();
  if(!Number.isFinite(now)||now<=0||!Array.isArray(raw))
    return {ok:false,reason:'invalid clock or candle source',rows:[] as Candle[]};
  for(const c of raw){
    const {time,open,high,low,close}=c||{} as Candle;
    if(![time,open,high,low,close].every(Number.isFinite)||
      time<=0||low<=0||high<Math.max(open,close)||low>Math.min(open,close)||
      time+periodMs>now)continue;
    seen.set(time,c);
  }
  const rows=[...seen.values()].sort((a,b)=>a.time-b.time).slice(-400);
  if(rows.length<minRows)return {ok:false,reason:'insufficient closed candles',rows:[] as Candle[]};
  const latest=rows.at(-1)!;
  if(now-(latest.time+periodMs)>maxAgeMs)return {ok:false,reason:'stale closed candles',rows:[] as Candle[]};
  const tail=rows.slice(-Math.min(15,minRows));
  if(tail.some((c,i)=>i>0&&c.time-tail[i-1].time!==periodMs))
    return {ok:false,reason:'gapped closed candles',rows:[] as Candle[]};
  return {ok:true,reason:'',rows};
}
export function validFusionTick(tick:any,now:number){
  if(!tick?.ok)return false;
  const stamp=tick.sourceAt??tick.receivedAt??tick.at??tick.checkedAt??tick.sourceTime;
  const raw=typeof stamp==='string'&&!Number.isFinite(Number(stamp))?Date.parse(stamp):Number(stamp);
  const at=raw>=1e9&&raw<1e11?raw*1000:raw;
  return Number.isFinite(at)&&at>0&&at<=now+1000&&now-at<=7000;
}
const atr=(c:Candle[])=>{const x=c.slice(-15),v:number[]=[];for(let i=1;i<x.length;i++)v.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));return mean(v)||0;};
function slope(c:Candle[],n:number){const x=c.slice(-Math.max(2,n));if(x.length<2)return 0;return (x.at(-1)!.close-x[0].close)/Math.max(1,x.length-1);}
function one(price:number,a:number,seconds:number,signal:number,quality:number){
  const timeScale=Math.sqrt(Math.max(1,seconds)/60);
  const side:Side=Math.abs(signal)<.16?'WAIT':signal>0?'BUY':'SELL';
  // Neutral is neutral: never displace the expected price upward by default.
  const signedMove=side==='WAIT'?0:a*timeScale*Math.min(Math.abs(signal),1.25)*Math.sign(signal);
  const center=price+signedMove;
  const band=a*timeScale*(.24+(100-quality)/260),edge=side==='WAIT'?0:cap(Math.abs(signal)*42,0,28),buy=cap(50+Math.sign(signal)*edge,22,78),sell=100-buy;
  return {seconds,side,probabilityBasis:'UNCALIBRATED_HEURISTIC',price:Number(center.toFixed(2)),low:Number((center-band).toFixed(2)),high:Number((center+band).toFixed(2)),buyProbability:Number(buy.toFixed(1)),sellProbability:Number(sell.toFixed(1)),confidence:Math.round(cap(quality*.58+edge*.55-(side==='WAIT'?12:0),0,88))};
}
export function buildPredatorFusionV2(input:{c1:Candle[];c5:Candle[];price:number|null;tick?:any;goldCore?:any;now?:number}){
  const now=Number(input.now??Date.now()),p=Number(input.price);
  const minute=validateFusionFrame(input.c1,60000,now,40,120000);
  const five=validateFusionFrame(input.c5,300000,now,30,600000);
  if(!Number.isFinite(p)||p<=0||!minute.ok||!five.ok)
    return {ok:false,status:'SHADOW_INSUFFICIENT',version:'predator-fusion-v2',
      reason:!minute.ok?'M1 '+minute.reason:!five.ok?'M5 '+five.reason:'invalid price'};
  const c1=minute.rows,c5=five.rows,a=Math.max(atr(c1),1e-9);
  if(Math.abs(p-c1.at(-1)!.close)/p>.015)
    return {ok:false,status:'SHADOW_PRICE_MISMATCH',version:'predator-fusion-v2',
      reason:'live price diverges from reference candles'};
  // A stale or timestamp-less DOM/pulse is not live microstructure.
  const tick=validFusionTick(input.tick,now)?input.tick:null;
  const goldCore=input.goldCore;
  const s1=slope(c1,6)/a,s5=slope(c5,5)/Math.max(atr(c5),a),tickSide=tick?.side==='BUY'?1:tick?.side==='SELL'?-1:0;
  const tickStrength=tick?.ok?cap(Number(tick.confidence||tick.score||0)/100,0,1):0;
  const vel=cap(Number(tick?.velocity15s||0)/.7,-1.2,1.2),acc=cap(Number(tick?.acceleration||0)/.12,-1.2,1.2),imb=cap(Number(tick?.bookImbalance||0)/45,-1.2,1.2);
  const coreSide=goldCore?.side==='BUY'?1:goldCore?.side==='SELL'?-1:0,coreStrength=cap(Number(goldCore?.confidence||0)/100,0,1);
  const v05=cap(Number(tick?.velocity05s||0)/.32,-1.5,1.5),v1=cap(Number(tick?.velocity1s||0)/.48,-1.5,1.5),v3=cap(Number(tick?.velocity3s||0)/.85,-1.5,1.5),v4=cap(Number(tick?.velocity4s||0)/1.05,-1.5,1.5);
  const persistence=cap((Number(tick?.persistence||50)-50)/28,-1.2,1.2)*(tickSide||Math.sign(v1));
  const accelerationLead=cap((v05-v3*.34)+(acc*.72),-1.8,1.8);
  const pressureLead=cap(imb*.72+persistence*.38,-1.5,1.5);
  const preMove=cap(accelerationLead*.52+pressureLead*.38+v05*.28+v1*.16-v4*.08,-1.8,1.8);
  const micro=tickSide*tickStrength*.28+vel*.12+acc*.18+imb*.12+preMove*.72;
  const structure=cap(s1,-1.3,1.3)*.18+cap(s5,-1.3,1.3)*.20+coreSide*coreStrength*.18;
  const signal=cap(micro*.82+structure*.38,-1.5,1.5);
  const disagreement=tickSide&&coreSide&&tickSide!==coreSide;
  const regime=goldCore?.regime||((Math.abs(s1)+Math.abs(s5))>1?'TREND':'TRANSITION');
  const quality=cap(48+(tick?.ok?12:0)+(goldCore?.ok?10:0)+Math.min(12,Math.abs(signal)*10)-(disagreement?14:0)-(regime==='TRANSITION'?6:0),28,86);
  const leadScore=Math.round(cap(Math.abs(preMove)*58+(tick?.stage==='PRE_TRIGGER'?18:tick?.stage==='IGNITION'?10:0)+(Math.abs(imb)>.3?8:0),0,96));
  const horizons={tenSeconds:one(p,a,10,preMove*1.18,quality),thirtySeconds:one(p,a,30,preMove*.82+signal*.34,quality),oneMinute:one(p,a,60,signal,quality),threeMinutes:one(p,a,180,signal*.70+s5*.10,quality-2),fiveMinutes:one(p,a,300,signal*.55+s5*.18,quality-4)};
  const vals=Object.values(horizons),side:Side=Math.abs(signal)<.16?'WAIT':signal>0?'BUY':'SELL';
  return {ok:true,status:'SHADOW',version:'predator-fusion-v2.2-causal',side,confidence:Math.round(mean(vals.map(x=>x.confidence))),uncertainty:Math.round(cap(100-quality+(disagreement?12:0),8,88)),regime,signal:Number(signal.toFixed(3)),preMoveSignal:Number(preMove.toFixed(3)),leadScore,horizons,
    validation:{m1LastClosedAt:c1.at(-1)!.time+60000,m5LastClosedAt:c5.at(-1)!.time+300000,
      sourceFresh:true,liveMicrostructure:Boolean(tick)},
    inputs:{tick:!!tick?.ok,priceAction:!!goldCore?.ok,disagreement,velocity05s:v05,velocity1s:v1,accelerationLead:Number(accelerationLead.toFixed(3)),pressureLead:Number(pressureLead.toFixed(3))},promotion:{production:false,reason:'Requires live OOS outcome validation before decision authority'}};
}