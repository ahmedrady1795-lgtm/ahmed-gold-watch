type Side='BUY'|'SELL'|'WAIT';
type TargetKind='MODEL_15M'|'STRUCTURE'|'LIQUIDITY'|'H4_LEVEL'|'INTENT'|'PATH_ZONE'|'EXTENSION'|'PROJECTION';

export type TargetLevel={
  price:number;
  low:number;
  high:number;
  confidence:number;
  quality:number;
  kind:TargetKind;
  source:string;
  sources:string[];
  distanceBps:number;
  distanceAtr:number|null;
};
export type TargetLadder={
  side:Side;
  t1:TargetLevel|null;
  t2:TargetLevel|null;
  t3:TargetLevel|null;
  invalidation:number|null;
  quality:number;
  sourceCount:number;
  projected:boolean;
  reason:string;
};

type Candidate={price:number;low:number;high:number;confidence:number;kind:TargetKind;source:string;weight:number};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const num=(v:any)=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const validSide=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';

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
function inner(side:Side,z:{low:number;high:number;mid:number}){return side==='BUY'?z.low:z.high;}

export function buildTargetLadder(args:{
  asset:'GOLD'|'BTC';side:Side;price:number|null;atr?:number|null;
  hunt?:any;movement?:any;h4?:any;intent?:any;structure?:any;liquidity?:any;toolMesh?:any;
}):TargetLadder{
  const side=validSide(args.side),price=num(args.price),atr0=num(args.atr);
  if(side==='WAIT'||price==null||price<=0)return {side:'WAIT',t1:null,t2:null,t3:null,invalidation:null,quality:0,sourceCount:0,projected:false,reason:'لا يوجد اتجاه أمامي صالح لبناء أهداف'};
  const atr=atr0!=null&&atr0>0?atr0:price*(args.asset==='GOLD'?.0012:.0032);
  const minBps=args.asset==='GOLD'?1.4:3.2;
  const minDistance=Math.max(price*minBps/10000,atr*.07);
  const maxDistance=atr*5.5;
  const candidates:Candidate[]=[];
  const add=(raw:any,source:string,confidence:number,kind:TargetKind,weight=1,sideHint?:any)=>{
    if(sideHint&&validSide(sideHint)!=='WAIT'&&validSide(sideHint)!==side)return;
    const z=zone(raw);if(!z)return;
    const p=z.mid;if(!ahead(side,price,p,minDistance))return;
    if(Math.abs(p-price)>maxDistance)return;
    candidates.push({price:p,low:z.low,high:z.high,confidence:cap(confidence),kind,source,weight});
  };
  const addOuter=(raw:any,source:string,confidence:number,kind:TargetKind,weight=.82)=>{
    const z=zone(raw);if(!z)return;
    const p=outer(side,z);if(!ahead(side,price,p,minDistance)||Math.abs(p-price)>maxDistance)return;
    candidates.push({price:p,low:p,high:p,confidence:cap(confidence),kind,source,weight});
  };

  const hunt=args.hunt||{},movement=args.movement||{},path=hunt?.zoneForecast?.pathForecast||{},zf=hunt?.zoneForecast||{};
  const m15=movement?.target15||null,h15=hunt?.quickSignalTargets?.fifteenMinute||hunt?.fifteenMinuteTarget||null;
  add(m15?.price,'Movement 15m',Number(m15?.confidence||0),'MODEL_15M',1.14,m15?.side);
  if(m15?.low!=null&&m15?.high!=null)addOuter({low:m15.low,high:m15.high,mid:m15.price},'Movement 15m range',Number(m15?.confidence||0)-5,'EXTENSION',.86);
  add(h15?.price,'Hunt 15m',Number(h15?.confidence||0),'MODEL_15M',1.10,h15?.side);

  const pd=path?.priceDestination;
  if(pd&&(!pd.side||validSide(pd.side)===side)){
    add(pd?.zone||pd,'Path destination',Number(pd?.confidence||path?.confidence||0),'PATH_ZONE',1.16,pd?.side);
    addOuter(pd?.zone||pd,'Path destination edge',Number(pd?.confidence||path?.confidence||0)-4,'EXTENSION',.92);
  }
  add(path?.destination,'Path structural destination',Number(path?.confidence||0),'PATH_ZONE',1.08,path?.side);
  add(zf?.target,'Structural zone target',Number(zf?.confidence||hunt?.confidence||0),'STRUCTURE',1.08,zf?.side);

  const liqZone=side==='BUY'?(path?.upperLiquidity||zf?.resistance):(path?.lowerLiquidity||zf?.support);
  add(liqZone,side==='BUY'?'Upper liquidity':'Lower liquidity',Number(path?.liquidityConfidence||hunt?.quality||62),'LIQUIDITY',1.12);
  addOuter(liqZone,side==='BUY'?'Upper liquidity edge':'Lower liquidity edge',Number(path?.liquidityConfidence||hunt?.quality||58),'EXTENSION',.88);

  const h4Level=side==='BUY'?args.h4?.resistance:args.h4?.support;
  add(h4Level,'H4 '+(side==='BUY'?'resistance':'support'),Number(args.h4?.confidence||58),'H4_LEVEL',.90,args.h4?.side==='WAIT'?null:args.h4?.side);

  add(args.intent?.targetPrice,'Market intent target',Number(args.intent?.confidence||0),'INTENT',.92,args.intent?.side);

  const thirty=hunt?.quickSignalTargets?.thirtyMinute||hunt?.thirtyMinuteTarget;
  add(thirty?.price,'30m extension',Number(thirty?.confidence||0)-6,'EXTENSION',.72,thirty?.side);

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
    const items=cl.items,tw=items.reduce((s,x)=>s+x.weight,0),p=items.reduce((s,x)=>s+x.price*x.weight,0)/Math.max(.01,tw);
    const unique=[...new Set(items.map(x=>x.source))];
    const avgConf=items.reduce((s,x)=>s+x.confidence*x.weight,0)/Math.max(.01,tw);
    const dist=Math.abs(p-price),distAtr=atr>0?dist/atr:null,distBps=dist/price*10000;
    const quality=cap(avgConf+Math.min(14,(unique.length-1)*5)-Math.max(0,(distAtr??0)-2.2)*4);
    const strongest=[...items].sort((a,b)=>(b.confidence*b.weight)-(a.confidence*a.weight))[0];
    return {
      price:p,low:Math.min(...items.map(x=>x.low),p),high:Math.max(...items.map(x=>x.high),p),
      confidence:cap(avgConf),quality,kind:strongest.kind,source:strongest.source,sources:unique,
      distanceBps:distBps,distanceAtr:distAtr
    };
  }).filter(x=>x.quality>=38).sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price));

  const selected:TargetLevel[]=[];
  for(const x of levels){
    if(selected.length>=3)break;
    const prev=selected.at(-1);
    if(prev&&Math.abs(x.price-prev.price)<tolerance*.80)continue;
    const minAtr=selected.length===0?.10:selected.length===1?.16:.22;
    if(prev&&Math.abs(x.price-prev.price)<atr*minAtr)continue;
    selected.push({...x,price:Number(x.price.toFixed(2)),low:Number(x.low.toFixed(2)),high:Number(x.high.toFixed(2)),confidence:Math.round(x.confidence),quality:Math.round(x.quality),distanceBps:Number(x.distanceBps.toFixed(2)),distanceAtr:x.distanceAtr==null?null:Number(x.distanceAtr.toFixed(2))});
  }

  const dir=side==='BUY'?1:-1;
  const projection=(mult:number,conf:number,label:string):TargetLevel=>{
    const p=price+dir*atr*mult,half=atr*.05;
    return {price:Number(p.toFixed(2)),low:Number((p-half).toFixed(2)),high:Number((p+half).toFixed(2)),confidence:conf,quality:conf,kind:'PROJECTION',source:label,sources:[label],distanceBps:Number((Math.abs(p-price)/price*10000).toFixed(2)),distanceAtr:mult};
  };
  const t1=selected[0]||projection(.48,44,'ATR projection T1');
  let t2=selected.find(x=>side==='BUY'?x.price>t1.price+atr*.12:x.price<t1.price-atr*.12)||null;
  if(!t2)t2=projection(Math.max(.92,(t1.distanceAtr??.48)+.42),39,'ATR projection T2');
  let t3=selected.find(x=>side==='BUY'?x.price>t2!.price+atr*.16:x.price<t2!.price-atr*.16)||null;
  if(!t3)t3=projection(Math.max(1.38,(t2.distanceAtr??.92)+.46),34,'ATR projection T3');

  const invRaw=zone(path?.invalidation)?.mid??num(path?.invalidation?.price)??num(hunt?.invalidation);
  const h4Opp=side==='BUY'?num(args.h4?.support):num(args.h4?.resistance);
  let invalidation=invRaw;
  const validInv=(v:number|null)=>v!=null&&(side==='BUY'?v<price:v>price)&&Math.abs(v-price)<=atr*3.2;
  if(!validInv(invalidation))invalidation=validInv(h4Opp)?h4Opp:price-dir*atr*.58;
  invalidation=Number(Number(invalidation).toFixed(2));

  const sourceCount=new Set([...(t1?.sources||[]),...(t2?.sources||[]),...(t3?.sources||[])]).size;
  const projected=[t1,t2,t3].some(x=>x.kind==='PROJECTION');
  const quality=Math.round(cap(t1.quality*.52+t2.quality*.30+t3.quality*.18+(sourceCount>=3?4:0)));
  const reason=t1.kind==='PROJECTION'
    ?'لا يوجد مستوى أمامي قوي كفاية؛ T1 إسقاط ATR مؤقت'
    :('T1 من '+t1.source+(t1.sources.length>1?' مع توافق '+t1.sources.length+' مصادر':'')+' · T2 '+t2.source);

  return {side,t1,t2,t3,invalidation,quality,sourceCount,projected,reason};
}
