import {calibrateHorizonBrain} from './horizon-brain-learning';
import {buildSpecializedHorizonBrains} from './horizon-brains';
type Side='BUY'|'SELL'|'WAIT';
type Regime='EXPANSION'|'COMPRESSION'|'REVERSAL'|'RANGE'|'TRANSITION';
type Evidence={name:string;side:Side;score:number;weight:number;reliability:number};
type Horizon={side:Side;confidence:number;buyShare:number;sellShare:number;agreement:number;uncertainty:number;independentFamilies?:number;familyOpposition?:number;familyBreakdown?:Record<string,{side:Side;score:number}>;learning?:any};

export type MovementIntelligence={
  ok:boolean;asset:string;regime:Regime;side:Side;leanSide:Side;confidence:number;
  agreement:number;uncertainty:number;conflict:boolean;conflictScore:number;
  evidence:Evidence[];horizons:{oneMinute:Horizon;threeMinute:Horizon;twoMinute:Horizon;fiveMinute:Horizon;fifteenMinute:Horizon};
  horizonQuality?:{
    fiveMinute:{independentSupport:number;independentOpposition:number};
    fifteenMinute:{independentSupport:number;independentOpposition:number};
    changePoint:boolean;changePointScore:number;
  };
  target15:{side:Side;price:number|null;low:number|null;high:number|null;confidence:number;moveAtr:number;source:string}|null;
  reasons:string[];
  marketLead?:any;
};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const side=(x:any):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
function regimeOf(g:any,a:any):Regime{
  const s=String(g?.current||'');
  if(/BREAKOUT|IMPULSE/.test(s))return 'EXPANSION';
  if(/ACCUMULATION|DISTRIBUTION|COMPRESSION/.test(s)||/ACCUMULATING|DISTRIBUTING|MARKUP_READY|MARKDOWN_READY/.test(String(a?.phase||'')))return 'COMPRESSION';
  if(/EXHAUSTION|PULLBACK/.test(s))return 'REVERSAL';
  if(/RANGE/.test(s))return 'RANGE';
  return 'TRANSITION';
}
function relH(learning:any,name:string,horizon:'m2'|'m5'|'m15'){
  const r=learning?.componentReliability?.[name];if(!r)return 1;
  const n1=Number(r.samples1||0),n5=Number(r.samples5||0);
  const raw=horizon==='m2'
    ?Number(r.h1||50)
    :horizon==='m5'
      ?Number(r.h5||50)
      :Number(r.h5||50)*.86+50*.14;
  const n=horizon==='m2'?n1:n5;
  if(n<8)return .96;
  const sample=Math.min(1,n/(horizon==='m2'?80:110));
  const shrunk=50+(raw-50)*sample;
  return cap(.62+(shrunk-30)/50*.68,.62,1.28);
}
function learningCal(learning:any,horizon:'m2'|'m5'|'m15'){
  const s=learning?.selfCalibration||{};
  return horizon==='m2'?Number(s.h1||50):horizon==='m5'?Number(s.h5||50):Number(s.h5||50)*.82+50*.18;
}
function calibrateHorizon(h:Horizon,expected:any,learning:any,horizon:'m2'|'m5'|'m15'){
  if(h.side==='WAIT')return h;
  const samples=Number(expected?.samples||0),sample=Math.min(1,samples/30);
  const expectedCal=cap(Number(expected?.calibration||50),30,78);
  const learnedCal=cap(learningCal(learning,horizon),30,78);
  const historical=(expectedCal*.68+learnedCal*.32)*sample+50*(1-sample);
  let confidence=h.confidence*.55+historical*.45;
  if(expected?.side&&expected.side!=='WAIT'&&expected.side!==h.side)confidence-=9;
  if(h.agreement<65)confidence-=6;
  if(Number(expected?.decisiveRate||0)<50)confidence-=5;
  if(historical<45&&confidence>64)confidence=64;
  confidence=Math.round(cap(confidence,0,86));
  return {...h,confidence,uncertainty:Math.round(cap(100-confidence,0,100))};
}
function scoreExpected(x:any){
  const sample=Math.min(1,Number(x?.samples||0)/18),dec=Number(x?.decisiveRate||0)/100,cal=Number(x?.calibration||50)/100,conf=Number(x?.confidence||0)/100;
  return cap((conf*.42+dec*.30+cal*.18+sample*.10)*100,0,92);
}
function weights(r:Regime,asset:string){
  const btc=asset==='BTC';
  // v11: live evidence leads short-horizon decisions; slower memory calibrates instead of dominating.
  if(r==='EXPANSION')return {expected:.16,tick:.22,scalp:.17,motion:.14,liquidity:btc?.12:0,structure:.08,stateGraph:.05,accumulation:.03,behavior:.02,learning:.03};
  if(r==='COMPRESSION')return {expected:.16,tick:.16,scalp:.13,motion:.09,liquidity:btc?.12:0,structure:.10,stateGraph:.10,accumulation:.12,behavior:.04,learning:.04};
  if(r==='REVERSAL')return {expected:.15,tick:.16,scalp:.18,motion:.11,liquidity:btc?.10:0,structure:.11,stateGraph:.10,accumulation:.06,behavior:.07,learning:.04};
  if(r==='RANGE')return {expected:.15,tick:.13,scalp:.19,motion:.07,liquidity:btc?.08:0,structure:.11,stateGraph:.11,accumulation:.07,behavior:.06,learning:.03};
  return {expected:.18,tick:.16,scalp:.15,motion:.10,liquidity:btc?.09:0,structure:.10,stateGraph:.09,accumulation:.06,behavior:.04,learning:.03};
}
function resolve(ev:Evidence[],gate=10,softDirectional=false):Horizon{
  const usable=ev.filter(e=>e.side!=='WAIT'&&e.score>0&&e.weight>0);
  if(!usable.length)return {side:'WAIT',confidence:0,buyShare:50,sellShare:50,agreement:0,uncertainty:100};
  let buy=0,sell=0,w=0;
  for(const e of usable){
    const v=e.score*e.weight*e.reliability;
    if(e.side==='BUY')buy+=v;else sell+=v;w+=e.weight*e.reliability;
  }
  const total=buy+sell;if(total<=0)return {side:'WAIT',confidence:0,buyShare:50,sellShare:50,agreement:0,uncertainty:100};
  const buyShare=buy/total*100,sellShare=100-buyShare,agreement=Math.max(buyShare,sellShare),edge=Math.abs(buyShare-sellShare);
  const coverage=cap(w/Math.max(.55,usable.reduce((s,e)=>s+e.weight,0)),.55,1);
  const hard=edge>=gate;
  const softFloor=Math.max(3.5,gate*.72);
  const soft=softDirectional&&edge>=softFloor&&agreement>=53&&usable.length>=3;
  const confidence=cap((edge*.72+agreement*.18+usable.length*1.6)*coverage*(soft&&!hard?.78:1),0,88);
  const out:Side=(hard||soft)?(buy>sell?'BUY':'SELL'):'WAIT';
  return {side:out,confidence:Math.round(confidence),buyShare:Math.round(buyShare),sellShare:Math.round(sellShare),agreement:Math.round(agreement),uncertainty:Math.round(100-confidence)};
}
function softExpectedSide(x:any):Side{
  const direct=side(x?.side);if(direct!=='WAIT')return direct;
  const samples=Number(x?.samples||0),cal=Number(x?.calibration||50),dec=Number(x?.decisiveRate||0);
  if(samples<8||cal<54||dec<55)return 'WAIT';
  const mean=Number(x?.meanCloseAtr||0),exc=Number(x?.expectedUpAtr||0)-Number(x?.expectedDownAtr||0);
  const signed=mean*.62+exc*.38;
  return Math.abs(signed)>=.12?(signed>0?'BUY':'SELL'):'WAIT';
}
function ev(name:string,s:any,score:number,weight:number,reliability=1):Evidence{return {name,side:side(s),score:cap(Number(score||0),0,92),weight,reliability:cap(reliability,.55,1.35)};}
function familyVote(rows:Evidence[]){
  const usable=rows.filter(x=>x.side!=='WAIT'&&x.score>=18&&x.weight>0);
  let buy=0,sell=0;
  for(const x of usable){
    const v=x.score*x.weight*x.reliability;
    if(x.side==='BUY')buy+=v;else sell+=v;
  }
  const total=buy+sell;
  if(!total)return {side:'WAIT' as Side,score:0};
  const edge=Math.abs(buy-sell)/total*100;
  const winner:Side=buy>sell?'BUY':'SELL';
  return {side:(edge>=10?winner:'WAIT') as Side,score:Math.round(cap(Math.max(buy,sell)/Math.max(1,usable.length),0,92))};
}
function resolveFamilies(groups:Record<string,Evidence[]>,gate=12,minFamilies=2):Horizon{
  const breakdown:Record<string,{side:Side;score:number}>={};
  for(const [name,rows] of Object.entries(groups))breakdown[name]=familyVote(rows);
  const active=Object.values(breakdown).filter(x=>x.side!=='WAIT'&&x.score>=18);
  if(!active.length)return {side:'WAIT',confidence:0,buyShare:50,sellShare:50,agreement:0,uncertainty:100,independentFamilies:0,familyOpposition:0,familyBreakdown:breakdown};
  let buy=0,sell=0;
  for(const x of active){if(x.side==='BUY')buy+=x.score;else sell+=x.score;}
  const total=buy+sell,buyShare=total?buy/total*100:50,sellShare=100-buyShare,edge=Math.abs(buyShare-sellShare);
  const winner:Side=buy>sell?'BUY':'SELL';
  const support=active.filter(x=>x.side===winner).length,opposition=active.filter(x=>x.side!==winner).length;
  const confidence=Math.round(cap(edge*.58+Math.max(buyShare,sellShare)*.18+support*7-opposition*5,0,88));
  const out:Side=support>=minFamilies&&edge>=gate?winner:'WAIT';
  return {side:out,confidence,buyShare:Math.round(buyShare),sellShare:Math.round(sellShare),agreement:Math.round(Math.max(buyShare,sellShare)),uncertainty:Math.round(cap(100-confidence,0,100)),independentFamilies:support,familyOpposition:opposition,familyBreakdown:breakdown};
}

export function buildMovementIntelligence(asset:string,args:any):MovementIntelligence{
  const expected=args?.expected||{},g=args?.stateGraph||{},liq=args?.liquidity||{},motion=args?.motion||{},structure=args?.structure||{},acc=args?.accumulation||{},behavior=args?.behavior||{},learning=args?.learning||{},tick=args?.tick||{},scalp=args?.scalp||{},decision=args?.decision||{},news=args?.news||{},ml=args?.ml||{},marketLead=args?.marketLead||{};
  const policy=args?.evolution?.active||null,ew=(name:string)=>cap(Number(policy?.weights?.[name]||1),.5,1.35);
  const regime=regimeOf(g,acc),baseW=weights(regime,asset),w={...baseW,expected:baseW.expected*ew('learning'),tick:baseW.tick*ew('wave'),scalp:baseW.scalp*ew('scalp'),motion:baseW.motion*ew('motion'),liquidity:baseW.liquidity*ew('liquidity'),structure:baseW.structure*ew('structure'),stateGraph:baseW.stateGraph*ew('stateGraph'),accumulation:baseW.accumulation*ew('accumulation'),behavior:baseW.behavior*ew('behavior'),learning:baseW.learning*ew('learning')},m=decision?.indicatorMatrix?.rows||{};
  const expected2=expected?.twoMinute||{},expected5=expected?.fiveMinute||{},expected15=expected?.fifteenMinute||{};
  const rangeMode=regime==='RANGE'||regime==='COMPRESSION';
  const expSide2=rangeMode?softExpectedSide(expected2):side(expected2?.side),expSide5=rangeMode?softExpectedSide(expected5):side(expected5?.side),expSide15=rangeMode?softExpectedSide(expected15):side(expected15?.side);
  const liqScore=Math.max(Number(liq?.buy||0),Number(liq?.sell||0),Number(liq?.strength||0));
  const tickScore=Math.max(Number(tick?.score||0),Number(tick?.confidence||0));
  const accScore=Math.max(Number(acc?.accumulationScore||0),Number(acc?.distributionScore||0),Number(acc?.breakoutReadiness||0));
  const stateScore=Number(g?.nextSideProbability||0)*Math.min(1,Math.max(.45,Number(g?.sequenceMatches||0)/12));
  const struct1=Number(structure?.m1?.nextScore||0),struct5=Number(structure?.m5?.nextScore||0);
  const learnScore=Number(learning?.confidence||0)*Math.max(.65,Number(learning?.selfCalibration?.reliability||50)/60);
  const newsScore=Number(news?.confidence||0),newsWeight=Math.max(0,Math.min(.18,Number(news?.weight||0)));
  const scalpLong=Number(scalp?.score?.long||0),scalpShort=Number(scalp?.score?.short||0),scalpGap=Math.abs(scalpLong-scalpShort);
  const scalpSide:Side=scalp?.action==='BUY'||scalp?.action==='SELL'?scalp.action:scalpLong-scalpShort>=5?'BUY':scalpShort-scalpLong>=5?'SELL':'WAIT';
  const scalpScore=Math.max(scalpLong,scalpShort,Number(scalp?.confidence||0));
  const leadSide:Side=side(marketLead?.side);
  const leadStage=String(marketLead?.stage||'OBSERVE');
  const leadArmed=Boolean(marketLead?.available&&marketLead?.armed&&leadSide!=='WAIT'&&Number(marketLead?.confidence||0)>=60);
  const leadBuilding=Boolean(marketLead?.available&&leadStage==='BUILDING'&&leadSide!=='WAIT'&&Number(marketLead?.confidence||0)>=48);
  const leadScore=Math.max(Number(marketLead?.score||0),Number(marketLead?.confidence||0));
  const ml1=ml?.oneMinute||{},ml5=ml?.fiveMinute||{},neural=ml?.neuralCore||{},micro=(neural?.ready?neural:(ml?.microstructure||{}));
  const ml1Ready=Boolean(ml?.ok&&ml1?.ready&&!ml?.shadow),ml5Ready=Boolean(ml?.ok&&ml5?.ready&&!ml?.shadow);
  const microReady=Boolean((neural?.ok||ml?.ok)&&micro?.ready&&micro?.side!=='WAIT');
  const microSide:Side=microReady?side(micro?.side):'WAIT';
  const microScore=microReady?Math.max(Number(micro?.confidence||0),50+Number(micro?.edge||0)*.4):0;
  const microAcc=Number(micro?.metrics?.holdout?.selectiveAccuracy||0)*100;
  const microRel=microReady?cap(.90+(microAcc-55)/16,.90,1.30):.82;
  const ml1Side:Side=ml1Ready?side(ml1?.side!=='WAIT'?ml1?.side:ml1?.leanSide):'WAIT';
  const ml5Side:Side=ml5Ready?side(ml5?.side!=='WAIT'?ml5?.side:ml5?.leanSide):'WAIT';
  const ml1Score=ml1Ready?Math.max(Number(ml1?.confidence||0),50+Number(ml1?.edge||0)*.35):0;
  const ml5Score=ml5Ready?Math.max(Number(ml5?.confidence||0),50+Number(ml5?.edge||0)*.35):0;
  const ml1Acc=Number(ml1?.metrics?.ensemble?.selectiveAccuracy||ml1?.metrics?.ensemble?.accuracy||0)*100;
  const ml5Acc=Number(ml5?.metrics?.ensemble?.selectiveAccuracy||ml5?.metrics?.ensemble?.accuracy||0)*100;
  const ml1Rel=ml1Ready?cap(.86+(ml1Acc-55)/18,.86,1.26):.82;
  const ml5Rel=ml5Ready?cap(.82+(ml5Acc-55)/20,.82,1.20):.82;
  const fastRows=[
    {side:side(tick?.side),score:Math.max(Number(tick?.score||0),Number(tick?.confidence||0)),weight:1.20},
    {side:scalpSide,score:scalpScore,weight:1.25},
    {side:side(motion?.side),score:Math.max(Number(motion?.score||0),Number(motion?.confidence||0)),weight:1.05},
    {side:side(liq?.side),score:liqScore,weight:asset==='BTC'?1.00:.35},
    {side:leadSide,score:leadScore,weight:leadArmed?1.55:leadBuilding?.82:0},
    {side:microSide,score:microScore,weight:microReady?1.55:0},
    {side:ml1Side,score:ml1Score,weight:ml1Ready?1.35:0}
  ].filter(x=>x.side!=='WAIT'&&x.score>=28);
  let fastBuy=0,fastSell=0,fastWeight=0;
  for(const row of fastRows){const v=row.score*row.weight;if(row.side==='BUY')fastBuy+=v;else fastSell+=v;fastWeight+=row.weight;}
  const fastTotal=fastBuy+fastSell,fastGap=fastTotal?Math.abs(fastBuy-fastSell)/fastTotal*100:0;
  const fastSide:Side=fastRows.length>=2&&fastGap>=18?(fastBuy>fastSell?'BUY':'SELL'):'WAIT';
  const fastConfidence=Math.round(cap((fastGap*.58+Math.min(32,fastRows.length*8)+Math.max(fastBuy,fastSell)/Math.max(1,fastWeight)*.22),0,90));
  const fastStrong=fastSide!=='WAIT'&&fastRows.filter(x=>x.side===fastSide).length>=2&&fastConfidence>=48;

  const immediate:Evidence[]=[
    ev('firstPassage',expSide2,scoreExpected(expected2)*(rangeMode&&side(expected2?.side)==='WAIT'?.76:1),w.expected,Math.max(.72,Number(expected2?.calibration||50)/55)),
    ev('serverTick',tick?.side,tickScore,w.tick,tick?.stage==='IGNITION'?1.24:tick?.stage==='WAVE_FORMING'?1.14:1),
    ev('scalpM1',scalpSide,scalpScore,w.scalp,scalp?.state==='setup'?1.18:scalp?.state==='watch'?1.06:1),
    ev('neuralL2',microSide,microScore,microReady?.34:0,microRel),
    ev('mlEnsemble1m',ml1Side,ml1Score,ml1Ready?.30:0,ml1Rel),
    ev('motion',motion?.side,motion?.score,w.motion,relH(learning,'motion','m2')),
    ev('liquidity',liq?.side,liqScore,w.liquidity,relH(learning,'liquidity','m2')),
    ev('marketLead',leadSide,leadScore,leadArmed?.30:leadBuilding?.13:0,leadArmed?1.22:1.0),
    ev('structureM1',structure?.m1?.nextSide,struct1,w.structure,relH(learning,'structure','m2')),
    ev('stateGraph',g?.nextSide,stateScore,w.stateGraph,relH(learning,'stateGraph','m2')),
    ev('accumulation',acc?.side,accScore,w.accumulation,relH(learning,'accumulation','m2')),
    ev('behavior',behavior?.side,behavior?.score,w.behavior,relH(learning,'behavior','m2')),
    ev('learning',learning?.side,learnScore,w.learning,Math.max(.72,Number(learning?.selfCalibration?.reliability||50)/55)),
    ev('macroNews',news?.side,newsScore,newsWeight,news?.phase==='RELEASED'?1.18:1)
  ];
  let two=resolve(immediate,rangeMode?3.5:9,rangeMode);
  two=calibrateHorizon(two,expected2,learning,'m2');
  // Fast-stack override: when multiple live engines agree, preserve the live move even if slower memories lag.
  if(fastStrong&&(two.side==='WAIT'||(two.side!==fastSide&&two.confidence<58))){
    const buyShare=fastSide==='BUY'?Math.max(54,50+fastGap/2):Math.max(20,50-fastGap/2);
    const resolvedBuy=Math.round(cap(buyShare,0,100));
    two={...two,side:fastSide,confidence:Math.round(cap(two.confidence*.35+fastConfidence*.65,28,86)),buyShare:resolvedBuy,sellShare:100-resolvedBuy,agreement:Math.round(Math.max(resolvedBuy,100-resolvedBuy)),uncertainty:Math.round(cap(100-(two.confidence*.35+fastConfidence*.65),0,100))};
  }

  let five=resolve([
    ev('mlEnsemble5m',ml5Side,ml5Score,ml5Ready?.28:0,ml5Rel),
    ev('firstPassage5',expSide5,scoreExpected(expected5)*(rangeMode&&side(expected5?.side)==='WAIT'?.78:1),.30,Math.max(.72,Number(expected5?.calibration||50)/55)),
    ev('structureM5',structure?.m5?.nextSide,struct5,.13,relH(learning,'structure','m5')),
    ev('stateGraph',g?.nextSide,stateScore,.17,relH(learning,'stateGraph','m5')),
    ev('accumulation',acc?.side,accScore,.10,relH(learning,'accumulation','m5')),
    ev('behavior',behavior?.side,behavior?.score,.12,relH(learning,'behavior','m5')),
    ev('learning5',learning?.horizon5?.side,learning?.horizon5?.confidence,.09,Math.max(.68,Number(learning?.selfCalibration?.h5||50)/55)),
    ev('m5',m?.m5?.bias,m?.m5?.strength,.09,relH(learning,'m5','m5')),
    ev('macroNews5',news?.side,newsScore,Math.min(.15,newsWeight),news?.phase==='RELEASED'?1.15:1)
  ],rangeMode?5:10,rangeMode);
  five=calibrateHorizon(five,expected5,learning,'m5');

  let fifteen=resolve([
    ev('firstPassage15',expSide15,scoreExpected(expected15)*(rangeMode&&side(expected15?.side)==='WAIT'?.80:1),.39,Math.max(.70,Number(expected15?.calibration||50)/55)),
    ev('m15',m?.m15?.bias,m?.m15?.strength,.20,1),
    ev('stateGraph',g?.nextSide,stateScore,.15,relH(learning,'stateGraph','m15')),
    ev('structureM5',structure?.m5?.nextSide,struct5,.06,relH(learning,'structure','m15')),
    ev('behavior',behavior?.side,behavior?.score,.08,relH(learning,'behavior','m15')),
    ev('accumulation',acc?.side,accScore,.05,relH(learning,'accumulation','m15')),
    ev('learning5',learning?.horizon5?.side,learning?.horizon5?.confidence,.04,Math.max(.66,Number(learning?.selfCalibration?.h5||50)/55)),
    ev('macroNews15',news?.side,newsScore,Math.min(.12,newsWeight),news?.phase==='RELEASED'?1.10:1)
  ],rangeMode?6:10,rangeMode);
  fifteen=calibrateHorizon(fifteen,expected15,learning,'m15');

  // Horizon quality guard: 5m/15m confidence needs independent confirmation.
  // This prevents a cluster of correlated trend features from manufacturing high confidence.
  const horizonSupport=(target:Side,rows:Side[])=>rows.filter(s=>s!=='WAIT'&&s===target).length;
  const horizonOpposition=(target:Side,rows:Side[])=>rows.filter(s=>s!=='WAIT'&&target!=='WAIT'&&s!==target).length;
  const graphSide5:Side=side(g?.nextSide);
  const structure5Side:Side=side(structure?.m5?.nextSide||structure?.followSide);
  const learning5Side:Side=side(learning?.horizon5?.side);
  const fiveRows:Side[]=[expSide5,structure5Side,graphSide5,learning5Side,side(m?.m5?.bias)];
  const fifteenRows:Side[]=[expSide15,side(m?.m15?.bias),graphSide5,structure5Side,side(behavior?.side),side(acc?.side)];
  const fiveIndependentSupport=horizonSupport(five.side,fiveRows);
  const fiveIndependentOpposition=horizonOpposition(five.side,fiveRows);
  const fifteenIndependentSupport=horizonSupport(fifteen.side,fifteenRows);
  const fifteenIndependentOpposition=horizonOpposition(fifteen.side,fifteenRows);
  const graphChangePoint=Boolean(g?.changePoint&&Number(g?.changePointScore||0)>=58);

  if(five.side!=='WAIT'){
    const cap5=fiveIndependentSupport>=3?82:fiveIndependentSupport===2?70:54;
    five.confidence=Math.min(five.confidence,cap5);
    if(fiveIndependentOpposition>=2)five.confidence=Math.max(0,five.confidence-10);
    if(graphChangePoint&&graphSide5!=='WAIT'&&graphSide5!==five.side)five.confidence=Math.max(0,five.confidence-9);
    five.uncertainty=Math.min(100,100-five.confidence);
  }
  if(fifteen.side!=='WAIT'){
    const cap15=fifteenIndependentSupport>=3?84:fifteenIndependentSupport===2?72:56;
    fifteen.confidence=Math.min(fifteen.confidence,cap15);
    if(fifteenIndependentOpposition>=2)fifteen.confidence=Math.max(0,fifteen.confidence-9);
    if(graphChangePoint&&graphSide5!=='WAIT'&&graphSide5!==fifteen.side)fifteen.confidence=Math.max(0,fifteen.confidence-8);
    fifteen.uncertainty=Math.min(100,100-fifteen.confidence);
  }

  if(news?.phase==='PRE_EVENT'&&Number(news?.risk||0)>=70){
    const penalty=Math.min(22,Math.round((Number(news.risk)-60)*.55));
    two.confidence=Math.max(0,two.confidence-penalty);two.uncertainty=Math.min(100,100-two.confidence);
    five.confidence=Math.max(0,five.confidence-Math.round(penalty*.75));five.uncertainty=Math.min(100,100-five.confidence);
    fifteen.confidence=Math.max(0,fifteen.confidence-Math.round(penalty*.45));fifteen.uncertainty=Math.min(100,100-fifteen.confidence);
  }

  const specialized=buildSpecializedHorizonBrains({
    asset,tick,scalp,motion,liquidity:liq,accumulation:acc,structure,stateGraph:g,
    expected,learning,decision,ml,horizonLearning:args?.horizonLearning||{}
  });
  let one={...specialized.oneMinute};
  let three={...specialized.threeMinute};
  two={...three};
  five={...specialized.fiveMinute};
  if(leadArmed){
    const applyLead=(h:any,waitCap:number,alignedBoost:number)=>{
      if(h.side==='WAIT'){
        const c=Math.round(cap(Number(h.confidence||0)*.35+Number(marketLead.confidence||0)*.65,38,waitCap));
        return {...h,side:leadSide,confidence:c,uncertainty:Math.max(0,100-c),gateReason:'MARKET_LEAD_ARMED'};
      }
      if(h.side===leadSide){
        const c=Math.round(cap(Number(h.confidence||0)+alignedBoost,0,86));
        return {...h,confidence:c,uncertainty:Math.max(0,100-c)};
      }
      const c=Math.max(0,Number(h.confidence||0)-10);
      return {...h,confidence:c,uncertainty:Math.min(100,100-c),gateReason:'MARKET_LEAD_OPPOSITION'};
    };
    one=applyLead(one,68,5);
    three=applyLead(three,62,4);
    two={...three};
    if(five.side===leadSide){
      const c=Math.min(78,Number(five.confidence||0)+3);
      five={...five,confidence:c,uncertainty:Math.max(0,100-c)};
    }else if(five.side!=='WAIT'){
      const c=Math.max(0,Number(five.confidence||0)-6);
      five={...five,confidence:c,uncertainty:Math.min(100,100-c)};
    }
  }
  if(news?.phase==='PRE_EVENT'&&Number(news?.risk||0)>=70){
    const p=Math.min(22,Math.round((Number(news.risk)-60)*.55));
    one.confidence=Math.max(0,one.confidence-p);one.uncertainty=Math.min(100,100-one.confidence);
    two.confidence=Math.max(0,two.confidence-Math.round(p*.85));two.uncertainty=Math.min(100,100-two.confidence);
    five.confidence=Math.max(0,five.confidence-Math.round(p*.70));five.uncertainty=Math.min(100,100-five.confidence);
  }

  const directional=immediate.filter(e=>e.side!=='WAIT'&&e.score>=25);
  const buys=directional.filter(e=>e.side==='BUY').length,sells=directional.filter(e=>e.side==='SELL').length;
  const conflictScore=directional.length?Math.round(Math.min(buys,sells)/directional.length*200):0;
  const conflict=(conflictScore>=34||two.uncertainty>=62)&&!(fastStrong&&two.side===fastSide&&fastConfidence>=58);
  const leanSide:Side=two.buyShare>two.sellShare?'BUY':two.sellShare>two.buyShare?'SELL':'WAIT';
  const softLeanUsable=Boolean(
    rangeMode&&two.side==='WAIT'&&leanSide!=='WAIT'&&
    two.agreement>=50.75&&two.confidence>=18
  );
  const finalSide:Side=two.side!=='WAIT'?two.side:softLeanUsable?leanSide:'WAIT';
  const directionalConfidence=Math.round(cap(
    finalSide==='WAIT'?two.confidence:
    two.side==='WAIT'?Math.min(40,two.confidence):
    conflict?two.confidence*(rangeMode?.82:.76):
    two.confidence,
    0,86
  ));

  const p=Number(args?.price),atr=Number(args?.atr),valid=Number.isFinite(p)&&p>0&&Number.isFinite(atr)&&atr>0;
  const closeAtr=Number(expected15?.meanCloseAtr||0),samples=Number(expected15?.samples||0);
  const behaviorAtr=Number(behavior?.expectedMoveAtr||0);
  const fdir=fifteen.side==='BUY'?1:fifteen.side==='SELL'?-1:0;
  const fallbackAtr=fdir*(.30+Math.min(1.15,fifteen.confidence/75));
  const memoryUsable=samples>=6&&Math.abs(closeAtr)>=.06;
  let moveAtr=memoryUsable?closeAtr*.62+behaviorAtr*.16+fallbackAtr*.22:behaviorAtr*.28+fallbackAtr*.72;
  if(fifteen.side!=='WAIT'&&Math.sign(moveAtr)!==fdir&&Math.abs(moveAtr)<.55)moveAtr=fallbackAtr*.72;
  moveAtr=cap(moveAtr,-2.6,2.6);
  const targetPrice=valid?p+atr*moveAtr:null;
  const rangeAtr=Math.max(.24,Math.min(1.15,(Number(expected15?.expectedUpAtr||0)+Number(expected15?.expectedDownAtr||0))*.18+(100-fifteen.confidence)/100*.48));
  const target15=targetPrice==null?null:{side:fifteen.side,price:Number(targetPrice.toFixed(2)),low:Number((targetPrice-atr*rangeAtr).toFixed(2)),high:Number((targetPrice+atr*rangeAtr).toFixed(2)),confidence:fifteen.confidence,moveAtr:Number(moveAtr.toFixed(3)),source:memoryUsable?'REGIME_MEMORY_BLEND':'REGIME_LIVE_BLEND'};

  const reasons=[
    'Regime '+regime,
    'M1 '+one.side+' · '+one.confidence+' · families '+Number(one.independentFamilies||0),
    'M3 '+three.side+' · '+three.confidence+' · families '+Number(three.independentFamilies||0),
    'Immediate '+(finalSide==='WAIT'?('uncertain · lean '+leanSide):finalSide)+' · confidence '+directionalConfidence,
    'Agreement '+two.agreement+'% · conflict '+conflictScore+'%',
    '5m '+five.side+' · '+five.confidence+' · families '+Number(five.independentFamilies||0),
    '15m '+fifteen.side+' · '+fifteen.confidence
  ];
  if(tick?.stage==='IGNITION'||tick?.stage==='WAVE_FORMING')reasons.push('Server tick '+tick.stage+' '+tick.side);
  if(news?.event)reasons.push('News '+String(news.phase||'')+' · '+String(news.event.name||'')+' · risk '+Number(news.risk||0)+' · '+String(news.side||'WAIT'));
  if(leadArmed)reasons.push('Market Lead AI ARMED '+leadSide+' · confidence '+Number(marketLead.confidence||0)+' · stability '+Number(marketLead.stability||0)+'%');
  else if(leadBuilding)reasons.push('Market Lead AI BUILDING '+leadSide+' · '+Number(marketLead.confidence||0));
  if(fastStrong)reasons.push('Live Stack '+fastSide+' · confidence '+fastConfidence+' · '+fastRows.filter(x=>x.side===fastSide).length+'/'+fastRows.length+' fast engines aligned');
  if(microReady)reasons.push((neural?.ready?'Neural Fusion':'Neural L2')+' '+microSide+' · holdout '+Math.round(microAcc)+'% · confidence '+Math.round(microScore));
  if(ml1Ready||ml5Ready)reasons.push('ML selective OOS '+(ml1Ready?('1m '+ml1Side+' '+Math.round(ml1Acc)+'%'):'1m shadow')+' · '+(ml5Ready?('5m '+ml5Side+' '+Math.round(ml5Acc)+'%'):'5m shadow'));
  if(rangeMode)reasons.push('Range/compression mode: fast price-action evidence leads; slower memory only calibrates confidence');
  if(conflict)reasons.push('Model disagreement detected; confidence reduced, direction preserved when a measurable edge exists');

  return {
    ok:true,asset,regime,side:finalSide,leanSide,confidence:directionalConfidence,agreement:two.agreement,uncertainty:two.uncertainty,conflict,conflictScore,
    evidence:immediate,
    marketLead:marketLead?.available?marketLead:null,
    horizons:{oneMinute:one,threeMinute:three,twoMinute:two,fiveMinute:five,fifteenMinute:fifteen},
    horizonQuality:{
      fiveMinute:{independentSupport:fiveIndependentSupport,independentOpposition:fiveIndependentOpposition},
      fifteenMinute:{independentSupport:fifteenIndependentSupport,independentOpposition:fifteenIndependentOpposition},
      changePoint:graphChangePoint,changePointScore:Number(g?.changePointScore||0)
    },
    target15,reasons
  };
}
