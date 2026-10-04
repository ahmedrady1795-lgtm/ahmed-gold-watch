type Side='BUY'|'SELL'|'WAIT';
type Regime='EXPANSION'|'COMPRESSION'|'REVERSAL'|'RANGE'|'TRANSITION';
type Evidence={name:string;side:Side;score:number;weight:number;reliability:number};
type Horizon={side:Side;confidence:number;buyShare:number;sellShare:number;agreement:number;uncertainty:number};

export type MovementIntelligence={
  ok:boolean;asset:string;regime:Regime;side:Side;leanSide:Side;confidence:number;
  agreement:number;uncertainty:number;conflict:boolean;conflictScore:number;
  evidence:Evidence[];horizons:{twoMinute:Horizon;fiveMinute:Horizon;fifteenMinute:Horizon};
  target15:{side:Side;price:number|null;low:number|null;high:number|null;confidence:number;moveAtr:number;source:string}|null;
  reasons:string[];
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
function rel(learning:any,name:string){
  const r=learning?.componentReliability?.[name];if(!r)return 1;
  const n=Number(r.samples1||0)+Number(r.samples5||0);if(n<6)return 1;
  const v=Number(r.h1||50)*.4+Number(r.h5||50)*.6;
  return cap(.76+(v-40)/100,.72,1.24);
}
function scoreExpected(x:any){
  const sample=Math.min(1,Number(x?.samples||0)/18),dec=Number(x?.decisiveRate||0)/100,cal=Number(x?.calibration||50)/100,conf=Number(x?.confidence||0)/100;
  return cap((conf*.42+dec*.30+cal*.18+sample*.10)*100,0,92);
}
function weights(r:Regime,asset:string){
  const btc=asset==='BTC';
  if(r==='EXPANSION')return {expected:.22,tick:.20,motion:.14,liquidity:btc?.13:0,structure:.10,stateGraph:.07,accumulation:.05,behavior:.04,learning:.05};
  if(r==='COMPRESSION')return {expected:.19,tick:.12,motion:.07,liquidity:btc?.13:0,structure:.12,stateGraph:.13,accumulation:.15,behavior:.04,learning:.05};
  if(r==='REVERSAL')return {expected:.20,tick:.12,motion:.08,liquidity:btc?.11:0,structure:.12,stateGraph:.14,accumulation:.08,behavior:.09,learning:.06};
  if(r==='RANGE')return {expected:.22,tick:.09,motion:.05,liquidity:btc?.09:0,structure:.12,stateGraph:.15,accumulation:.10,behavior:.10,learning:.08};
  return {expected:.23,tick:.13,motion:.09,liquidity:btc?.10:0,structure:.11,stateGraph:.12,accumulation:.08,behavior:.06,learning:.08};
}
function resolve(ev:Evidence[]):Horizon{
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
  const confidence=cap((edge*.72+agreement*.18+usable.length*1.6)*coverage,0,88);
  const out:Side=edge>=10?(buy>sell?'BUY':'SELL'):'WAIT';
  return {side:out,confidence:Math.round(confidence),buyShare:Math.round(buyShare),sellShare:Math.round(sellShare),agreement:Math.round(agreement),uncertainty:Math.round(100-confidence)};
}
function ev(name:string,s:any,score:number,weight:number,reliability=1):Evidence{return {name,side:side(s),score:cap(Number(score||0),0,92),weight,reliability:cap(reliability,.55,1.35)};}

export function buildMovementIntelligence(asset:string,args:any):MovementIntelligence{
  const expected=args?.expected||{},g=args?.stateGraph||{},liq=args?.liquidity||{},motion=args?.motion||{},structure=args?.structure||{},acc=args?.accumulation||{},behavior=args?.behavior||{},learning=args?.learning||{},tick=args?.tick||{},decision=args?.decision||{};
  const policy=args?.evolution?.active||null,ew=(name:string)=>cap(Number(policy?.weights?.[name]||1),.5,1.35);
  const regime=regimeOf(g,acc),baseW=weights(regime,asset),w={...baseW,expected:baseW.expected*ew('learning'),tick:baseW.tick*ew('wave'),motion:baseW.motion*ew('motion'),liquidity:baseW.liquidity*ew('liquidity'),structure:baseW.structure*ew('structure'),stateGraph:baseW.stateGraph*ew('stateGraph'),accumulation:baseW.accumulation*ew('accumulation'),behavior:baseW.behavior*ew('behavior'),learning:baseW.learning*ew('learning')},m=decision?.indicatorMatrix?.rows||{};
  const expected2=expected?.twoMinute||{},expected5=expected?.fiveMinute||{},expected15=expected?.fifteenMinute||{};
  const liqScore=Math.max(Number(liq?.buy||0),Number(liq?.sell||0),Number(liq?.strength||0));
  const tickScore=Math.max(Number(tick?.score||0),Number(tick?.confidence||0));
  const accScore=Math.max(Number(acc?.accumulationScore||0),Number(acc?.distributionScore||0),Number(acc?.breakoutReadiness||0));
  const stateScore=Number(g?.nextSideProbability||0)*Math.min(1,Math.max(.45,Number(g?.sequenceMatches||0)/12));
  const struct1=Number(structure?.m1?.nextScore||0),struct5=Number(structure?.m5?.nextScore||0);
  const learnScore=Number(learning?.confidence||0)*Math.max(.65,Number(learning?.selfCalibration?.reliability||50)/60);

  const immediate:Evidence[]=[
    ev('firstPassage',expected2?.side,scoreExpected(expected2),w.expected,Math.max(.72,Number(expected2?.calibration||50)/55)),
    ev('serverTick',tick?.side,tickScore,w.tick,tick?.stage==='IGNITION'?1.18:tick?.stage==='WAVE_FORMING'?1.10:1),
    ev('motion',motion?.side,motion?.score,w.motion,rel(learning,'motion')),
    ev('liquidity',liq?.side,liqScore,w.liquidity,rel(learning,'liquidity')),
    ev('structureM1',structure?.m1?.nextSide,struct1,w.structure,rel(learning,'structure')),
    ev('stateGraph',g?.nextSide,stateScore,w.stateGraph,rel(learning,'stateGraph')),
    ev('accumulation',acc?.side,accScore,w.accumulation,rel(learning,'accumulation')),
    ev('behavior',behavior?.side,behavior?.score,w.behavior,rel(learning,'behavior')),
    ev('learning',learning?.side,learnScore,w.learning,Math.max(.72,Number(learning?.selfCalibration?.reliability||50)/55))
  ];
  const two=resolve(immediate);

  const five=resolve([
    ev('firstPassage5',expected5?.side,scoreExpected(expected5),.28,Math.max(.72,Number(expected5?.calibration||50)/55)),
    ev('structureM5',structure?.m5?.nextSide,struct5,.16,rel(learning,'structure')),
    ev('stateGraph',g?.nextSide,stateScore,.16,rel(learning,'stateGraph')),
    ev('accumulation',acc?.side,accScore,.13,rel(learning,'accumulation')),
    ev('behavior',behavior?.side,behavior?.score,.10,rel(learning,'behavior')),
    ev('learning5',learning?.horizon5?.side,learning?.horizon5?.confidence,.10,Math.max(.72,Number(learning?.selfCalibration?.reliability||50)/55)),
    ev('m5',m?.m5?.bias,m?.m5?.strength,.07,rel(learning,'m5'))
  ]);

  const fifteen=resolve([
    ev('firstPassage15',expected15?.side,scoreExpected(expected15),.34,Math.max(.72,Number(expected15?.calibration||50)/55)),
    ev('m15',m?.m15?.bias,m?.m15?.strength,.17,1),
    ev('stateGraph',g?.nextSide,stateScore,.15,rel(learning,'stateGraph')),
    ev('structureM5',structure?.m5?.nextSide,struct5,.11,rel(learning,'structure')),
    ev('behavior',behavior?.side,behavior?.score,.10,rel(learning,'behavior')),
    ev('accumulation',acc?.side,accScore,.07,rel(learning,'accumulation')),
    ev('learning5',learning?.horizon5?.side,learning?.horizon5?.confidence,.06,Math.max(.72,Number(learning?.selfCalibration?.reliability||50)/55))
  ]);

  const directional=immediate.filter(e=>e.side!=='WAIT'&&e.score>=25);
  const buys=directional.filter(e=>e.side==='BUY').length,sells=directional.filter(e=>e.side==='SELL').length;
  const conflictScore=directional.length?Math.round(Math.min(buys,sells)/directional.length*200):0;
  const conflict=conflictScore>=34||two.uncertainty>=62;
  const leanSide:Side=two.buyShare>two.sellShare?'BUY':two.sellShare>two.buyShare?'SELL':'WAIT';
  const finalSide:Side=conflict&&two.confidence<46?'WAIT':two.side;

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
    'Immediate '+(finalSide==='WAIT'?('uncertain · lean '+leanSide):finalSide)+' · confidence '+two.confidence,
    'Agreement '+two.agreement+'% · conflict '+conflictScore+'%',
    '5m '+five.side+' · '+five.confidence,
    '15m '+fifteen.side+' · '+fifteen.confidence
  ];
  if(tick?.stage==='IGNITION'||tick?.stage==='WAVE_FORMING')reasons.push('Server tick '+tick.stage+' '+tick.side);
  if(conflict)reasons.push('Model disagreement detected; confidence reduced');

  return {ok:true,asset,regime,side:finalSide,leanSide,confidence:two.confidence,agreement:two.agreement,uncertainty:two.uncertainty,conflict,conflictScore,evidence:immediate,horizons:{twoMinute:two,fiveMinute:five,fifteenMinute:fifteen},target15,reasons};
}
