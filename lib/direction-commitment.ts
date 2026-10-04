export type CommitmentSide='BUY'|'SELL'|'WAIT';
type State={side:CommitmentSide;since:number;lastAt:number;emaEdge:number;pendingSide:CommitmentSide;pendingCount:number;neutralCount:number};

export type DirectionCommitment={
  side:CommitmentSide;
  state:'ACQUIRE'|'LOCKED'|'HOLD_WEAK'|'REVERSAL_PENDING'|'FAST_FLIP'|'NEUTRAL';
  rawSide:CommitmentSide;
  rawEdge:number;
  smoothedEdge:number;
  strength:number;
  ageMs:number;
  pendingSide:CommitmentSide;
  pendingCount:number;
  heldByHysteresis:boolean;
};

const states=new Map<string,State>();
const cap=(n:number,a=0,b=92)=>Math.max(a,Math.min(b,n));
const sideFromEdge=(e:number,gate=4):CommitmentSide=>e>=gate?'BUY':e<=-gate?'SELL':'WAIT';

export function commitDirection(
  key:string,
  buy:number,
  sell:number,
  now=Date.now(),
  fast?:{side?:CommitmentSide;stage?:string;score?:number;confidence?:number}|null
):DirectionCommitment{
  const rawEdge=Number(buy||0)-Number(sell||0),rawSide=sideFromEdge(rawEdge,4);
  let s=states.get(key);
  if(s&&now-s.lastAt>60000){states.delete(key);s=undefined;}
  const emaEdge=s?s.emaEdge*.62+rawEdge*.38:rawEdge;
  const emaSide=sideFromEdge(emaEdge,5);
  const fastSide:CommitmentSide=fast?.side==='BUY'||fast?.side==='SELL'?fast.side:'WAIT';
  const fastFlip=Boolean(
    fastSide!=='WAIT'&&(
      (fast?.stage==='IGNITION'&&Number(fast?.score||0)>=70&&Number(fast?.confidence||0)>=60&&Math.abs(rawEdge)>=4.5)||
      (fast?.stage==='WAVE_FORMING'&&Number(fast?.score||0)>=82&&Number(fast?.confidence||0)>=68&&Math.abs(rawEdge)>=7)
    )
  );

  if(!s||s.side==='WAIT'){
    const acquire=fastSide!=='WAIT'&&fastFlip?fastSide:emaSide;
    if(acquire==='WAIT'){
      const neutral:State={side:'WAIT',since:now,lastAt:now,emaEdge,pendingSide:'WAIT',pendingCount:0,neutralCount:1};
      states.set(key,neutral);
      return {side:'WAIT',state:'NEUTRAL',rawSide,rawEdge:Number(rawEdge.toFixed(2)),smoothedEdge:Number(emaEdge.toFixed(2)),strength:0,ageMs:0,pendingSide:'WAIT',pendingCount:0,heldByHysteresis:false};
    }
    const ns:State={side:acquire,since:now,lastAt:now,emaEdge,pendingSide:'WAIT',pendingCount:0,neutralCount:0};states.set(key,ns);
    return {side:acquire,state:'ACQUIRE',rawSide,rawEdge:Number(rawEdge.toFixed(2)),smoothedEdge:Number(emaEdge.toFixed(2)),strength:Math.round(cap(50+Math.abs(emaEdge)*2.2)),ageMs:0,pendingSide:'WAIT',pendingCount:0,heldByHysteresis:false};
  }

  const ageMs=now-s.since,current=s.side,opposite:CommitmentSide=current==='BUY'?'SELL':'BUY';
  if(fastFlip&&fastSide===opposite){
    const ns:State={side:opposite,since:now,lastAt:now,emaEdge,pendingSide:'WAIT',pendingCount:0,neutralCount:0};states.set(key,ns);
    return {side:opposite,state:'FAST_FLIP',rawSide,rawEdge:Number(rawEdge.toFixed(2)),smoothedEdge:Number(emaEdge.toFixed(2)),strength:Math.round(cap(56+Math.abs(emaEdge)*2)),ageMs:0,pendingSide:'WAIT',pendingCount:0,heldByHysteresis:false};
  }

  const fastPressure=fastSide===opposite&&['IGNITION','WAVE_FORMING'].includes(String(fast?.stage||''))&&Number(fast?.confidence||0)>=58;
  const oppositeEma=emaSide===opposite&&Math.abs(emaEdge)>=(fastPressure?8:10),oppositeRaw=rawSide===opposite&&Math.abs(rawEdge)>=(fastPressure?6.5:8);
  if(oppositeEma&&oppositeRaw&&ageMs>=5000){
    const pendingCount=s.pendingSide===opposite?s.pendingCount+1:1;
    if(pendingCount>=2){
      const ns:State={side:opposite,since:now,lastAt:now,emaEdge,pendingSide:'WAIT',pendingCount:0,neutralCount:0};states.set(key,ns);
      return {side:opposite,state:'LOCKED',rawSide,rawEdge:Number(rawEdge.toFixed(2)),smoothedEdge:Number(emaEdge.toFixed(2)),strength:Math.round(cap(52+Math.abs(emaEdge)*2)),ageMs:0,pendingSide:'WAIT',pendingCount:0,heldByHysteresis:false};
    }
    const ns:State={...s,lastAt:now,emaEdge,pendingSide:opposite,pendingCount,neutralCount:0};states.set(key,ns);
    return {side:current,state:'REVERSAL_PENDING',rawSide,rawEdge:Number(rawEdge.toFixed(2)),smoothedEdge:Number(emaEdge.toFixed(2)),strength:Math.round(cap(44+Math.abs(emaEdge)*1.7)),ageMs,pendingSide:opposite,pendingCount,heldByHysteresis:true};
  }

  const supportive=rawSide===current||emaSide===current;
  const weakNow=rawSide==='WAIT'||Math.abs(rawEdge)<3||Math.abs(emaEdge)<2.5;
  const neutralCount=weakNow?s.neutralCount+1:0;
  const staleWeak=neutralCount>=(fastPressure?2:3)&&ageMs>=(fastPressure?4000:6000);
  const fadingAgainst=rawSide===opposite&&Math.abs(rawEdge)>=(fastPressure?4:5)&&Math.abs(emaEdge)<7&&ageMs>=(fastPressure?4500:7000);
  if(staleWeak||fadingAgainst){
    const ns:State={side:'WAIT',since:now,lastAt:now,emaEdge,pendingSide:'WAIT',pendingCount:0,neutralCount:0};states.set(key,ns);
    return {side:'WAIT',state:'NEUTRAL',rawSide,rawEdge:Number(rawEdge.toFixed(2)),smoothedEdge:Number(emaEdge.toFixed(2)),strength:0,ageMs:0,pendingSide:'WAIT',pendingCount:0,heldByHysteresis:false};
  }
  const state:DirectionCommitment['state']=supportive?'LOCKED':'HOLD_WEAK';
  const ns:State={...s,lastAt:now,emaEdge,pendingSide:'WAIT',pendingCount:0,neutralCount};states.set(key,ns);
  return {side:current,state,rawSide,rawEdge:Number(rawEdge.toFixed(2)),smoothedEdge:Number(emaEdge.toFixed(2)),strength:Math.round(cap((supportive?50:34)+Math.abs(emaEdge)*1.8)),ageMs,pendingSide:'WAIT',pendingCount:0,heldByHysteresis:!supportive};
}
