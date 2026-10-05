import {calibrateHorizonBrain} from './horizon-brain-learning';

type Side='BUY'|'SELL'|'WAIT';
type Evidence={side:Side;score:number;weight:number};
export type HorizonBrain={
  side:Side;confidence:number;buyShare:number;sellShare:number;agreement:number;uncertainty:number;
  independentFamilies:number;familyOpposition:number;families:Record<string,{side:Side;score:number}>;
  learning?:any;
};
const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const s=(x:any):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
const ev=(side:any,score:any,weight=1):Evidence=>({side:s(side),score:cap(Number(score||0),0,92),weight:Math.max(0,Number(weight||0))});

function family(rows:Evidence[]){
  const usable=rows.filter(x=>x.side!=='WAIT'&&x.score>=18&&x.weight>0);
  let buy=0,sell=0,w=0;
  for(const x of usable){
    const v=x.score*x.weight;
    if(x.side==='BUY')buy+=v;else sell+=v;
    w+=x.weight;
  }
  const total=buy+sell;
  if(!total||!w)return {side:'WAIT' as Side,score:0};
  const edge=Math.abs(buy-sell)/total*100;
  return {side:(edge>=10?(buy>sell?'BUY':'SELL'):'WAIT') as Side,score:Math.round(cap(Math.max(buy,sell)/w,0,92))};
}
function resolve(groups:Record<string,Evidence[]>,gate:number,minFamilies=2):HorizonBrain{
  const families:Record<string,{side:Side;score:number}>={};
  for(const [name,rows] of Object.entries(groups))families[name]=family(rows);
  const active=Object.values(families).filter(x=>x.side!=='WAIT'&&x.score>=18);
  if(!active.length)return {side:'WAIT',confidence:0,buyShare:50,sellShare:50,agreement:50,uncertainty:100,independentFamilies:0,familyOpposition:0,families};
  let buy=0,sell=0;
  for(const x of active){if(x.side==='BUY')buy+=x.score;else sell+=x.score;}
  const total=buy+sell,buyShare=total?buy/total*100:50,sellShare=100-buyShare,edge=Math.abs(buyShare-sellShare);
  const winner:Side=buy>sell?'BUY':'SELL';
  const support=active.filter(x=>x.side===winner).length,opposition=active.filter(x=>x.side!==winner).length;
  const confidence=Math.round(cap(edge*.56+Math.max(buyShare,sellShare)*.20+support*7-opposition*5,0,88));
  const side:Side=support>=minFamilies&&edge>=gate?winner:'WAIT';
  return {side,confidence,buyShare:Math.round(buyShare),sellShare:Math.round(sellShare),agreement:Math.round(Math.max(buyShare,sellShare)),uncertainty:Math.round(cap(100-confidence,0,100)),independentFamilies:support,familyOpposition:opposition,families};
}

function qualityGate(h:HorizonBrain,minConfidence:number,requireFlow=false){
  const flow=h.families?.FLOW;
  const flowConflict=Boolean(requireFlow&&h.side!=='WAIT'&&flow?.side&&flow.side!=='WAIT'&&flow.side!==h.side);
  const splitConflict=Number(h.familyOpposition||0)>=2&&Number(h.agreement||50)<68;
  if(h.side==='WAIT'||flowConflict||splitConflict||h.confidence<minConfidence){
    return {
      ...h,
      side:'WAIT' as Side,
      confidence:Math.min(h.confidence,flowConflict?34:splitConflict?38:minConfidence-1),
      uncertainty:Math.max(h.uncertainty,100-Math.min(h.confidence,minConfidence-1)),
      gateReason:flowConflict?'FLOW_CONFLICT':splitConflict?'FAMILY_SPLIT':'LOW_CONFIDENCE'
    };
  }
  return {...h,gateReason:'PASSED'};
}

export function buildSpecializedHorizonBrains(args:any){
  const asset=String(args?.asset||'ASSET').toUpperCase();
  const learning=args?.horizonLearning||{};
  const tick=args?.tick||{},scalp=args?.scalp||{},motion=args?.motion||{},liq=args?.liquidity||{},acc=args?.accumulation||{},structure=args?.structure||{},graph=args?.stateGraph||{},expected=args?.expected||{},memory=args?.learning||{},decision=args?.decision||{},ml=args?.ml||{};
  const matrix=decision?.indicatorMatrix?.rows||{};
  const scalpLong=Number(scalp?.score?.long||0),scalpShort=Number(scalp?.score?.short||0);
  const scalpSide:Side=scalp?.action==='BUY'||scalp?.action==='SELL'?scalp.action:scalpLong-scalpShort>=7?'BUY':scalpShort-scalpLong>=7?'SELL':'WAIT';
  const scalpScore=Math.max(scalpLong,scalpShort,Number(scalp?.confidence||0));
  const tickScore=Math.max(Number(tick?.score||0),Number(tick?.confidence||0));
  const motionScore=Math.max(Number(motion?.score||0),Number(motion?.confidence||0));
  const liqScore=Math.max(Number(liq?.buy||0),Number(liq?.sell||0),Number(liq?.strength||0));
  const accScore=Math.max(Number(acc?.accumulationScore||0),Number(acc?.distributionScore||0),Number(acc?.breakoutReadiness||0));
  const graphScore=Number(graph?.nextSideProbability||0)*Math.min(1,Math.max(.45,Number(graph?.sequenceMatches||0)/12));
  const struct1=Number(structure?.m1?.nextScore||0),struct5=Number(structure?.m5?.nextScore||0);
  const exp2=expected?.twoMinute||{},exp5=expected?.fiveMinute||{};
  const exp2Side=s(exp2?.side),exp5Side=s(exp5?.side);
  const exp2Score=Math.max(Number(exp2?.confidence||0),Number(exp2?.calibration||0));
  const exp5Score=Math.max(Number(exp5?.confidence||0),Number(exp5?.calibration||0));
  const ml1=ml?.oneMinute||{},ml5=ml?.fiveMinute||{},neural=ml?.neuralCore||{};
  const ml1Ready=Boolean(ml?.ok&&ml1?.ready&&!ml?.shadow),ml5Ready=Boolean(ml?.ok&&ml5?.ready&&!ml?.shadow),neuralReady=Boolean(neural?.ready&&neural?.side!=='WAIT');
  const ml1Side=ml1Ready?s(ml1?.side!=='WAIT'?ml1?.side:ml1?.leanSide):'WAIT';
  const ml5Side=ml5Ready?s(ml5?.side!=='WAIT'?ml5?.side:ml5?.leanSide):'WAIT';
  const ml1Score=ml1Ready?Math.max(Number(ml1?.confidence||0),50+Number(ml1?.edge||0)*.35):0;
  const ml5Score=ml5Ready?Math.max(Number(ml5?.confidence||0),50+Number(ml5?.edge||0)*.35):0;
  const neuralSide=neuralReady?s(neural?.side):'WAIT';
  const neuralScore=neuralReady?Math.max(Number(neural?.confidence||0),50+Number(neural?.edge||0)*.35):0;
  const m1Side=s(matrix?.m1?.bias),m5Side=s(matrix?.m5?.bias);
  const m1Score=Number(matrix?.m1?.strength||0),m5Score=Number(matrix?.m5?.strength||0);
  const memory1=s(memory?.horizon1?.side||memory?.side),memory1Score=Math.max(Number(memory?.horizon1?.confidence||0),Number(memory?.confidence||0));
  const memory5=s(memory?.horizon5?.side),memory5Score=Number(memory?.horizon5?.confidence||0);
  const goldLiq=asset==='GOLD'?.62:1;

  let one=resolve({
    FLOW:[ev(tick?.side,tickScore,.42),ev(scalpSide,scalpScore,.34),ev(motion?.side,motionScore,.24)],
    LIQUIDITY:[ev(liq?.side,liqScore,.62*goldLiq),ev(acc?.side,accScore,.38)],
    STRUCTURE:[ev(structure?.m1?.nextSide,struct1,.58),ev(graph?.nextSide,graphScore,.24),ev(m1Side,m1Score,.18)],
    MODEL:[ev(neuralSide,neuralScore,neuralReady?.42:0),ev(ml1Side,ml1Score,ml1Ready?.38:0),ev(exp2Side,exp2Score,.20)],
    MEMORY:[ev(memory1,memory1Score,1)]
  },12,2);
  one=calibrateHorizonBrain('M1',one,learning);
  one=qualityGate(one,44,true);

  let three=resolve({
    FLOW:[ev(tick?.side,tickScore,.25),ev(scalpSide,scalpScore,.25),ev(motion?.side,motionScore,.50)],
    LIQUIDITY:[ev(liq?.side,liqScore,.42*goldLiq),ev(acc?.side,accScore,.58)],
    STRUCTURE:[ev(structure?.m1?.nextSide,struct1,.48),ev(graph?.nextSide,graphScore,.34),ev(m1Side,m1Score,.18)],
    MODEL:[ev(exp2Side,exp2Score,.50),ev(ml1Side,ml1Score,ml1Ready?.30:0),ev(neuralSide,neuralScore,neuralReady?.20:0)],
    MEMORY:[ev(memory1,memory1Score,1)]
  },14,2);
  three=calibrateHorizonBrain('M3',three,learning);
  three=qualityGate(three,46,false);

  let five=resolve({
    FLOW:[ev(motion?.side,motionScore,.65),ev(scalpSide,scalpScore,.20),ev(tick?.side,tickScore,.15)],
    LIQUIDITY:[ev(liq?.side,liqScore,.28*goldLiq),ev(acc?.side,accScore,.72)],
    STRUCTURE:[ev(structure?.m5?.nextSide,struct5,.48),ev(graph?.nextSide,graphScore,.30),ev(m5Side,m5Score,.22)],
    MODEL:[ev(ml5Side,ml5Score,ml5Ready?.44:0),ev(exp5Side,exp5Score,.56)],
    MEMORY:[ev(memory5,memory5Score,.70),ev(memory1,memory1Score,.30)]
  },15,2);
  five=calibrateHorizonBrain('M5',five,learning);
  five=qualityGate(five,50,false);

  return {oneMinute:one,threeMinute:three,fiveMinute:five};
}
