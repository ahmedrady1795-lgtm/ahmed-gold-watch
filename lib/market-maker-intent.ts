import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Phase='NEUTRAL'|'LIQUIDITY_BUILDUP'|'SWEEP_DETECTED'|'TRAP_CONFIRMED'|'PRE_EXPANSION'|'EXPANSION';

export type MarketMakerIntent={
  ok:boolean;
  asset:'GOLD'|'BTC';
  side:Side;
  phase:Phase;
  confidence:number;
  score:number;
  preMove:boolean;
  liquidityTaken:'UPPER'|'LOWER'|'NONE';
  sweepLevel:number|null;
  targetPrice:number|null;
  targetKind:'UPPER_LIQUIDITY'|'LOWER_LIQUIDITY'|'INSTITUTIONAL_ZONE'|'NONE';
  compression:number;
  rejection:number;
  absorption:number;
  institutional:number;
  h4Alignment:'ALIGNED'|'OPPOSED'|'NEUTRAL';
  sequence:string[];
  reasons:string[];
  diagnostics:{
    equalHigh:number|null;
    equalLow:number|null;
    upperSweep:boolean;
    lowerSweep:boolean;
    reclaim:boolean;
    expansion:boolean;
    leadSide:Side;
    structureSide:Side;
    accumulationSide:Side;
    liquiditySide:Side;
  };
};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const side=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';

function atr(c:Candle[],n=14){
  if(c.length<n+1)return NaN;
  const x=c.slice(-(n+1)),tr:number[]=[];
  for(let i=1;i<x.length;i++){
    const p=x[i-1],v=x[i];
    tr.push(Math.max(v.high-v.low,Math.abs(v.high-p.close),Math.abs(v.low-p.close)));
  }
  return avg(tr.slice(-n));
}

function clusterLevel(values:number[],tol:number,mode:'HIGH'|'LOW'){
  if(values.length<3)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  let best:{mid:number;count:number;spread:number}|null=null;
  for(let i=0;i<sorted.length;i++){
    const bucket=sorted.filter(v=>Math.abs(v-sorted[i])<=tol);
    if(bucket.length<2)continue;
    const mid=avg(bucket),spread=Math.max(...bucket)-Math.min(...bucket);
    const row={mid,count:bucket.length,spread};
    if(!best||row.count>best.count||(row.count===best.count&&row.spread<best.spread))best=row;
  }
  if(!best)return null;
  // Require a real repeated liquidity shelf, not a single random pivot.
  if(best.count<2)return null;
  return Number(best.mid.toFixed(6));
}

function zoneStrength(acc:any,expected:Side,price:number,a:number){
  const rows=Array.isArray(acc?.reactionZones)?acc.reactionZones:[];
  const wanted=expected==='BUY'?'BUY':expected==='SELL'?'SELL':null;
  if(!wanted)return {score:0,zone:null as any};
  const candidates=rows
    .filter((z:any)=>z?.side===wanted&&z?.state!=='SPENT')
    .map((z:any)=>{
      const low=Number(z.low),high=Number(z.high),mid=Number(z.mid);
      const d=price>=low&&price<=high?0:Math.min(Math.abs(price-low),Math.abs(price-high))/Math.max(a,1e-9);
      const fresh=Number(z.freshnessScore||0),inst=Number(z.institutionalScore||z.strength||0);
      const score=cap(inst*.62+fresh*.26+Math.max(0,18-d*12)-Number(z.mitigationCount||0)*5,0,96);
      return {z,d,score,mid};
    })
    .filter((x:any)=>Number.isFinite(x.d)&&x.d<=1.35)
    .sort((x:any,y:any)=>y.score-x.score||x.d-y.d);
  return candidates[0]?{score:Math.round(candidates[0].score),zone:candidates[0].z}:{score:0,zone:null};
}

export function buildMarketMakerIntent(args:{
  asset:'GOLD'|'BTC';
  c1:Candle[];
  c5:Candle[];
  price:number|null;
  atr?:number|null;
  liquidity?:any;
  accumulation?:any;
  structure?:any;
  h4?:any;
  marketLead?:any;
  now?:number;
}):MarketMakerIntent{
  const now=Number(args.now||Date.now());
  const c1=(Array.isArray(args.c1)?args.c1:[]).filter(x=>Number(x.time)+60000<=now).slice(-64);
  const c5=(Array.isArray(args.c5)?args.c5:[]).filter(x=>Number(x.time)+300000<=now).slice(-30);
  const empty:MarketMakerIntent={
    ok:false,asset:args.asset,side:'WAIT',phase:'NEUTRAL',confidence:0,score:0,preMove:false,
    liquidityTaken:'NONE',sweepLevel:null,targetPrice:null,targetKind:'NONE',
    compression:0,rejection:0,absorption:0,institutional:0,h4Alignment:'NEUTRAL',
    sequence:[],reasons:['بيانات غير كافية لقراءة تسلسل السيولة المؤسسية.'],
    diagnostics:{equalHigh:null,equalLow:null,upperSweep:false,lowerSweep:false,reclaim:false,expansion:false,leadSide:'WAIT',structureSide:'WAIT',accumulationSide:'WAIT',liquiditySide:'WAIT'}
  };
  if(c1.length<28||c5.length<8)return empty;
  const p=Number(args.price||c1.at(-1)?.close),a=Number(args.atr)||atr(c1,14);
  if(!Number.isFinite(p)||p<=0||!Number.isFinite(a)||a<=0)return empty;

  const last=c1.at(-1)!,prev=c1.at(-2)!;
  const shelf=c1.slice(-28,-3);
  const tol=Math.max(a*.11,p*.000055);
  const equalHigh=clusterLevel(shelf.map(x=>Number(x.high)).filter(Number.isFinite),tol,'HIGH');
  const equalLow=clusterLevel(shelf.map(x=>Number(x.low)).filter(Number.isFinite),tol,'LOW');

  const recent=c1.slice(-4);
  const maxHigh=Math.max(...recent.map(x=>Number(x.high)));
  const minLow=Math.min(...recent.map(x=>Number(x.low)));
  const latestClose=Number(last.close);
  const upperSweep=Boolean(equalHigh!=null&&maxHigh>equalHigh+a*.035&&latestClose<equalHigh+a*.015);
  const lowerSweep=Boolean(equalLow!=null&&minLow<equalLow-a*.035&&latestClose>equalLow-a*.015);

  // Reclaim means price took liquidity and then closed back through the shelf with intent.
  const reclaim=upperSweep
    ?latestClose<Number(equalHigh)-a*.02
    :lowerSweep
      ?latestClose>Number(equalLow)+a*.02
      :false;

  const range=Math.max(1e-9,Number(last.high)-Number(last.low));
  const upperWick=(Number(last.high)-Math.max(Number(last.open),Number(last.close)))/range;
  const lowerWick=(Math.min(Number(last.open),Number(last.close))-Number(last.low))/range;
  const rejection=upperSweep?cap(upperWick*145,0,95):lowerSweep?cap(lowerWick*145,0,95):cap(Math.max(upperWick,lowerWick)*80,0,60);

  const recentRanges=c1.slice(-7).map(x=>Number(x.high)-Number(x.low));
  const baseRanges=c1.slice(-24,-7).map(x=>Number(x.high)-Number(x.low));
  const compressionRatio=avg(recentRanges)/Math.max(1e-9,avg(baseRanges));
  const compression=cap((1.18-compressionRatio)*105,0,92);

  const bodyNow=Math.abs(Number(last.close)-Number(last.open))/Math.max(a,1e-9);
  const bodyPrev=Math.abs(Number(prev.close)-Number(prev.open))/Math.max(a,1e-9);
  const expansion=Boolean(Math.max(bodyNow,bodyPrev)>=.72&&avg(recentRanges.slice(-2))/Math.max(1e-9,avg(baseRanges))>=1.18);

  const liq=args.liquidity||{},acc=args.accumulation||{},structure=args.structure||{},lead=args.marketLead||{},h4=args.h4||{};
  const liquiditySide=side(liq.side);
  const accumulationSide=side(acc.side);
  const structureSide=side(structure?.m1?.nextSide||structure?.shortSide||structure?.side);
  const leadSide=side(lead.side);

  const absorptionRaw=Math.max(
    Number(liq?.absorption?.score||0),
    Boolean(acc?.absorptionConfirmed)?72:0,
    Boolean(liq?.absorption?.trapDetected)?82:0
  );
  let expected:Side=lowerSweep?'BUY':upperSweep?'SELL':'WAIT';

  // No sweep yet: infer a possible pre-sweep buildup only when the market is compressed
  // and several independent engines point to the same side.
  if(expected==='WAIT'&&compression>=52){
    const votes=[liquiditySide,accumulationSide,structureSide,leadSide].filter(x=>x!=='WAIT');
    const buy=votes.filter(x=>x==='BUY').length,sell=votes.filter(x=>x==='SELL').length;
    if(Math.max(buy,sell)>=3)expected=buy>sell?'BUY':'SELL';
  }

  const inst=zoneStrength(acc,expected,p,a);
  const institutional=inst.score;
  const h4Side=side(h4?.side);
  const h4Alignment:MarketMakerIntent['h4Alignment']=expected==='WAIT'||h4Side==='WAIT'?'NEUTRAL':h4Side===expected?'ALIGNED':'OPPOSED';

  let support=0,opposition=0;
  const vote=(s:Side,strong=false)=>{
    if(expected==='WAIT'||s==='WAIT')return;
    if(s===expected)support+=strong?2:1;else opposition+=strong?2:1;
  };
  vote(liquiditySide,Number(liq?.strength||0)>=62);
  vote(accumulationSide,Math.max(Number(acc?.accumulationScore||0),Number(acc?.distributionScore||0),Number(acc?.breakoutReadiness||0))>=62);
  vote(structureSide,Number(structure?.m1?.confidence||structure?.confidence||0)>=58);
  vote(leadSide,Boolean(lead?.armed)||Number(lead?.confidence||0)>=60);

  const sweepScore=upperSweep||lowerSweep?76:0;
  const reclaimScore=reclaim?82:0;
  const absorption=cap(absorptionRaw,0,92);
  const leadScore=expected!=='WAIT'&&leadSide===expected?Math.min(88,Number(lead?.confidence||lead?.score||0)):0;
  const structureScore=expected!=='WAIT'&&structureSide===expected?Math.min(88,Number(structure?.m1?.confidence||structure?.confidence||0)):0;
  const accumulationScore=expected==='BUY'
    ?Number(acc?.accumulationScore||0)
    :expected==='SELL'?Number(acc?.distributionScore||0):0;

  let score=
    sweepScore*.20+
    reclaimScore*.13+
    rejection*.10+
    absorption*.12+
    institutional*.16+
    compression*.09+
    leadScore*.08+
    structureScore*.06+
    accumulationScore*.06+
    support*3.2-
    opposition*4.8;

  if(h4Alignment==='ALIGNED')score+=7;
  if(h4Alignment==='OPPOSED')score-=7;
  score=cap(score,0,94);

  const trapConfirmed=Boolean((upperSweep||lowerSweep)&&reclaim&&rejection>=38&&(absorption>=48||institutional>=58||support>=3));
  const preExpansion=Boolean(expected!=='WAIT'&&!expansion&&(
    trapConfirmed||
    compression>=58&&support>=3&&institutional>=50||
    Boolean(lead?.armed)&&support>=2
  ));

  let phase:Phase='NEUTRAL';
  if(expansion&&expected!=='WAIT')phase='EXPANSION';
  else if(preExpansion)phase='PRE_EXPANSION';
  else if(trapConfirmed)phase='TRAP_CONFIRMED';
  else if(upperSweep||lowerSweep)phase='SWEEP_DETECTED';
  else if(compression>=50&&expected!=='WAIT')phase='LIQUIDITY_BUILDUP';

  let confidence=Math.round(cap(
    score*.66+
    Math.min(18,support*4.2)+
    (trapConfirmed?8:0)+
    (preExpansion?6:0)-
    opposition*3.5,
    0,90
  ));
  if(expected==='WAIT')confidence=Math.min(confidence,38);
  if(h4Alignment==='OPPOSED'&&!trapConfirmed)confidence=Math.min(confidence,62);

  const oppositeZones=Array.isArray(acc?.reactionZones)?acc.reactionZones:[];
  let targetPrice:number|null=null,targetKind:MarketMakerIntent['targetKind']='NONE';
  if(expected==='BUY'){
    const upper=oppositeZones
      .filter((z:any)=>z?.side==='SELL'&&Number(z?.mid)>p&&z?.state!=='SPENT')
      .sort((x:any,y:any)=>Number(x.mid)-Number(y.mid))[0];
    if(upper){targetPrice=Number(upper.mid);targetKind='INSTITUTIONAL_ZONE';}
    else if(equalHigh!=null&&equalHigh>p){targetPrice=equalHigh;targetKind='UPPER_LIQUIDITY';}
  }else if(expected==='SELL'){
    const lower=oppositeZones
      .filter((z:any)=>z?.side==='BUY'&&Number(z?.mid)<p&&z?.state!=='SPENT')
      .sort((x:any,y:any)=>Number(y.mid)-Number(x.mid))[0];
    if(lower){targetPrice=Number(lower.mid);targetKind='INSTITUTIONAL_ZONE';}
    else if(equalLow!=null&&equalLow<p){targetPrice=equalLow;targetKind='LOWER_LIQUIDITY';}
  }
  if(targetPrice!=null&&!Number.isFinite(targetPrice))targetPrice=null;

  const sequence:string[]=[];
  if(compression>=50)sequence.push('COMPRESSION');
  if(lowerSweep)sequence.push('LOWER_LIQUIDITY_SWEEP');
  if(upperSweep)sequence.push('UPPER_LIQUIDITY_SWEEP');
  if(reclaim)sequence.push('RECLAIM');
  if(absorption>=48)sequence.push('ABSORPTION');
  if(institutional>=55)sequence.push('INSTITUTIONAL_ZONE');
  if(preExpansion)sequence.push('PRE_EXPANSION');
  if(expansion)sequence.push('EXPANSION');

  const reasons:string[]=[];
  if(lowerSweep)reasons.push('تم سحب سيولة أسفل القيعان ثم العودة داخل النطاق.');
  if(upperSweep)reasons.push('تم سحب سيولة أعلى القمم ثم العودة داخل النطاق.');
  if(reclaim)reasons.push('الإغلاق أعاد السيطرة داخل مستوى السيولة بعد السحب.');
  if(absorption>=48)reasons.push('يوجد امتصاص/رفض يدعم فشل الاختراق.');
  if(institutional>=55)reasons.push('منطقة مؤسسية قريبة ما زالت ذات جودة جيدة.');
  if(compression>=55)reasons.push('السوق في ضغط يسمح بحركة توسع لاحقة.');
  if(h4Alignment==='ALIGNED')reasons.push('سياق H4 متوافق مع السيناريو.');
  if(h4Alignment==='OPPOSED')reasons.push('السيناريو عكس H4 لذلك تم خفض الثقة.');
  if(Boolean(lead?.armed)&&leadSide===expected)reasons.push('Market Lead يرصد ضغطًا سابقًا للحركة في نفس الاتجاه.');

  return {
    ok:true,asset:args.asset,side:expected,phase,confidence,score:Math.round(score),
    preMove:Boolean(preExpansion||trapConfirmed&&!expansion),
    liquidityTaken:lowerSweep?'LOWER':upperSweep?'UPPER':'NONE',
    sweepLevel:lowerSweep?equalLow:upperSweep?equalHigh:null,
    targetPrice:targetPrice==null?null:Number(targetPrice.toFixed(2)),targetKind,
    compression:Math.round(compression),rejection:Math.round(rejection),absorption:Math.round(absorption),
    institutional:Math.round(institutional),h4Alignment,sequence,reasons:reasons.slice(0,6),
    diagnostics:{equalHigh,equalLow,upperSweep,lowerSweep,reclaim,expansion,leadSide,structureSide,accumulationSide,liquiditySide}
  };
}
