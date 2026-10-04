import type {Candle} from './engine';

type Side='BUY'|'SELL'|'WAIT';
type Zone={low:number;high:number;mid:number;touches:number;rejections:number};
type ReactionZone={side:'BUY'|'SELL';low:number;high:number;mid:number;strength:number;touches:number;rejections:number;volumeScore:number;impulseScore:number;distanceAtr:number;status:'NEAR'|'WATCH'|'FAR';reason:string};

export type AccumulationMap={
  ok:boolean;
  side:Side;
  phase:'ACCUMULATING'|'MARKUP_READY'|'DISTRIBUTING'|'MARKDOWN_READY'|'NEUTRAL';
  accumulationScore:number;
  distributionScore:number;
  breakoutReadiness:number;
  strongMoveSide:Side;
  strongMoveScore:number;
  zone:Zone|null;
  reactionZones:ReactionZone[];
  nearestReaction:ReactionZone|null;
  breakoutLevel:number|null;
  breakdownLevel:number|null;
  compression:number;
  rangePosition:number;
  higherLowScore:number;
  lowerHighScore:number;
  liquidityConfirmed:boolean;
  absorptionConfirmed:boolean;
  reasons:string[];
};

const avg=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const cap=(n:number,a=0,b=92)=>Math.max(a,Math.min(b,n));

function atr(c:Candle[],n=14){
  if(c.length<n+1)return NaN;
  const x=c.slice(-(n+1)),tr:number[]=[];
  for(let i=1;i<x.length;i++)tr.push(Math.max(x[i].high-x[i].low,Math.abs(x[i].high-x[i-1].close),Math.abs(x[i].low-x[i-1].close)));
  return avg(tr.slice(-n));
}

function countTouches(c:Candle[],level:number,tol:number,mode:'low'|'high'){
  let touches=0,rejections=0;
  for(const x of c){
    const p=mode==='low'?x.low:x.high;
    if(Math.abs(p-level)<=tol){
      touches++;
      const range=Math.max(1e-9,x.high-x.low),closePos=(x.close-x.low)/range;
      if(mode==='low'&&closePos>=.58)rejections++;
      if(mode==='high'&&closePos<=.42)rejections++;
    }
  }
  return {touches,rejections};
}

function slopes(vals:number[]){
  if(vals.length<3)return 0;
  let s=0,n=0;
  for(let i=1;i<vals.length;i++){s+=vals[i]-vals[i-1];n++;}
  return n?s/n:0;
}


function buildReactionZones(c:Candle[],p:number,a:number){
  const pivots:{side:'BUY'|'SELL';price:number;i:number}[]=[];
  for(let i=2;i<c.length-2;i++){
    const w=c.slice(i-2,i+3),x=c[i];
    if(x.low===Math.min(...w.map(v=>v.low)))pivots.push({side:'BUY',price:x.low,i});
    if(x.high===Math.max(...w.map(v=>v.high)))pivots.push({side:'SELL',price:x.high,i});
  }
  const tol=Math.max(a*.28,p*.00018),groups:{side:'BUY'|'SELL';prices:number[];idx:number[]}[]=[];
  for(const q of pivots){
    let g=groups.find(z=>z.side===q.side&&Math.abs(avg(z.prices)-q.price)<=tol);
    if(!g){g={side:q.side,prices:[],idx:[]};groups.push(g);}
    g.prices.push(q.price);g.idx.push(q.i);
  }
  const zones:ReactionZone[]=[];
  for(const g of groups){
    if(g.prices.length<2)continue;
    const mid=avg(g.prices),low=mid-tol*.7,high=mid+tol*.7;
    let touches=0,rejections=0,volScore=0,impulseScore=0;
    const vols=c.map(x=>Number(x.tickVolume||x.realVolume||0)).filter(v=>Number.isFinite(v)&&v>0),volBase=vols.length?avg(vols):0;
    for(let i=0;i<c.length;i++){
      const x=c[i],hit=g.side==='BUY'?x.low<=high&&x.low>=low-a*.18:x.high>=low&&x.high<=high+a*.18;
      if(!hit)continue;touches++;
      const range=Math.max(1e-9,x.high-x.low),closePos=(x.close-x.low)/range;
      const rejected=g.side==='BUY'?closePos>=.64:closePos<=.36;
      if(rejected)rejections++;
      const v=Number(x.tickVolume||x.realVolume||0);
      if(volBase>0&&v>0)volScore+=Math.min(2.2,v/volBase);
      const future=c[Math.min(c.length-1,i+3)];
      if(future){
        const move=(future.close-x.close)/a*(g.side==='BUY'?1:-1);
        if(move>0)impulseScore+=Math.min(2,move);
      }
    }
    const distanceAtr=Math.abs(p-mid)/a;
    const volumeScore=volBase>0?cap(volScore/Math.max(1,touches)*35,0,92):0;
    const impulse=cap(impulseScore/Math.max(1,touches)*32,0,92);
    const rejectionRate=rejections/Math.max(1,touches);
    const strength=Math.round(cap(touches*10+rejectionRate*35+volumeScore*.22+impulse*.28,0,94));
    if(strength<42)continue;
    const status:ReactionZone['status']=distanceAtr<=.55?'NEAR':distanceAtr<=1.6?'WATCH':'FAR';
    zones.push({side:g.side,low:Number(low.toFixed(2)),high:Number(high.toFixed(2)),mid:Number(mid.toFixed(2)),strength,touches,rejections,volumeScore:Math.round(volumeScore),impulseScore:Math.round(impulse),distanceAtr:Number(distanceAtr.toFixed(2)),status,reason:g.side==='BUY'?'منطقة طلب/تجميع تاريخية ذات رفض وارتداد متكرر':'منطقة عرض/تصريف تاريخية ذات رفض وهبوط متكرر'});
  }
  return zones.sort((x,y)=>x.distanceAtr-y.distanceAtr||y.strength-x.strength).slice(0,6);
}

export function buildAccumulationMap(c1:Candle[],c5:Candle[],price:number|null,liquidity:any=null,now=Date.now()):AccumulationMap{
  const m1=c1.filter(x=>x.time+60000<=now).slice(-42);
  const m5=c5.filter(x=>x.time+300000<=now).slice(-24);
  const empty:AccumulationMap={ok:false,side:'WAIT',phase:'NEUTRAL',accumulationScore:0,distributionScore:0,breakoutReadiness:0,strongMoveSide:'WAIT',strongMoveScore:0,zone:null,reactionZones:[],nearestReaction:null,breakoutLevel:null,breakdownLevel:null,compression:1,rangePosition:50,higherLowScore:0,lowerHighScore:0,liquidityConfirmed:false,absorptionConfirmed:false,reasons:['بيانات غير كافية لبناء خريطة التجميع.']};
  if(m1.length<28||m5.length<12)return empty;
  const a=atr(m1,14);if(!Number.isFinite(a)||a<=0)return empty;
  const p=Number(price||m1.at(-1)?.close);if(!Number.isFinite(p)||p<=0)return empty;

  const base=m1.slice(-30),hi=Math.max(...base.map(x=>x.high)),lo=Math.min(...base.map(x=>x.low)),span=Math.max(1e-9,hi-lo);
  const tol=Math.max(a*.22,span*.035);
  const lowTouch=countTouches(base,lo,tol,'low'),highTouch=countTouches(base,hi,tol,'high');
  const recentRanges=m1.slice(-6).map(x=>x.high-x.low),priorRanges=m1.slice(-24,-6).map(x=>x.high-x.low);
  const compression=avg(priorRanges)>0?avg(recentRanges)/avg(priorRanges):1;
  const rangePosition=Math.round(Math.max(0,Math.min(1,(p-lo)/span))*100);

  const lows=m1.slice(-12).map(x=>x.low),highs=m1.slice(-12).map(x=>x.high);
  const lowSlope=slopes(lows.slice(-6)),highSlope=slopes(highs.slice(-6));
  const higherLowScore=Math.round(cap(lowSlope>0?Math.min(100,lowSlope/a*280):0));
  const lowerHighScore=Math.round(cap(highSlope<0?Math.min(100,Math.abs(highSlope)/a*280):0));

  let buy=0,sell=0;const reasons:string[]=[];
  const add=(side:Side,pts:number,why:string)=>{if(side==='BUY')buy+=pts;else if(side==='SELL')sell+=pts;if(side!=='WAIT'&&pts>=4)reasons.push(why);};

  if(lowTouch.touches>=2)add('BUY',Math.min(18,6+lowTouch.touches*3),'تجميع متكرر قرب قاع الرينج');
  if(lowTouch.rejections>=2)add('BUY',Math.min(18,lowTouch.rejections*6),'رفض متكرر للقيعان');
  if(highTouch.touches>=2)add('SELL',Math.min(18,6+highTouch.touches*3),'توزيع متكرر قرب قمة الرينج');
  if(highTouch.rejections>=2)add('SELL',Math.min(18,highTouch.rejections*6),'رفض متكرر للقمم');
  if(higherLowScore>=20)add('BUY',Math.min(15,higherLowScore*.15),'قيعان صاعدة داخل نطاق التجميع');
  if(lowerHighScore>=20)add('SELL',Math.min(15,lowerHighScore*.15),'قمم هابطة داخل نطاق التوزيع');
  if(compression<=.72){
    if(rangePosition>=55)add('BUY',10,'ضغط سعري قرب النصف العلوي للرينج');
    if(rangePosition<=45)add('SELL',10,'ضغط سعري قرب النصف السفلي للرينج');
  }
  if(rangePosition>=70)add('BUY',8,'السعر قريب من حد الكسر الصاعد');
  if(rangePosition<=30)add('SELL',8,'السعر قريب من حد الكسر الهابط');

  const liqOk=Boolean(liquidity?.ok&&Number(liquidity?.quality)>=55);
  const liqSide:Side=liqOk?(liquidity?.side||'WAIT'):'WAIT';
  const absorptionSide:Side=liqOk?(liquidity?.absorption?.side||'WAIT'):'WAIT';
  const absorptionScore=Number(liquidity?.absorption?.score||0);
  const bookImbalance=Number(liquidity?.book?.weightedImbalance||0);
  const delta=Number(liquidity?.flow?.deltaPct||0);
  const priceBps=Number(liquidity?.flow?.priceChangeBps||0);

  if(liqSide==='BUY')add('BUY',Math.min(16,Math.max(5,Number(liquidity?.strength||50)*.16)),'السيولة اللحظية تدعم التجميع');
  if(liqSide==='SELL')add('SELL',Math.min(16,Math.max(5,Number(liquidity?.strength||50)*.16)),'السيولة اللحظية تدعم التوزيع');
  if(absorptionSide==='BUY'&&absorptionScore>=55)add('BUY',Math.min(22,absorptionScore*.22),'امتصاص بيع يدعم تجميع صاعد');
  if(absorptionSide==='SELL'&&absorptionScore>=55)add('SELL',Math.min(22,absorptionScore*.22),'امتصاص شراء يدعم توزيع هابط');

  // Classic bullish absorption: aggressive selling but price refuses to fall.
  if(liqOk&&delta<=-22&&priceBps>-1.5)add('BUY',16,'Sell Delta قوي بدون هبوط: تجميع/امتصاص محتمل');
  if(liqOk&&delta>=22&&priceBps<1.5)add('SELL',16,'Buy Delta قوي بدون صعود: توزيع/امتصاص محتمل');
  if(bookImbalance>=18)add('BUY',10,'Order Book bid support');
  if(bookImbalance<=-18)add('SELL',10,'Order Book ask pressure');

  const accumulationScore=Math.round(cap(buy)),distributionScore=Math.round(cap(sell));
  const side:Side=accumulationScore-distributionScore>=10?'BUY':distributionScore-accumulationScore>=10?'SELL':'WAIT';

  const compressionFuel=compression<=.55?28:compression<=.72?20:compression<=.88?10:0;
  const boundaryFuel=side==='BUY'?Math.max(0,(rangePosition-55)*.45):side==='SELL'?Math.max(0,(45-rangePosition)*.45):0;
  const touchFuel=side==='BUY'?Math.min(18,lowTouch.touches*3+lowTouch.rejections*4):side==='SELL'?Math.min(18,highTouch.touches*3+highTouch.rejections*4):0;
  const liqFuel=side==='BUY'?(liqSide==='BUY'?10:0)+(absorptionSide==='BUY'?12:0):side==='SELL'?(liqSide==='SELL'?10:0)+(absorptionSide==='SELL'?12:0):0;
  const breakoutReadiness=Math.round(cap(compressionFuel+boundaryFuel+touchFuel+liqFuel+(side!=='WAIT'?Math.max(accumulationScore,distributionScore)*.25:0),0,90));

  let phase:AccumulationMap['phase']='NEUTRAL';
  if(side==='BUY')phase=breakoutReadiness>=60&&rangePosition>=58?'MARKUP_READY':'ACCUMULATING';
  else if(side==='SELL')phase=breakoutReadiness>=60&&rangePosition<=42?'MARKDOWN_READY':'DISTRIBUTING';

  const strongMoveSide:Side=breakoutReadiness>=58&&side!=='WAIT'?side:'WAIT';
  const strongMoveScore=Math.round(cap(Math.max(accumulationScore,distributionScore)*.58+breakoutReadiness*.42,0,90));

  const zone:Zone={low:Number(lo.toFixed(2)),high:Number(hi.toFixed(2)),mid:Number(((lo+hi)/2).toFixed(2)),touches:side==='BUY'?lowTouch.touches:highTouch.touches,rejections:side==='BUY'?lowTouch.rejections:highTouch.rejections};
  const reactionZones=buildReactionZones(m1,p,a),nearestReaction=reactionZones[0]||null;
  if(nearestReaction&&nearestReaction.status==='NEAR'&&nearestReaction.strength>=65){
    if(nearestReaction.side==='BUY')add('BUY',Math.min(18,nearestReaction.strength*.18),'السعر يقترب من منطقة طلب تاريخية قوية');
    else add('SELL',Math.min(18,nearestReaction.strength*.18),'السعر يقترب من منطقة عرض تاريخية قوية');
  }

  return {
    ok:true,side,phase,accumulationScore,distributionScore,breakoutReadiness,strongMoveSide,strongMoveScore,zone,reactionZones,nearestReaction,
    breakoutLevel:Number(hi.toFixed(2)),breakdownLevel:Number(lo.toFixed(2)),compression:Number(compression.toFixed(2)),rangePosition,higherLowScore,lowerHighScore,
    liquidityConfirmed:liqOk&&liqSide===side,absorptionConfirmed:liqOk&&absorptionSide===side&&absorptionScore>=55,
    reasons:[...new Set(reasons)].slice(0,8)
  };
}
