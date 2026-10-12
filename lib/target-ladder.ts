type Side='BUY'|'SELL'|'WAIT';
type TargetKind='MODEL_15M'|'STRUCTURE'|'LIQUIDITY'|'ORDER_BOOK'|'H4_LEVEL'|'INTENT'|'PATH_ZONE'|'EXTENSION'|'PROJECTION';

export type TargetLevel={
  price:number;low:number;high:number;
  confidence:number;quality:number;consensus:number;rankScore:number;
  kind:TargetKind;source:string;sources:string[];
  distanceBps:number;distanceAtr:number|null;
  learningBonus:number;learningSamples:number;learningPosterior:number|null;
};
export type TargetLadder={
  side:Side;t1:TargetLevel|null;t2:TargetLevel|null;t3:TargetLevel|null;
  invalidation:number|null;quality:number;sourceCount:number;projected:boolean;
  mode:'STRUCTURAL'|'MIXED'|'PROJECTED';reason:string;
  learning:{enabled:boolean;t1Samples:number;t2Samples:number;t3Samples:number};
};

type Candidate={price:number;low:number;high:number;confidence:number;kind:TargetKind;source:string;weight:number};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const num=(v:any)=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const validSide=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';
const kindBonus:Record<TargetKind,number>={
  MODEL_15M:4,STRUCTURE:8,LIQUIDITY:9,ORDER_BOOK:10,H4_LEVEL:6,INTENT:3,PATH_ZONE:7,EXTENSION:0,PROJECTION:-8
};

function zone(v:any){
  if(v==null)return null;
  if(Number.isFinite(Number(v))){
    const p=Number(v);return {low:p,high:p,mid:p};
  }
  const z=v?.zone&&typeof v.zone==='object'?v.zone:v;
  const low=num(z?.low),high=num(z?.high),mid=num(z?.mid??z?.price);
  if(mid!=null)return {low:low??mid,high:high??mid,mid};
  if(low!=null&&high!=null)return {low,high,mid:(low+high)/2};
  return null;
}
function ahead(side:Side,price:number,target:number,minDistance:number){
  return side==='BUY'?target>=price+minDistance:side==='SELL'?target<=price-minDistance:false;
}
function outer(side:Side,z:{low:number;high:number;mid:number}){return side==='BUY'?z.high:z.low;}
function distanceFit(distAtr:number|null,stage:1|2|3){
  if(distAtr==null)return 0;
  const ideal=stage===1?.58:stage===2?1.15:1.85;
  const width=stage===1?.85:stage===2?1.25:1.70;
  return cap(12-Math.abs(distAtr-ideal)/width*12,-8,12);
}
function beyond(side:Side,a:number,b:number,min:number){
  return side==='BUY'?a>b+min:a<b-min;
}

export function buildTargetLadder(args:{
  asset:'GOLD'|'BTC';side:Side;price:number|null;atr?:number|null;
  hunt?:any;movement?:any;h4?:any;intent?:any;structure?:any;liquidity?:any;toolMesh?:any;learning?:any;
}):TargetLadder{
  const side=validSide(args.side),price=num(args.price),atr0=num(args.atr);
  const empty=(reason:string):TargetLadder=>({side:'WAIT',t1:null,t2:null,t3:null,invalidation:null,quality:0,sourceCount:0,projected:false,mode:'PROJECTED',reason,learning:{enabled:false,t1Samples:0,t2Samples:0,t3Samples:0}});
  if(side==='WAIT'||price==null||price<=0)return empty('لا يوجد اتجاه أمامي صالح لبناء أهداف');

  const atr=atr0!=null&&atr0>0?atr0:price*(args.asset==='GOLD'?.0012:.0032);
  const minBps=args.asset==='GOLD'?1.4:3.2;
  const minDistance=Math.max(price*minBps/10000,atr*.07);
  const maxDistance=atr*5.5;
  const candidates:Candidate[]=[];
  const stageLearning=(stage:1|2|3,kind:TargetKind)=>{
    const live=args.learning?.['t'+stage]||null;
    const stats=live?.bySource?.[kind]||null;
    const hits=Number(stats?.hits||0),fails=Number(stats?.fails||0),samples=hits+fails;
    const posterior=Number.isFinite(Number(stats?.posteriorAccuracy))?Number(stats.posteriorAccuracy):50;
    const maturity=Math.min(1,samples/24);
    let bonus=(posterior-50)*.24*maturity;
    const wf=live?.walkForwardBySource?.[kind]||null;
    if(Number(wf?.oos?.n||0)>=10){
      if(wf?.status==='PASS'&&Number(wf?.oos?.accuracy||0)>=58)bonus+=2.5;
      if(wf?.status==='WATCH')bonus-=2;
      if(wf?.drift?.status==='DEGRADING')bonus-=4;
    }
    if(samples>=8&&posterior<44)bonus-=4;
    if(samples>=12&&posterior>=60)bonus+=2;
    return {bonus:cap(bonus,-12,9),samples,posterior};
  };

  const add=(raw:any,source:string,confidence:number,kind:TargetKind,weight=1,sideHint?:any)=>{
    if(sideHint&&validSide(sideHint)!=='WAIT'&&validSide(sideHint)!==side)return;
    const z=zone(raw);if(!z)return;
    const p=z.mid;
    if(!ahead(side,price,p,minDistance)||Math.abs(p-price)>maxDistance)return;
    candidates.push({price:p,low:z.low,high:z.high,confidence:cap(confidence),kind,source,weight});
  };
  const addOuter=(raw:any,source:string,confidence:number,kind:TargetKind,weight=.82)=>{
    const z=zone(raw);if(!z)return;
    const p=outer(side,z);
    if(!ahead(side,price,p,minDistance)||Math.abs(p-price)>maxDistance)return;
    candidates.push({price:p,low:p,high:p,confidence:cap(confidence),kind,source,weight});
  };

  const hunt=args.hunt||{},movement=args.movement||{},path=hunt?.zoneForecast?.pathForecast||{},zf=hunt?.zoneForecast||{},structure=args.structure||{},liq=args.liquidity||{};
  const m15=movement?.target15||null,h15=hunt?.quickSignalTargets?.fifteenMinute||hunt?.fifteenMinuteTarget||null;

  add(m15?.price,'Movement 15m',Number(m15?.confidence||0),'MODEL_15M',1.16,m15?.side);
  if(m15?.low!=null&&m15?.high!=null)addOuter({low:m15.low,high:m15.high,mid:m15.price},'Movement 15m range',Number(m15?.confidence||0)-5,'EXTENSION',.84);
  add(h15?.price,'Hunt 15m',Number(h15?.confidence||0),'MODEL_15M',1.10,h15?.side);

  const pd=path?.priceDestination;
  if(pd&&(!pd.side||validSide(pd.side)===side)){
    add(pd?.zone||pd,'Path destination',Number(pd?.confidence||path?.confidence||0),'PATH_ZONE',1.18,pd?.side);
    addOuter(pd?.zone||pd,'Path destination edge',Number(pd?.confidence||path?.confidence||0)-4,'EXTENSION',.90);
  }
  add(path?.destination,'Path structural destination',Number(path?.confidence||0),'PATH_ZONE',1.10,path?.side);
  add(zf?.target,'Structural zone target',Number(zf?.confidence||hunt?.confidence||0),'STRUCTURE',1.10,zf?.side);

  const liqZone=side==='BUY'?(path?.upperLiquidity||zf?.resistance):(path?.lowerLiquidity||zf?.support);
  add(liqZone,side==='BUY'?'Upper liquidity':'Lower liquidity',Number(path?.liquidityConfidence||hunt?.quality||62),'LIQUIDITY',1.18);
  addOuter(liqZone,side==='BUY'?'Upper liquidity edge':'Lower liquidity edge',Number(path?.liquidityConfidence||hunt?.quality||58),'EXTENSION',.86);

  // Actual depth wall price is stronger than a generic liquidity ratio.
  const wallPrice=side==='BUY'?num(liq?.book?.askWallPrice):num(liq?.book?.bidWallPrice);
  const wallRatio=side==='BUY'?Number(liq?.book?.askWall||0):Number(liq?.book?.bidWall||0);
  const wallConfidence=cap(Number(liq?.quality||0)*.72+Math.min(22,Math.max(0,wallRatio-1)*11)+18,35,92);
  add(wallPrice,side==='BUY'?'Ask order-book wall':'Bid order-book wall',wallConfidence,'ORDER_BOOK',1.24);

  // Fresh completed swing/range levels become direct structural destinations.
  const s5=structure?.m5||{},s1=structure?.m1||{};
  const m5Swing=side==='BUY'?s5?.lastSwingHigh:s5?.lastSwingLow;
  const m5Range=side==='BUY'?s5?.rangeHigh:s5?.rangeLow;
  const m1Swing=side==='BUY'?s1?.lastSwingHigh:s1?.lastSwingLow;
  const m1Range=side==='BUY'?s1?.rangeHigh:s1?.rangeLow;
  add(m5Swing,'M5 last swing',Number(s5?.confidence||s5?.nextScore||60),'STRUCTURE',1.20);
  add(m5Range,'M5 range edge',Number(s5?.confidence||58),'STRUCTURE',1.12);
  add(m1Swing,'M1 last swing',Number(s1?.confidence||s1?.nextScore||50)-3,'STRUCTURE',.90);
  add(m1Range,'M1 range edge',Number(s1?.confidence||50)-5,'STRUCTURE',.82);

  const h4Level=side==='BUY'?args.h4?.resistance:args.h4?.support;
  add(h4Level,'H4 '+(side==='BUY'?'resistance':'support'),Number(args.h4?.confidence||58),'H4_LEVEL',.96,args.h4?.side==='WAIT'?null:args.h4?.side);
  add(args.intent?.targetPrice,'Market intent target',Number(args.intent?.confidence||0),'INTENT',.90,args.intent?.side);

  const thirty=hunt?.quickSignalTargets?.thirtyMinute||hunt?.thirtyMinuteTarget;
  add(thirty?.price,'30m extension',Number(thirty?.confidence||0)-6,'EXTENSION',.70,thirty?.side);

  const tolerance=Math.max(atr*.10,price*(args.asset==='GOLD'?1.8:4)/10000);
  candidates.sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price));
  const clusters:{items:Candidate[];center:number}[]=[];
  for(const c of candidates){
    const last=clusters.at(-1);
    if(last&&Math.abs(c.price-last.center)<=tolerance){
      last.items.push(c);
      const tw=last.items.reduce((s,x)=>s+x.weight,0);
      last.center=last.items.reduce((s,x)=>s+x.price*x.weight,0)/Math.max(.01,tw);
    }else clusters.push({items:[c],center:c.price});
  }

  const levels=clusters.map(cl=>{
    const items=cl.items,tw=items.reduce((s,x)=>s+x.weight,0);
    const p=items.reduce((s,x)=>s+x.price*x.weight,0)/Math.max(.01,tw);
    const unique=[...new Set(items.map(x=>x.source))];
    const avgConf=items.reduce((s,x)=>s+x.confidence*x.weight,0)/Math.max(.01,tw);
    const dist=Math.abs(p-price),distAtr=atr>0?dist/atr:null,distBps=dist/price*10000;
    const strongest=[...items].sort((a,b)=>(b.confidence*b.weight+kindBonus[b.kind])-(a.confidence*a.weight+kindBonus[a.kind]))[0];
    const consensus=Math.min(100,42+Math.max(0,unique.length-1)*17);
    const quality=cap(
      avgConf+
      Math.min(18,(unique.length-1)*6)+
      kindBonus[strongest.kind]-
      Math.max(0,(distAtr??0)-2.6)*3.5
    );
    return {
      price:p,low:Math.min(...items.map(x=>x.low),p),high:Math.max(...items.map(x=>x.high),p),
      confidence:cap(avgConf),quality,consensus,rankScore:0,
      kind:strongest.kind,source:strongest.source,sources:unique,
      distanceBps:distBps,distanceAtr:distAtr
    };
  }).filter(x=>x.quality>=36);

  const normalized=(x:any,stage:1|2|3):TargetLevel=>{
    const learn=stageLearning(stage,x.kind);
    return {
      ...x,
      price:Number(x.price.toFixed(2)),low:Number(x.low.toFixed(2)),high:Number(x.high.toFixed(2)),
      confidence:Math.round(cap(x.confidence+learn.bonus*.35)),quality:Math.round(cap(x.quality+learn.bonus*.45)),consensus:Math.round(x.consensus),
      rankScore:Number((x.quality+distanceFit(x.distanceAtr,stage)+Math.min(10,(x.sources.length-1)*4)+learn.bonus).toFixed(1)),
      distanceBps:Number(x.distanceBps.toFixed(2)),distanceAtr:x.distanceAtr==null?null:Number(x.distanceAtr.toFixed(2)),
      learningBonus:Number(learn.bonus.toFixed(1)),learningSamples:learn.samples,learningPosterior:learn.samples?Number(learn.posterior.toFixed(1)):null
    };
  };

  const choose=(pool:any[],stage:1|2|3,after:number|null)=>{
    const minGap=stage===1?0:stage===2?atr*.14:atr*.18;
    const usable=pool.filter(x=>after==null||beyond(side,x.price,after,minGap));
    if(!usable.length)return null;
    return normalized([...usable].sort((a,b)=>{
      const al=stageLearning(stage,a.kind).bonus,bl=stageLearning(stage,b.kind).bonus;
      const ar=a.quality+distanceFit(a.distanceAtr,stage)+Math.min(10,(a.sources.length-1)*4)+al;
      const br=b.quality+distanceFit(b.distanceAtr,stage)+Math.min(10,(b.sources.length-1)*4)+bl;
      return br-ar;
    })[0],stage);
  };

  const dir=side==='BUY'?1:-1;
  const projection=(mult:number,conf:number,label:string,stage:1|2|3):TargetLevel=>{
    const p=price+dir*atr*mult,half=atr*.05;
    return {
      price:Number(p.toFixed(2)),low:Number((p-half).toFixed(2)),high:Number((p+half).toFixed(2)),
      confidence:conf,quality:conf,consensus:20,rankScore:conf-8,kind:'PROJECTION',source:label,sources:[label],
      distanceBps:Number((Math.abs(p-price)/price*10000).toFixed(2)),distanceAtr:mult,
      learningBonus:Number(stageLearning(stage,'PROJECTION').bonus.toFixed(1)),
      learningSamples:stageLearning(stage,'PROJECTION').samples,
      learningPosterior:stageLearning(stage,'PROJECTION').samples?Number(stageLearning(stage,'PROJECTION').posterior.toFixed(1)):null
    };
  };

  // T1 must be reasonably reachable; do not let a far high-quality level skip the next market objective.
  const t1Pool=levels.filter(x=>(x.distanceAtr??99)<=1.75);
  const t1=choose(t1Pool.length?t1Pool:levels,1,null)||projection(.48,42,'ATR projection T1',1);
  let t2=choose(levels,2,t1.price);
  if(!t2)t2=projection(Math.max(.95,(t1.distanceAtr??.48)+.46),37,'ATR projection T2',2);
  let t3=choose(levels,3,t2.price);
  if(!t3)t3=projection(Math.max(1.50,(t2.distanceAtr??.95)+.55),32,'ATR projection T3',3);

  const invCandidates=[
    zone(path?.invalidation)?.mid,
    num(path?.invalidation?.price),
    num(hunt?.invalidation),
    side==='BUY'?num(s5?.lastSwingLow):num(s5?.lastSwingHigh),
    side==='BUY'?num(s5?.rangeLow):num(s5?.rangeHigh),
    side==='BUY'?num(args.h4?.support):num(args.h4?.resistance)
  ].filter((x):x is number=>x!=null&&Number.isFinite(x));
  const validInv=(v:number)=> (side==='BUY'?v<price:v>price)&&Math.abs(v-price)<=atr*3.2;
  const validInvs=invCandidates.filter(validInv).sort((a,b)=>Math.abs(a-price)-Math.abs(b-price));
  let invalidation=validInvs[0]??(price-dir*atr*.58);
  invalidation=Number(invalidation.toFixed(2));

  const sourceCount=new Set([...(t1.sources||[]),...(t2.sources||[]),...(t3.sources||[])]).size;
  const projectionCount=[t1,t2,t3].filter(x=>x.kind==='PROJECTION').length;
  const projected=projectionCount>0;
  const mode:TargetLadder['mode']=projectionCount===0?'STRUCTURAL':projectionCount===3?'PROJECTED':'MIXED';
  const quality=Math.round(cap(
    t1.quality*.56+t2.quality*.29+t3.quality*.15+
    (sourceCount>=4?7:sourceCount>=3?4:0)-
    projectionCount*5
  ));
  const reason=t1.kind==='PROJECTION'
    ?'لم يظهر هدف هيكلي قريب موثوق؛ T1 إسقاط مؤقت وسيُستبدل عند ظهور سيولة/هيكل أمام السعر'
    :'T1 '+t1.source+
      (t1.sources.length>1?' · توافق '+t1.sources.length+' مصادر':'')+
      ' · T2 '+t2.source+
      (t2.kind==='PROJECTION'?' (إسقاط مؤقت)':'');

  const stageSamples=(stage:1|2|3)=>Object.values(args.learning?.['t'+stage]?.bySource||{}).reduce((sum:any,v:any)=>sum+Number(v?.hits||0)+Number(v?.fails||0),0) as number;
  const learning={enabled:Boolean(args.learning),t1Samples:stageSamples(1),t2Samples:stageSamples(2),t3Samples:stageSamples(3)};
  const learnedReason=learning.enabled&&learning.t1Samples>=8?reason+' · ترتيب الأهداف متكيف مع النتائج الحية':reason;
  return {side,t1,t2,t3,invalidation,quality,sourceCount,projected,mode,reason:learnedReason,learning};
}
