type Side='BUY'|'SELL'|'WAIT';
export type MarketLeadStage='OFFLINE'|'OBSERVE'|'BUILDING'|'ARMED'|'RELEASED'|'REJECTED';

type LeadFeatures={
  source:string;sourceAt:number;quality:number;price:number|null;
  bookImbalance:number;pressureChange:number;replenishDelta:number;acceleration:number;
  flowDelta:number;priceVelocity:number;persistence:number;
  absorptionSide:Side;absorptionScore:number;trapDetected:boolean;hintSide:Side;
};
export type MarketLeadSignal={
  ok:boolean;available:boolean;asset:'GOLD'|'BTC';side:Side;stage:MarketLeadStage;
  score:number;confidence:number;armed:boolean;released:boolean;quiet:boolean;
  support:number;opposition:number;stability:number;source:string;sourceAt:number;
  checkedAt:number;ageMs:number;windowSeconds:{min:number;max:number}|null;
  reason:string;evidence:string[];
  metrics:{bookImbalance:number;pressureChange:number;replenishDelta:number;acceleration:number;flowDelta:number;priceVelocity:number;persistence:number;quality:number};
};
type LeadState={lastSourceAt:number;history:Array<{at:number;side:Side;score:number}>;signal:MarketLeadSignal|null};
const states:Record<'GOLD'|'BTC',LeadState>={
  GOLD:{lastSourceAt:0,history:[],signal:null},
  BTC:{lastSourceAt:0,history:[],signal:null}
};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const sideOf=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';
const norm=(v:number,scale:number)=>clamp(v/Math.max(.0001,scale),-1.35,1.35);
const signFor=(s:Side)=>s==='BUY'?1:s==='SELL'?-1:0;
function offline(asset:'GOLD'|'BTC',source:string,reason:string,now:number):MarketLeadSignal{
  return {ok:true,available:false,asset,side:'WAIT',stage:'OFFLINE',score:0,confidence:0,armed:false,released:false,quiet:false,support:0,opposition:0,stability:0,source,sourceAt:0,checkedAt:now,ageMs:0,windowSeconds:null,reason,evidence:[],metrics:{bookImbalance:0,pressureChange:0,replenishDelta:0,acceleration:0,flowDelta:0,priceVelocity:0,persistence:0,quality:0}};
}
function evaluate(asset:'GOLD'|'BTC',f:LeadFeatures,now=Date.now()):MarketLeadSignal{
  const state=states[asset],sourceAt=Number(f.sourceAt||0);
  if(!Number.isFinite(sourceAt)||sourceAt<=0||now-sourceAt>8000||Number(f.quality||0)<30){
    const out=offline(asset,f.source,'مصدر القراءة المبكرة غير حديث أو جودته غير كافية.',now);state.signal=out;return out;
  }
  const s=asset==='GOLD'?{book:12,pressure:6,replenish:9,acc:.026,flow:18,quiet:.38,release:.55}:{book:14,pressure:11,replenish:18,acc:16,flow:22,quiet:1.7,release:2.8};
  const absorption=signFor(f.absorptionSide)*clamp(f.absorptionScore/75,0,1.2),hint=signFor(f.hintSide);
  const components=[
    {name:'book',v:norm(f.bookImbalance,s.book),w:1.35},{name:'pressure',v:norm(f.pressureChange,s.pressure),w:1.25},
    {name:'replenish',v:norm(f.replenishDelta,s.replenish),w:1.05},{name:'acceleration',v:norm(f.acceleration,s.acc),w:.90},
    {name:'flow',v:norm(f.flowDelta,s.flow),w:.78},{name:'absorption',v:absorption,w:f.trapDetected?1.10:.72},{name:'hint',v:hint,w:.55}
  ];
  const totalW=components.reduce((a,x)=>a+x.w,0),signed=components.reduce((a,x)=>a+x.v*x.w,0)/Math.max(1,totalW);
  const rawSide:Side=signed>=.20?'BUY':signed<=-.20?'SELL':'WAIT',dir=signFor(rawSide);
  const support=rawSide==='WAIT'?0:components.filter(x=>x.v*dir>=.42).length;
  const opposition=rawSide==='WAIT'?0:components.filter(x=>x.v*dir<=-.42).length;
  const quiet=Math.abs(f.priceVelocity)<=s.quiet;
  const released=rawSide!=='WAIT'&&Math.abs(f.priceVelocity)>=s.release&&Math.sign(f.priceVelocity)===dir;
  const rejected=rawSide!=='WAIT'&&Math.abs(f.priceVelocity)>=s.release&&Math.sign(f.priceVelocity)===-dir;
  if(sourceAt!==state.lastSourceAt){
    state.lastSourceAt=sourceAt;
    const rawScore=Math.round(clamp(Math.abs(signed)*62+support*5+Number(f.quality||0)*.08-opposition*7,0,92));
    state.history.push({at:sourceAt,side:rawSide,score:rawScore});
    state.history=state.history.filter(x=>now-x.at<=15000).slice(-10);
  }
  const recent=state.history.slice(-5),same=rawSide==='WAIT'?0:recent.filter(x=>x.side===rawSide).length,opposite=rawSide==='WAIT'?0:recent.filter(x=>x.side!=='WAIT'&&x.side!==rawSide).length;
  const stability=rawSide==='WAIT'?0:Math.round(same/Math.max(1,recent.length)*100);
  const score=Math.round(clamp(Math.abs(signed)*58+support*5+same*4+Number(f.quality||0)*.09-opposition*7-opposite*4,0,92));
  const confidence=Math.round(clamp(score*.67+stability*.20+Math.min(12,support*2.2)+(quiet?3:0),0,90));
  const armed=Boolean(rawSide!=='WAIT'&&!released&&!rejected&&quiet&&support>=3&&same>=2&&opposite===0&&score>=58&&confidence>=60);
  const building=Boolean(rawSide!=='WAIT'&&!released&&!rejected&&support>=2&&score>=46);
  const stage:MarketLeadStage=rejected?'REJECTED':released?'RELEASED':armed?'ARMED':building?'BUILDING':'OBSERVE';
  const evidence:string[]=[];const add=(cond:boolean,msg:string)=>{if(cond)evidence.push(msg);};
  add(rawSide!=='WAIT'&&f.bookImbalance*dir>=s.book*.75,rawSide==='BUY'?'عمق الطلب يميل للشراء قبل السعر':'عمق العرض يميل للبيع قبل السعر');
  add(rawSide!=='WAIT'&&f.pressureChange*dir>=s.pressure*.70,'ضغط دفتر الأوامر يتسارع في نفس الاتجاه');
  add(rawSide!=='WAIT'&&f.replenishDelta*dir>=s.replenish*.70,rawSide==='BUY'?'إعادة تعبئة Bid أسرع':'إعادة تعبئة Ask أسرع');
  add(rawSide!=='WAIT'&&f.acceleration*dir>=s.acc*.65,'تسارع داخلي قبل الحركة');
  add(rawSide!=='WAIT'&&f.flowDelta*dir>=s.flow*.65,'تدفق الصفقات يؤيد الاتجاه');
  add(f.trapDetected&&f.absorptionSide===rawSide,'امتصاص/فخ سعري يؤيد الانعكاس المبكر');
  add(quiet&&rawSide!=='WAIT','السعر ما زال هادئًا نسبيًا');
  const reason=stage==='ARMED'?'ضغط خفي ثابت قبل الحركة: '+evidence.slice(0,4).join(' · '):stage==='BUILDING'?'إشارة مبكرة تتكوّن لكنها لم تثبت بالكامل: '+evidence.slice(0,3).join(' · '):stage==='RELEASED'?'الحركة بدأت بالفعل؛ تم تحويل الإشارة من توقع مبكر إلى متابعة.':stage==='REJECTED'?'السعر تحرك عكس الضغط المبكر؛ تم رفض الإشارة.':'لا يوجد ضغط سابق للحركة قوي ومستقر بما يكفي الآن.';
  const out:MarketLeadSignal={ok:true,available:true,asset,side:rawSide,stage,score,confidence,armed,released,quiet,support,opposition,stability,source:f.source,sourceAt,checkedAt:now,ageMs:Math.max(0,now-sourceAt),windowSeconds:armed?{min:2,max:20}:building?{min:3,max:30}:null,reason,evidence:evidence.slice(0,5),metrics:{bookImbalance:Number(f.bookImbalance.toFixed(2)),pressureChange:Number(f.pressureChange.toFixed(2)),replenishDelta:Number(f.replenishDelta.toFixed(2)),acceleration:Number(f.acceleration.toFixed(4)),flowDelta:Number(f.flowDelta.toFixed(2)),priceVelocity:Number(f.priceVelocity.toFixed(4)),persistence:Math.round(f.persistence),quality:Math.round(f.quality)}};
  state.signal=out;return out;
}
export function updateGoldMarketLead(fast:any,now=Date.now()):MarketLeadSignal{
  if(!fast?.ok)return offline('GOLD','Exness/MT5 DOM','DOM الذهب غير متاح الآن؛ Biquote يظل مصدر السيولة الأساسية.',now);
  const side=sideOf(fast.side);
  return evaluate('GOLD',{source:'Exness/MT5 DOM · Market Lead AI',sourceAt:Number(fast.receivedAt||fast.at||now),quality:Math.max(Number(fast.confidence||0),Number(fast.score||0)),price:Number.isFinite(Number(fast.price))?Number(fast.price):null,bookImbalance:Number(fast.bookImbalance||0),pressureChange:Number(fast.pressureChange||0),replenishDelta:Number(fast.replenishDelta||0),acceleration:Number(fast.acceleration||0),flowDelta:(side==='BUY'?1:side==='SELL'?-1:0)*Math.max(0,Number(fast.persistence||0)-50)*.55,priceVelocity:Number(fast.velocity15s||fast.velocity1s||0),persistence:Number(fast.persistence||0),absorptionSide:'WAIT',absorptionScore:0,trapDetected:false,hintSide:side},now);
}
export function updateBtcMarketLead(liq:any,now=Date.now()):MarketLeadSignal{
  if(!liq?.ok&&Number(liq?.quality||0)<45)return offline('BTC','Coinbase · Kraken · OKX microstructure','سيولة BTC غير مكتملة بما يكفي للقراءة المبكرة.',now);
  const replenish=Number(liq?.dynamics?.bidDepthChangePct||0)-Number(liq?.dynamics?.askDepthChangePct||0);
  return evaluate('BTC',{source:'Coinbase · Kraken · OKX · Market Lead AI',sourceAt:Number(liq?.checkedAt||now),quality:Number(liq?.quality||0),price:Number.isFinite(Number(liq?.book?.microprice))?Number(liq.book.microprice):null,bookImbalance:Number(liq?.book?.weightedImbalance||liq?.book?.depthImbalance||0),pressureChange:Number(liq?.dynamics?.pressureChange||0),replenishDelta:replenish,acceleration:Number(liq?.dynamics?.acceleration||0),flowDelta:Number(liq?.flow?.deltaPct||0),priceVelocity:Number(liq?.flow?.priceChangeBps||0),persistence:Math.min(100,Math.abs(Number(liq?.flow?.deltaPct||0))*1.4),absorptionSide:sideOf(liq?.absorption?.side),absorptionScore:Number(liq?.absorption?.score||0),trapDetected:Boolean(liq?.absorption?.trapDetected),hintSide:sideOf(liq?.side)},now);
}
export function getMarketLead(asset:'GOLD'|'BTC',now=Date.now()):MarketLeadSignal|null{
  const s=states[asset].signal;if(!s)return null;
  if(s.sourceAt>0&&now-s.sourceAt>8000)return {...s,stage:'OFFLINE',armed:false,available:false,reason:'انتهت صلاحية القراءة المبكرة؛ بانتظار snapshot جديد.',ageMs:now-s.sourceAt};
  return {...s,checkedAt:now,ageMs:s.sourceAt?Math.max(0,now-s.sourceAt):0};
}
