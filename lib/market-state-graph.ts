import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type StateName='ACCUMULATION'|'DISTRIBUTION'|'COMPRESSION'|'BREAKOUT_UP'|'BREAKOUT_DOWN'|'IMPULSE_UP'|'IMPULSE_DOWN'|'PULLBACK_UP'|'PULLBACK_DOWN'|'EXHAUSTION_UP'|'EXHAUSTION_DOWN'|'RANGE'|'TRANSITION';

export type MarketStateGraph={
  ok:boolean;
  current:StateName;
  previous:StateName[];
  side:Side;
  confidence:number;
  nextState:StateName;
  nextStateProbability:number;
  nextSide:Side;
  nextSideProbability:number;
  changePoint:boolean;
  changePointScore:number;
  sequenceMatches:number;
  transitionCount:number;
  sequence:string;
  reasons:string[];
};

const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const cap=(n:number,a=0,b=95)=>Math.max(a,Math.min(b,n));

function atr(c:Candle[],i:number,n=14){
  if(i<n)return NaN;let s=0,k=0;
  for(let j=i-n+1;j<=i;j++){const x=c[j],p=c[j-1];if(!x||!p)continue;s+=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));k++;}
  return k?s/k:NaN;
}
function stateSide(s:StateName):Side{
  if(['BREAKOUT_UP','IMPULSE_UP','PULLBACK_UP','ACCUMULATION','EXHAUSTION_DOWN'].includes(s))return 'BUY';
  if(['BREAKOUT_DOWN','IMPULSE_DOWN','PULLBACK_DOWN','DISTRIBUTION','EXHAUSTION_UP'].includes(s))return 'SELL';
  return 'WAIT';
}
function classify(c:Candle[],i:number):StateName{
  if(i<24)return 'TRANSITION';
  const a=atr(c,i,14);if(!Number.isFinite(a)||a<=0)return 'TRANSITION';
  const x=c[i],p=c[i-1],base=c.slice(i-20,i),hi=Math.max(...base.map(v=>v.high)),lo=Math.min(...base.map(v=>v.low));
  const recent=c.slice(i-4,i+1),recentRange=avg(recent.map(v=>v.high-v.low)),priorRange=avg(c.slice(i-16,i-4).map(v=>v.high-v.low));
  const compression=priorRange>0?recentRange/priorRange:1;
  const net=x.close-c[i-5].close,path=c.slice(i-5,i+1).reduce((s,v,j,a2)=>j?s+Math.abs(v.close-a2[j-1].close):0,0),eff=path>0?Math.abs(net)/path:0;
  const r=Math.max(1e-9,x.high-x.low),body=Math.abs(x.close-x.open)/r,upper=(x.high-Math.max(x.open,x.close))/r,lower=(Math.min(x.open,x.close)-x.low)/r;

  const breakoutUp=x.close>hi+.08*a,breakoutDown=x.close<lo-.08*a;
  if(breakoutUp)return 'BREAKOUT_UP';
  if(breakoutDown)return 'BREAKOUT_DOWN';

  const impulseUp=net>1.1*a&&eff>.52,impulseDown=net<-1.1*a&&eff>.52;
  if(impulseUp)return body<.42&&upper>.32?'EXHAUSTION_UP':'IMPULSE_UP';
  if(impulseDown)return body<.42&&lower>.32?'EXHAUSTION_DOWN':'IMPULSE_DOWN';

  const lows=c.slice(i-8,i+1).map(v=>v.low),highs=c.slice(i-8,i+1).map(v=>v.high);
  const lowSlope=(lows.at(-1)!-lows[0])/Math.max(1,lows.length-1),highSlope=(highs.at(-1)!-highs[0])/Math.max(1,highs.length-1);
  if(compression<.68){
    if(lowSlope>0&&x.close>(hi+lo)/2)return 'ACCUMULATION';
    if(highSlope<0&&x.close<(hi+lo)/2)return 'DISTRIBUTION';
    return 'COMPRESSION';
  }

  if(p.close>x.close&&net>0&&x.low>lo)return 'PULLBACK_UP';
  if(p.close<x.close&&net<0&&x.high<hi)return 'PULLBACK_DOWN';
  if(Math.abs(net)<.35*a&&compression<1.05)return 'RANGE';
  return 'TRANSITION';
}
function changePoint(c:Candle[],i:number){
  if(i<30)return {hit:false,score:0};
  const a=atr(c,i,14);if(!Number.isFinite(a)||a<=0)return {hit:false,score:0};
  const now=c.slice(i-3,i+1),prev=c.slice(i-15,i-3);
  const nowRet=(now.at(-1)!.close-now[0].open)/a,prevRet=(prev.at(-1)!.close-prev[0].open)/a;
  const nowRange=avg(now.map(v=>v.high-v.low))/a,prevRange=avg(prev.map(v=>v.high-v.low))/a;
  const score=cap(Math.abs(nowRet-prevRet)*22+Math.abs(nowRange-prevRange)*28,0,100);
  return {hit:score>=58,score:Math.round(score)};
}

export function buildMarketStateGraph(c1:Candle[],now=Date.now()):MarketStateGraph{
  const c=c1.filter(x=>x.time+60000<=now).slice(-420);
  const empty:MarketStateGraph={ok:false,current:'TRANSITION',previous:[],side:'WAIT',confidence:0,nextState:'TRANSITION',nextStateProbability:0,nextSide:'WAIT',nextSideProbability:0,changePoint:false,changePointScore:0,sequenceMatches:0,transitionCount:0,sequence:'',reasons:['بيانات غير كافية لبناء تسلسل حالات السوق.']};
  if(c.length<90)return empty;

  const states:StateName[]=[];
  for(let i=24;i<c.length;i++)states.push(classify(c,i));
  const current=states.at(-1)||'TRANSITION',previous=states.slice(-4,-1);
  const seq=states.slice(-3).join('>');
  const transitions=Math.max(0,states.length-1);
  const collect=(depth:number)=>{
    const nextCounts=new Map<StateName,number>(),sideCounts:{BUY:number;SELL:number;WAIT:number}={BUY:0,SELL:0,WAIT:0};
    let matches=0,weightTotal=0;
    const targetPrefix=states.slice(-depth).join('>');
    for(let i=depth;i<states.length-1;i++){
      const prefix=states.slice(i-depth,i).join('>');
      if(prefix!==targetPrefix)continue;
      matches++;
      const recency=.55+.45*(i/Math.max(1,states.length-2));
      const n=states[i] as StateName,s=stateSide(n);
      nextCounts.set(n,(nextCounts.get(n)||0)+recency);
      sideCounts[s]+=recency;weightTotal+=recency;
    }
    return {depth,nextCounts,sideCounts,matches,weightTotal};
  };

  let transition=collect(3);
  if(transition.matches<6)transition=collect(2);
  if(transition.matches<5)transition=collect(1);

  let nextState:StateName='TRANSITION',best=0;
  for(const [s,n] of transition.nextCounts){if(n>best){best=n;nextState=s;}}
  const nextStateProbability=transition.weightTotal?Math.round(best/transition.weightTotal*100):0;
  const sideEntries=Object.entries(transition.sideCounts) as [Side,number][];
  sideEntries.sort((a,b)=>b[1]-a[1]);
  const directionalGap=(sideEntries[0]?.[1]||0)-(sideEntries[1]?.[1]||0);
  let nextSide:Side=transition.matches&&directionalGap>=Math.max(.45,transition.weightTotal*.08)?sideEntries[0][0]:'WAIT';
  let nextSideProbability=transition.weightTotal?Math.round((sideEntries[0]?.[1]||0)/transition.weightTotal*100):0;
  const matches=transition.matches;

  // v11 local resolver: exact sequence memory can be sparse in a regime shift, so blend the freshest price path.
  const ai=atr(c,c.length-1,14),last=c.at(-1)!,c3=c.at(-4),c6=c.at(-7);
  const r3=Number.isFinite(ai)&&ai>0&&c3?(last.close-c3.close)/ai:0;
  const r6=Number.isFinite(ai)&&ai>0&&c6?(last.close-c6.close)/ai:0;
  const localSigned=r3*.68+r6*.32;
  const localSide:Side=localSigned>=.16?'BUY':localSigned<=-.16?'SELL':'WAIT';
  const nextStateSide=stateSide(nextState),currentSide=stateSide(current);
  if(nextSide==='WAIT'&&nextStateSide!=='WAIT'&&nextStateProbability>=38){
    nextSide=nextStateSide;
    nextSideProbability=Math.max(nextSideProbability,Math.min(72,42+Math.round(Math.abs(localSigned)*12)));
  }
  if(nextSide==='WAIT'&&localSide!=='WAIT'&&(matches<8||['RANGE','COMPRESSION','TRANSITION'].includes(current))){
    nextSide=localSide;
    nextSideProbability=Math.round(cap(44+Math.min(24,Math.abs(localSigned)*18)+(currentSide===localSide?5:0),0,74));
  }

  const cp=changePoint(c,c.length-1);
  const sampleQuality=Math.min(1,matches/(transition.depth===3?12:transition.depth===2?16:22));
  const depthBonus=transition.depth===3?7:transition.depth===2?3:0;
  const cpPenalty=cp.hit?Math.min(16,6+cp.score*.10):0;
  const confidence=Math.round(cap(nextStateProbability*.48+nextSideProbability*.27+sampleQuality*18+depthBonus-cpPenalty,0,88));
  const reasons=[
    'Current state: '+current,
    'Sequence: '+seq,
    'Historical sequence matches: '+matches+' · depth '+transition.depth,
    'Most common next state: '+nextState+' · '+nextStateProbability+'%',
    'Next directional state: '+nextSide+' · '+nextSideProbability+'%',
    'Local path bias: '+localSide+' · '+Number(localSigned.toFixed(2))+' ATR blend'
  ];
  if(cp.hit)reasons.push('Change-point detected: market regime may be shifting');

  return {ok:true,current,previous,side:stateSide(current),confidence,nextState,nextStateProbability,nextSide,nextSideProbability,changePoint:cp.hit,changePointScore:cp.score,sequenceMatches:matches,transitionCount:transitions,sequence:seq,reasons};
}
