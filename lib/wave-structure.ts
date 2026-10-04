import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Phase='COMPRESSION'|'BREAKOUT'|'RETEST'|'SWEEP_REVERSAL'|'IMPULSE'|'PULLBACK'|'EXHAUSTION'|'TREND'|'TRANSITION';

type FrameStructure={
  side:Side;
  phase:Phase;
  score:number;
  confidence:number;
  structure:string;
  nextSide:Side;
  nextScore:number;
  rangePosition:number;
  compression:number;
  expansion:number;
  bodyPressure:number;
  sweepSide:Side;
  breakoutSide:Side;
  retestSide:Side;
  exhaustionSide:Side;
  pullbackSide:Side;
  reasons:string[];
};

export type WaveStructure={
  ok:boolean;
  side:Side;
  score:number;
  confidence:number;
  path:string;
  shortSide:Side;
  followSide:Side;
  m1:FrameStructure|null;
  m5:FrameStructure|null;
  reasons:string[];
};

const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const cap=(n:number,a=0,b=92)=>Math.max(a,Math.min(b,n));
const sideOf=(v:number,gate=8):Side=>v>=gate?'BUY':v<=-gate?'SELL':'WAIT';

function atr(c:Candle[],n=14){
  if(c.length<n+1)return NaN;
  const x=c.slice(-(n+1)),tr:number[]=[];
  for(let i=1;i<x.length;i++)tr.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));
  return avg(tr.slice(-n));
}
function swings(c:Candle[],radius=2){
  const hi:{i:number;p:number}[]=[],lo:{i:number;p:number}[]=[];
  for(let i=radius;i<c.length-radius;i++){
    const w=c.slice(i-radius,i+radius+1),x=c[i];
    if(x.high===Math.max(...w.map(v=>v.high)))hi.push({i,p:x.high});
    if(x.low===Math.min(...w.map(v=>v.low)))lo.push({i,p:x.low});
  }
  return {hi:hi.slice(-4),lo:lo.slice(-4)};
}
function frame(series:Candle[],ms:number,now:number):FrameStructure|null{
  const c=series.filter(x=>x.time+ms<=now).slice(-60);
  if(c.length<28)return null;
  const a=atr(c,14);if(!Number.isFinite(a)||a<=0)return null;
  const last=c.at(-1)!,prev=c.at(-2)!,prior=c.slice(-23,-3),hi=Math.max(...prior.map(x=>x.high)),lo=Math.min(...prior.map(x=>x.low)),span=Math.max(1e-9,hi-lo);
  const sw=swings(c.slice(-40),2),h=sw.hi,l=sw.lo;
  let structureSide:Side='WAIT',structure='MIXED';
  if(h.length>=2&&l.length>=2){
    const hh=h.at(-1)!.p>h.at(-2)!.p,hl=l.at(-1)!.p>l.at(-2)!.p,lh=h.at(-1)!.p<h.at(-2)!.p,ll=l.at(-1)!.p<l.at(-2)!.p;
    if(hh&&hl){structureSide='BUY';structure='HH + HL';}
    else if(lh&&ll){structureSide='SELL';structure='LH + LL';}
    else if(hh&&ll)structure='EXPANDING RANGE';
    else structure='COMPRESSION / RANGE';
  }

  const r=last.high-last.low,body=Math.abs(last.close-last.open),bodyRatio=r>0?body/r:0,closePos=r>0?(last.close-last.low)/r:.5;
  const upper=Math.max(0,last.high-Math.max(last.open,last.close)),lower=Math.max(0,Math.min(last.open,last.close)-last.low);
  const wickBias=r>0?(lower-upper)/r:0;
  const bodyPressure=last.close>=last.open?bodyRatio*100:-bodyRatio*100;

  const recentRanges=c.slice(-4).map(x=>x.high-x.low),baseRanges=c.slice(-16,-4).map(x=>x.high-x.low);
  const compression=avg(baseRanges)>0?avg(recentRanges)/avg(baseRanges):1;
  const expansion=avg(baseRanges)>0?avg(c.slice(-3).map(x=>x.high-x.low))/avg(baseRanges):1;
  const rangePosition=Math.round(Math.max(0,Math.min(1,(last.close-lo)/span))*100);

  const sweepSide:Side=last.low<lo&&last.close>lo&&closePos>=.55?'BUY':last.high>hi&&last.close<hi&&closePos<=.45?'SELL':'WAIT';
  const breakoutSide:Side=last.close>hi+.06*a?'BUY':last.close<lo-.06*a?'SELL':'WAIT';

  let retestSide:Side='WAIT';
  const prevBreakUp=prev.close>hi+.04*a,prevBreakDn=prev.close<lo-.04*a;
  if(prevBreakUp&&last.low<=hi+.18*a&&last.close>hi)retestSide='BUY';
  if(prevBreakDn&&last.high>=lo-.18*a&&last.close<lo)retestSide='SELL';

  let exhaustionSide:Side='WAIT';
  const stretched=r>=1.45*a||expansion>=1.65;
  if(stretched&&bodyRatio<=.48&&upper/r>=.32&&closePos<.58)exhaustionSide='SELL';
  if(stretched&&bodyRatio<=.48&&lower/r>=.32&&closePos>.42)exhaustionSide='BUY';

  const last6=c.slice(-6),net=last.close-last6[0].open,path=last6.slice(1).reduce((s,x,i)=>s+Math.abs(x.close-last6[i].close),0),eff=path>0?Math.abs(net)/path:0;
  const impulseSide:Side=net>=1.15*a&&eff>=.50?'BUY':net<=-1.15*a&&eff>=.50?'SELL':'WAIT';

  let pullbackSide:Side='WAIT';
  if(structureSide==='BUY'&&last.close<prev.close&&last.low>lo&&Math.abs(last.close-prev.close)<=.75*a)pullbackSide='BUY';
  if(structureSide==='SELL'&&last.close>prev.close&&last.high<hi&&Math.abs(last.close-prev.close)<=.75*a)pullbackSide='SELL';

  const buy:number[]=[0],sell:number[]=[0],reasons:string[]=[];
  const add=(s:Side,p:number,r:string)=>{if(s==='BUY')buy.push(p);else if(s==='SELL')sell.push(p);if(s!=='WAIT'&&p>=5)reasons.push(r);};
  add(structureSide,20,'Market structure '+structure);
  add(sweepSide,28,'Sweep + reclaim '+sweepSide);
  add(breakoutSide,24,'Breakout confirmed '+breakoutSide);
  add(retestSide,26,'Breakout retest '+retestSide);
  add(exhaustionSide,22,'Exhaustion/rejection '+exhaustionSide);
  add(impulseSide,18,'Impulse '+impulseSide);
  add(pullbackSide,18,'Pullback مع بقاء الهيكل '+pullbackSide);
  if(compression<=.68&&structureSide!=='WAIT')add(structureSide,12,'Compression داخل هيكل '+structureSide);
  if(bodyPressure>=55)add('BUY',8,'Strong bullish close');
  if(bodyPressure<=-55)add('SELL',8,'Strong bearish close');
  if(wickBias>=.35)add('BUY',7,'Lower wick rejection');
  if(wickBias<=-.35)add('SELL',7,'Upper wick rejection');

  const b=buy.reduce((a,b)=>a+b,0),s=sell.reduce((a,b)=>a+b,0),edge=b-s,nextSide=sideOf(edge,7),nextScore=Math.round(cap(Math.max(b,s)));
  let phase:Phase='TRANSITION';
  if(sweepSide!=='WAIT')phase='SWEEP_REVERSAL';
  else if(retestSide!=='WAIT')phase='RETEST';
  else if(breakoutSide!=='WAIT')phase='BREAKOUT';
  else if(exhaustionSide!=='WAIT')phase='EXHAUSTION';
  else if(pullbackSide!=='WAIT')phase='PULLBACK';
  else if(impulseSide!=='WAIT')phase='IMPULSE';
  else if(compression<=.68)phase='COMPRESSION';
  else if(structureSide!=='WAIT')phase='TREND';

  const phaseBonus=phase==='RETEST'||phase==='SWEEP_REVERSAL'?12:phase==='BREAKOUT'||phase==='IMPULSE'?8:phase==='PULLBACK'?7:0;
  const confidence=Math.round(cap(nextScore*.62+Math.min(100,Math.abs(edge)*2)*.18+phaseBonus+Math.min(12,Math.abs(bodyPressure)*.08),0,90));

  return {side:structureSide,phase,score:Math.round(cap(Math.max(b,s))),confidence,structure,nextSide,nextScore,rangePosition,compression:Number(compression.toFixed(2)),expansion:Number(expansion.toFixed(2)),bodyPressure:Math.round(bodyPressure),sweepSide,breakoutSide,retestSide,exhaustionSide,pullbackSide,reasons:[...new Set(reasons)].slice(0,7)};
}

export function analyzeWaveStructure(c1:Candle[],c5:Candle[],now=Date.now()):WaveStructure{
  const m1=frame(c1,60000,now),m5=frame(c5,300000,now);
  if(!m1&&!m5)return {ok:false,side:'WAIT',score:0,confidence:0,path:'UNKNOWN',shortSide:'WAIT',followSide:'WAIT',m1:null,m5:null,reasons:['بنية الحركة غير مكتملة.']};
  const shortSide=m1?.nextSide||'WAIT',followSide=m5?.nextSide||m5?.side||'WAIT';
  let path='RANGE_OR_FAKEOUT';
  if(shortSide==='BUY'&&followSide==='SELL')path='RISE_THEN_DROP';
  else if(shortSide==='SELL'&&followSide==='BUY')path='DROP_THEN_RISE';
  else if(shortSide==='BUY'&&(followSide==='BUY'||followSide==='WAIT'))path='CONTINUATION_UP';
  else if(shortSide==='SELL'&&(followSide==='SELL'||followSide==='WAIT'))path='CONTINUATION_DOWN';
  const buy=(m1?.nextSide==='BUY'?Number(m1.nextScore)*.58:0)+(m5?.nextSide==='BUY'?Number(m5.nextScore)*.42:0);
  const sell=(m1?.nextSide==='SELL'?Number(m1.nextScore)*.58:0)+(m5?.nextSide==='SELL'?Number(m5.nextScore)*.42:0);
  const side=sideOf(buy-sell,6),score=Math.round(cap(Math.max(buy,sell))),conf=Math.round(cap((m1?.confidence||0)*.58+(m5?.confidence||0)*.42-(shortSide!=='WAIT'&&followSide!=='WAIT'&&shortSide!==followSide?5:0),0,90));
  const reasons:string[]=[];
  if(m1)reasons.push('M1 '+m1.phase+' · '+m1.structure+' · next '+m1.nextSide);
  if(m5)reasons.push('M5 '+m5.phase+' · '+m5.structure+' · next '+m5.nextSide);
  if(shortSide!==followSide&&shortSide!=='WAIT'&&followSide!=='WAIT')reasons.push('الحركة القصيرة عكس الموجة التالية: مسار من مرحلتين');
  return {ok:true,side,score,confidence:conf,path,shortSide,followSide,m1,m5,reasons};
}
