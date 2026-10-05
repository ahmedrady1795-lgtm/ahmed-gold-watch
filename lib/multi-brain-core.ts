type Side='BUY'|'SELL'|'WAIT';
type Regime='EXPANSION'|'COMPRESSION'|'REVERSAL'|'RANGE'|'TRANSITION';
type BrainName='MICRO'|'TREND'|'REVERSAL'|'RANGE';

type Row={name:string;side:Side;strength:number;weight:number;reliability:number};
type Brain={
  name:BrainName;side:Side;confidence:number;gap:number;buyShare:number;sellShare:number;
  aligned:number;evidence:Row[];
};
export type MultiBrainCore={
  ok:boolean;asset:string;regime:Regime;side:Side;confidence:number;gap:number;
  strong:boolean;decisive:boolean;dominantBrain:BrainName|null;
  fastAgreement:number;totalAgreement:number;brains:Record<BrainName,Brain>;
  selector:{buy:number;sell:number;buyShare:number;sellShare:number};
  learnedWeights:Record<BrainName,number>;
  learnedAccuracy:Record<BrainName,number>;
  calibration:{rawConfidence:number;calibratedConfidence:number;learnedReliability:number;supportSamples:number;cap:number;dominantAccuracy:number;qualityReady:boolean};
  reasons:string[];
};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const BRAIN_NAMES:BrainName[]=['MICRO','TREND','REVERSAL','RANGE'];
const s=(x:any):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
const regimeOf=(x:any):Regime=>{
  const r=String(x?.regime||'TRANSITION').toUpperCase();
  return r==='EXPANSION'||r==='COMPRESSION'||r==='REVERSAL'||r==='RANGE'?r:'TRANSITION';
};
function componentReliability(learning:any,name:string,horizon:'h1'|'h5'='h1'){
  const row=learning?.componentReliability?.[name];
  if(!row)return 1;
  const raw=Number(row?.[horizon]||50),samples=Number(row?.[horizon==='h1'?'samples1':'samples5']||0);
  const shrink=Math.min(1,samples/120);
  const calibrated=50+(raw-50)*shrink;
  return cap(.72+(calibrated-35)/45*.48,.72,1.22);
}
function expectedSide(x:any):Side{
  const direct=s(x?.side);if(direct!=='WAIT')return direct;
  const mean=Number(x?.meanCloseAtr||0),up=Number(x?.expectedUpAtr||0),down=Number(x?.expectedDownAtr||0);
  const signed=mean*.65+(up-down)*.35;
  return Math.abs(signed)>=.10?(signed>0?'BUY':'SELL'):'WAIT';
}
function expectedStrength(x:any){
  const conf=Number(x?.confidence||0),cal=Number(x?.calibration||50),dec=Number(x?.decisiveRate||0),samples=Math.min(1,Number(x?.samples||0)/24);
  return cap(conf*.42+cal*.24+dec*.24+samples*10,0,92);
}
function row(name:string,side:any,strength:any,weight:number,reliability=1):Row{
  return {name,side:s(side),strength:cap(Number(strength||0),0,100),weight:Math.max(0,weight),reliability:cap(reliability,.55,1.30)};
}
function brain(name:BrainName,rows:Row[],gate=12):Brain{
  const ev=rows.filter(x=>x.side!=='WAIT'&&x.weight>0&&x.strength>=10);
  let buy=0,sell=0,totalW=0;
  for(const x of ev){
    const quality=.35+(x.strength/100)*.65;
    const v=x.weight*x.reliability*quality;
    if(x.side==='BUY')buy+=v;else sell+=v;
    totalW+=x.weight*x.reliability;
  }
  const total=buy+sell;
  if(!total||!ev.length)return {name,side:'WAIT',confidence:0,gap:0,buyShare:50,sellShare:50,aligned:0,evidence:ev};
  const buyShare=buy/total*100,sellShare=100-buyShare,gap=Math.abs(buyShare-sellShare);
  const winner:Side=buy>sell?'BUY':'SELL';
  const aligned=ev.filter(x=>x.side===winner).length;
  const avgStrength=ev.reduce((a,x)=>a+x.strength,0)/ev.length;
  const coverage=cap(totalW/Math.max(2.4,rows.reduce((a,x)=>a+x.weight,0)),.55,1);
  const confidence=cap((gap*.58+Math.max(buyShare,sellShare)*.16+aligned*5.5+avgStrength*.16)*coverage,0,90);
  const side:Side=gap>=gate&&aligned>=2?winner:'WAIT';
  return {name,side,confidence:Math.round(confidence),gap:Math.round(gap),buyShare:Math.round(buyShare),sellShare:Math.round(sellShare),aligned,evidence:ev};
}
function regimeWeights(r:Regime):Record<BrainName,number>{
  if(r==='EXPANSION')return {MICRO:1.35,TREND:1.30,REVERSAL:.45,RANGE:.20};
  if(r==='REVERSAL')return {MICRO:1.15,TREND:.55,REVERSAL:1.55,RANGE:.45};
  if(r==='COMPRESSION')return {MICRO:1.10,TREND:.55,REVERSAL:1.12,RANGE:1.38};
  if(r==='RANGE')return {MICRO:1.00,TREND:.35,REVERSAL:1.12,RANGE:1.55};
  return {MICRO:1.05,TREND:1.00,REVERSAL:1.10,RANGE:.90};
}

export function buildMultiBrainCore(asset:string,args:any):MultiBrainCore{
  const d=args?.decision||{},scalp=args?.scalp||{},movement=args?.movement||{},graph=args?.stateGraph||{},tick=args?.tick||{},expected=args?.expected||{},learning=args?.learning||{},brainLearning=args?.brainLearning||{};
  const regime=regimeOf(movement);
  const motion=d?.motion||{},liq=d?.liquidity||{},hunter=d?.hunter||{},behavior=d?.behavior||{},m=d?.indicatorMatrix?.rows||{};
  const scalpLong=Number(scalp?.score?.long||0),scalpShort=Number(scalp?.score?.short||0);
  const scalpSide:Side=scalp?.action==='BUY'||scalp?.action==='SELL'?scalp.action:scalpLong-scalpShort>=6?'BUY':scalpShort-scalpLong>=6?'SELL':'WAIT';
  const scalpStrength=Math.max(scalpLong,scalpShort,Number(scalp?.confidence||0));
  const movementSide:Side=s(movement?.side!=='WAIT'?movement?.side:movement?.leanSide);
  const movementStrength=Number(movement?.confidence||0);
  const graphSide:Side=s(graph?.nextSide),graphStrength=Number(graph?.nextSideProbability||0);
  const tickSide:Side=s(tick?.side),tickStrength=Math.max(Number(tick?.score||0),Number(tick?.confidence||0));
  const motionSide:Side=s(motion?.side),motionStrength=Math.max(Number(motion?.score||0),Number(motion?.confidence||0));
  const liqSide:Side=s(liq?.side),liqStrength=Math.max(Number(liq?.buy||0),Number(liq?.sell||0),Number(liq?.quality||0)*.75);
  const hunterSide:Side=s(hunter?.side),hunterStrength=Number(hunter?.score||0);
  const hunterReady=hunterStrength>=Math.max(58,Number(hunter?.threshold||65)-3);
  const behaviorSide:Side=s(behavior?.side),behaviorStrength=Number(behavior?.score||0);
  const fusionSide:Side=s(d?.fusion?.side),fusionStrength=Math.abs(Number(d?.fusion?.buy||0)-Number(d?.fusion?.sell||0));
  const m1Side:Side=s(m?.m1?.bias),m1Strength=Number(m?.m1?.strength||0),m5Side:Side=s(m?.m5?.bias),m5Strength=Number(m?.m5?.strength||0);
  const e2=expected?.twoMinute||{},e5=expected?.fiveMinute||{},e15=expected?.fifteenMinute||{};
  const e2Side=expectedSide(e2),e5Side=expectedSide(e5),e15Side=expectedSide(e15);
  const learningSide:Side=s(learning?.side),learningStrength=Number(learning?.confidence||0)*Math.max(.65,Number(learning?.selfCalibration?.reliability||50)/60);

  const rel=(name:string,h:'h1'|'h5'='h1')=>componentReliability(learning,name,h);
  const assetLiq=asset==='BTC'?1:.35;

  const micro=brain('MICRO',[
    row('scalp',scalpSide,scalpStrength,1.55,rel('scalp')),
    row('tick',tickSide,tickStrength,1.45,1),
    row('motion',motionSide,motionStrength,1.25,rel('motion')),
    row('liquidity',liqSide,liqStrength,1.12*assetLiq,rel('liquidity')),
    row('movement',movementSide,movementStrength,1.05,1),
    row('m1',m1Side,m1Strength,.78,rel('m1')),
    row('expected2',e2Side,expectedStrength(e2),.66,1),
    row('graph',graphSide,graphStrength,.60,rel('stateGraph'))
  ],10);

  const trend=brain('TREND',[
    row('movement',movementSide,movementStrength,1.38,1),
    row('expected5',e5Side,expectedStrength(e5),1.18,1),
    row('expected15',e15Side,expectedStrength(e15),.92,1),
    row('graph',graphSide,graphStrength,1.05,rel('stateGraph','h5')),
    row('m5',m5Side,m5Strength,1.02,rel('m5','h5')),
    row('fusion',fusionSide,fusionStrength,.76,1),
    row('hunter',hunterReady?hunterSide:'WAIT',hunterStrength,.72,1),
    row('learning',learningSide,learningStrength,.52,rel('behavior','h5')),
    row('scalp',scalpSide,scalpStrength,.48,rel('scalp'))
  ],13);

  const reversalBoost=/REVERSAL|PULLBACK/i.test(String(hunter?.mode||''))&&hunterReady;
  const reversal=brain('REVERSAL',[
    row('motion',motionSide,motionStrength,1.42,rel('motion')),
    row('scalp',scalpSide,scalpStrength,1.36,rel('scalp')),
    row('tick',tickSide,tickStrength,1.28,1),
    row('graph',graphSide,graphStrength,1.14,rel('stateGraph')),
    row('liquidity',liqSide,liqStrength,1.02*assetLiq,rel('liquidity')),
    row('m1',m1Side,m1Strength,.92,rel('m1')),
    row('expected2',e2Side,expectedStrength(e2),.84,1),
    row('hunter',reversalBoost?hunterSide:'WAIT',hunterStrength,reversalBoost?1.05:.25,1),
    row('movement',movementSide,movementStrength,.78,1)
  ],11);

  const range=brain('RANGE',[
    row('scalp',scalpSide,scalpStrength,1.24,rel('scalp')),
    row('graph',graphSide,graphStrength,1.20,rel('stateGraph')),
    row('liquidity',liqSide,liqStrength,1.08*assetLiq,rel('liquidity')),
    row('expected2',e2Side,expectedStrength(e2),1.02,1),
    row('behavior',behaviorSide,behaviorStrength,.92,rel('behavior')),
    row('movement',movementSide,movementStrength,.82,1),
    row('motion',motionSide,motionStrength,.78,rel('motion')),
    row('m1',m1Side,m1Strength,.72,rel('m1')),
    row('hunter',reversalBoost?hunterSide:'WAIT',hunterStrength,.42,1)
  ],9);

  const brains:Record<BrainName,Brain>={MICRO:micro,TREND:trend,REVERSAL:reversal,RANGE:range};
  const rw=regimeWeights(regime);
  const learnedWeights={} as Record<BrainName,number>;
  const learnedAccuracy={} as Record<BrainName,number>;
  for(const name of BRAIN_NAMES){
    const learned=brainLearning?.regimes?.[regime]?.[name];
    const mult=cap(Number(learned?.multiplier||1),.58,1.42);
    const learnedAcc=Number(learned?.blendedAccuracy||50);
    const learnedSamples=Math.max(0,Number(learned?.samples||0));
    // History quality gate: a large amount of ~coin-flip evidence must not become
    // "strong" merely because several correlated internal brains agree.
    const historyFactor=learnedSamples<60?.78:learnedAcc>=58?1.08:learnedAcc>=55?1.00:learnedAcc>=53?.84:learnedAcc>=50?.62:.40;
    learnedWeights[name]=Number((mult*historyFactor).toFixed(3));
    learnedAccuracy[name]=learnedAcc;
    rw[name]*=mult*historyFactor;
  }
  let buy=0,sell=0;
  const contributions:{name:BrainName;side:Side;value:number}[]=[];
  for(const name of Object.keys(brains) as BrainName[]){
    const b=brains[name];if(b.side==='WAIT'||b.confidence<20)continue;
    const value=rw[name]*(.35+b.confidence/100*.65)*(1+Math.min(.18,b.gap/300));
    if(b.side==='BUY')buy+=value;else sell+=value;
    contributions.push({name,side:b.side,value});
  }
  const total=buy+sell;
  const buyShare=total?buy/total*100:50,sellShare=100-buyShare,gap=total?Math.abs(buy-sell)/total*100:0;
  const side:Side=total>=1.25&&gap>=13?(buy>sell?'BUY':'SELL'):'WAIT';
  const supporting=contributions.filter(x=>x.side===side);
  const dominant=supporting.sort((a,b)=>b.value-a.value)[0]?.name||null;

  const direct=[
    {side:scalpSide,fast:true},{side:movementSide,fast:true},{side:tickSide,fast:true},
    {side:motionSide,fast:true},{side:liqSide,fast:true},{side:graphSide,fast:false},
    {side:e2Side,fast:false},{side:e5Side,fast:false}
  ].filter(x=>x.side!=='WAIT');
  const fastAgreement=side==='WAIT'?0:direct.filter(x=>x.fast&&x.side===side).length;
  const totalAgreement=side==='WAIT'?0:direct.filter(x=>x.side===side).length;
  const avgBrain=supporting.length?supporting.reduce((a,x)=>a+brains[x.name].confidence,0)/supporting.length:0;
  const rawConfidence=Math.round(cap(gap*.48+avgBrain*.34+fastAgreement*4.5+totalAgreement*1.8,0,91));

  // Confidence Calibration v3:
  // internal agreement can create a large score, but it must not claim probability
  // far above the actually learned reliability of the brains supporting that side.
  let relNum=0,relDen=0,supportSamples=0;
  for(const x of supporting){
    const rowLearned=brainLearning?.regimes?.[regime]?.[x.name];
    const samples=Math.max(0,Number(rowLearned?.samples||0));
    const acc=cap(Number(rowLearned?.blendedAccuracy||learnedAccuracy[x.name]||50),20,85);
    const evidenceWeight=Math.max(.25,x.value)*(0.45+Math.min(1,samples/120)*.55);
    relNum+=acc*evidenceWeight;relDen+=evidenceWeight;supportSamples+=samples;
  }
  const learnedReliability=relDen?relNum/relDen:50;
  const maturity=Math.min(1,supportSamples/240);
  const shrunkReliability=50+(learnedReliability-50)*maturity;
  const agreementBonus=Math.min(6,Math.max(0,gap-20)*.06+Math.max(0,fastAgreement-2)*1.2);
  const reliabilityCap=cap(shrunkReliability+7+agreementBonus*.55,42,82);
  const calibratedBase=rawConfidence*.24+shrunkReliability*.76+agreementBonus*.55;
  const confidence=Math.round(cap(Math.min(calibratedBase,reliabilityCap),0,86));
  const dominantAccuracy=dominant?Number(learnedAccuracy[dominant]||50):50;
  const qualityReady=Boolean(supportSamples>=120&&shrunkReliability>=54&&dominantAccuracy>=52);
  const strong=Boolean(side!=='WAIT'&&qualityReady&&confidence>=58&&gap>=22&&(fastAgreement>=2||totalAgreement>=4));
  const decisive=Boolean(side!=='WAIT'&&qualityReady&&shrunkReliability>=57&&dominantAccuracy>=55&&confidence>=70&&gap>=34&&fastAgreement>=3&&supporting.length>=2);

  const reasons=[
    'Regime '+regime,
    'Meta '+(side==='WAIT'?'WAIT':side)+' · confidence '+confidence+' (raw '+rawConfidence+') · gap '+Math.round(gap),
    'Brains '+Object.values(brains).map(b=>b.name+':'+b.side+'/'+b.confidence).join(' · '),
    'Agreement fast '+fastAgreement+' · total '+totalAgreement
  ];
  if(dominant)reasons.push('Dominant brain '+dominant+' · learned '+learnedAccuracy[dominant]+'% · weight x'+learnedWeights[dominant].toFixed(2));
  reasons.push('Calibration v4 · learned reliability '+Math.round(shrunkReliability)+'% · dominant '+Math.round(dominantAccuracy)+'% · cap '+Math.round(reliabilityCap)+' · '+(qualityReady?'QUALIFIED':'SHADOW'));
  if(!qualityReady)reasons.push('Multi-Brain shadow: learned reliability is not strong enough to authorize a production trade');
  if(decisive)reasons.push('Decisive multi-brain alignment passed learned-reliability gate');

  return {
    ok:true,asset,regime,side,confidence,gap:Math.round(gap),strong,decisive,dominantBrain:dominant,
    fastAgreement,totalAgreement,brains,learnedWeights,learnedAccuracy,
    calibration:{rawConfidence,calibratedConfidence:confidence,learnedReliability:Number(shrunkReliability.toFixed(1)),supportSamples,cap:Number(reliabilityCap.toFixed(1)),dominantAccuracy:Number(dominantAccuracy.toFixed(1)),qualityReady},
    selector:{buy:Number(buy.toFixed(3)),sell:Number(sell.toFixed(3)),buyShare:Math.round(buyShare),sellShare:Math.round(sellShare)},
    reasons
  };
}
