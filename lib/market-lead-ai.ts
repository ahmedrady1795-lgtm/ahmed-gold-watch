type Side='BUY'|'SELL'|'WAIT';
export type MarketLeadStage='OFFLINE'|'OBSERVE'|'BUILDING'|'ARMED'|'RELEASED'|'REJECTED';

type LeadFeatures={
  source:string;sourceAt:number;quality:number;price:number|null;
  bookImbalance:number;pressureChange:number;replenishDelta:number;acceleration:number;
  flowDelta:number;priceVelocity:number;persistence:number;
  absorptionSide:Side;absorptionScore:number;trapDetected:boolean;hintSide:Side;domAvailable?:boolean;
};
export type MarketLeadSignal={
  ok:boolean;available:boolean;asset:'GOLD'|'BTC';side:Side;stage:MarketLeadStage;mode:'DOM'|'MICRO_FLOW'|'CROSS_EXCHANGE'|'OFFLINE';
  score:number;confidence:number;armed:boolean;released:boolean;quiet:boolean;
  support:number;opposition:number;stability:number;source:string;sourceAt:number;
  checkedAt:number;ageMs:number;windowSeconds:{min:number;max:number}|null;
  reason:string;evidence:string[];
  metrics:{bookImbalance:number;pressureChange:number;replenishDelta:number;acceleration:number;flowDelta:number;priceVelocity:number;persistence:number;quality:number};
};
type LeadState={lastSourceAt:number;lastMode:string;history:Array<{at:number;side:Side;score:number}>;signal:MarketLeadSignal|null};
const states:Record<'GOLD'|'BTC',LeadState>={
  GOLD:{lastSourceAt:0,lastMode:'',history:[],signal:null},
  BTC:{lastSourceAt:0,lastMode:'',history:[],signal:null}
};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const sideOf=(v:any):Side=>v==='BUY'||v==='SELL'?v:'WAIT';
const norm=(v:number,scale:number)=>clamp(v/Math.max(.0001,scale),-1.35,1.35);
const signFor=(s:Side)=>s==='BUY'?1:s==='SELL'?-1:0;
function offline(asset:'GOLD'|'BTC',source:string,reason:string,now:number):MarketLeadSignal{
  return {ok:true,available:false,asset,side:'WAIT',stage:'OFFLINE',mode:'OFFLINE',score:0,confidence:0,armed:false,released:false,quiet:false,support:0,opposition:0,stability:0,source,sourceAt:0,checkedAt:now,ageMs:0,windowSeconds:null,reason,evidence:[],metrics:{bookImbalance:0,pressureChange:0,replenishDelta:0,acceleration:0,flowDelta:0,priceVelocity:0,persistence:0,quality:0}};
}
function evaluate(asset:'GOLD'|'BTC',f:LeadFeatures,now=Date.now(),mode:'DOM'|'MICRO_FLOW'|'CROSS_EXCHANGE'='DOM'):MarketLeadSignal{
  const state=states[asset],sourceAt=Number(f.sourceAt||0);
  if(!Number.isFinite(sourceAt)||sourceAt<=0||sourceAt>now+1500||now-sourceAt>8000||Number(f.quality||0)<30){
    const out=offline(asset,f.source,'مصدر القراءة المبكرة غير حديث أو جودته غير كافية.',now);
    state.history=[];state.lastSourceAt=0;state.lastMode='';state.signal=out;return out;
  }
  // Do not reuse old or price-only votes after a disconnect or feed switch.
  if(state.lastMode!==mode||state.lastSourceAt>sourceAt||
    (state.lastSourceAt>0&&sourceAt-state.lastSourceAt>15000)){
    state.history=[];state.lastSourceAt=0;
  }
  state.lastMode=mode;
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
  const actualBook=asset==='GOLD'&&mode==='DOM'&&f.domAvailable===true;
  // Only independent, validated broker depth can arm a GOLD pre-move alert.
  // A recycled tick-side vote or price acceleration is insufficient.
  const independentBookLead=actualBook&&f.bookImbalance*dir>=s.book*.65&&
    (f.pressureChange*dir>=s.pressure*.4||f.replenishDelta*dir>=s.replenish*.4);
  const earlyEvidence=asset==='GOLD'?independentBookLead:mode==='CROSS_EXCHANGE';
  const armed=Boolean(rawSide!=='WAIT'&&!released&&!rejected&&quiet&&earlyEvidence&&
    support>=3&&same>=2&&opposite===0&&score>=58&&confidence>=60);
  const building=Boolean(rawSide!=='WAIT'&&!released&&!rejected&&support>=2&&score>=46);
  const stage:MarketLeadStage=rejected?'REJECTED':released?'RELEASED':armed?'ARMED':building?'BUILDING':'OBSERVE';
  const evidence:string[]=[];const add=(cond:boolean,msg:string)=>{if(cond)evidence.push(msg);};
  add(rawSide!=='WAIT'&&(asset==='BTC'||actualBook)&&f.bookImbalance*dir>=s.book*.75,rawSide==='BUY'?'عمق الطلب يميل للشراء قبل السعر':'عمق العرض يميل للبيع قبل السعر');
  add(rawSide!=='WAIT'&&(asset==='BTC'||actualBook)&&f.pressureChange*dir>=s.pressure*.70,'ضغط دفتر الأوامر يتسارع في نفس الاتجاه');
  add(rawSide!=='WAIT'&&(asset==='BTC'||actualBook)&&f.replenishDelta*dir>=s.replenish*.70,rawSide==='BUY'?'إعادة تعبئة Bid أسرع':'إعادة تعبئة Ask أسرع');
  add(rawSide!=='WAIT'&&f.acceleration*dir>=s.acc*.65,'تسارع داخلي قبل الحركة');
  add(rawSide!=='WAIT'&&f.flowDelta*dir>=s.flow*.65,'تدفق الصفقات يؤيد الاتجاه');
  add(f.trapDetected&&f.absorptionSide===rawSide,'امتصاص/فخ سعري يؤيد الانعكاس المبكر');
  add(quiet&&rawSide!=='WAIT','السعر ما زال هادئًا نسبيًا');
  const reason=stage==='ARMED'?'ضغط دفتر أوامر حيّ قبل الحركة (ليس ضمانًا): '+evidence.slice(0,4).join(' · '):stage==='BUILDING'?'إشارة مبكرة تتكوّن لكنها لم تثبت بالكامل: '+evidence.slice(0,3).join(' · '):stage==='RELEASED'?'الحركة بدأت بالفعل؛ تم تحويل الإشارة من توقع مبكر إلى متابعة.':stage==='REJECTED'?'السعر تحرك عكس الضغط المبكر؛ تم رفض الإشارة.':'لا يوجد ضغط سابق للحركة قوي ومستقر بما يكفي الآن.';
  const out:MarketLeadSignal={ok:true,available:true,asset,side:rawSide,stage,mode,score,confidence,armed,released,quiet,support,opposition,stability,source:f.source,sourceAt,checkedAt:now,ageMs:Math.max(0,now-sourceAt),windowSeconds:null, // No measured time-to-move window without walk-forward evidence.
  reason,evidence:evidence.slice(0,5),metrics:{bookImbalance:Number(f.bookImbalance.toFixed(2)),pressureChange:Number(f.pressureChange.toFixed(2)),replenishDelta:Number(f.replenishDelta.toFixed(2)),acceleration:Number(f.acceleration.toFixed(4)),flowDelta:Number(f.flowDelta.toFixed(2)),priceVelocity:Number(f.priceVelocity.toFixed(4)),persistence:Math.round(f.persistence),quality:Math.round(f.quality)}};
  state.signal=out;return out;
}
/** Separate price-only candidate. This is NOT DOM, executed order flow,
 * or an order entry. Requires an actually observed quiet PRE_TRIGGER window,
 * and rejects a move that already ran during the prior eight seconds. */
function goldPriceWatch(wave:any,now:number):MarketLeadSignal|null{
 const sourceAt=Number(wave?.at),v3=Number(wave?.velocity3s),
   v8=Number(wave?.velocity8s),acc=Number(wave?.acceleration);
 const side=sideOf(wave?.side),quality=Number(wave?.confidence);
 if(!wave?.ok||!Number.isFinite(sourceAt)||sourceAt<=0||
   sourceAt>now+1500||now-sourceAt>4500||side==='WAIT'||
   wave?.stage!=='PRE_TRIGGER'||Number(wave?.samples)<7||
   Number(wave?.persistence)<62||!Number.isFinite(quality)||quality<48||
   !Number.isFinite(v3)||Math.abs(v3)>1.05||
   !Number.isFinite(v8)||Math.abs(v8)>2.2||
   !Number.isFinite(acc)||Math.abs(acc)<.16)return null;
 const evidence=['تسارع تغيرات السعر قبل كسر مرصود',
   'سرعة السعر خلال 8 ثوانٍ لم تصل لاندفاع مطارد',
   'اتجاه التيكات متكرر؛ لا يوجد عمق أوامر موثق'];
 const out:MarketLeadSignal={
   ...offline('GOLD','Gold price-tick observation',evidence.join(' · '),now),
   available:true,side,stage:'BUILDING',mode:'MICRO_FLOW',quiet:true,
   score:Math.min(70,Math.max(0,Math.round(Number(wave.score)||0))),
   confidence:Math.min(75,Math.round(quality)),support:2,
   stability:Math.min(100,Math.round(Number(wave.persistence)||0)),
   source:'Gold live price-tick watch · no broker DOM',
   sourceAt,ageMs:Math.max(0,now-sourceAt),
   reason:'رصد سعري مبكر محتمل، وليس إشارة دخول أو ضغط أوامر مثبتًا. '+evidence.join(' · '),
   evidence,
   metrics:{bookImbalance:0,pressureChange:0,replenishDelta:0,
     acceleration:Number(acc.toFixed(4)),flowDelta:0,
     priceVelocity:Number(v3.toFixed(4)),
     persistence:Math.round(Number(wave.persistence)),quality:Math.round(quality)}
 };
 const state=states.GOLD;
 state.history=[];state.lastSourceAt=0;state.lastMode='MICRO_FLOW';
 state.signal=out;
 return out;
}
function goldOffline(source:string,reason:string,now:number):MarketLeadSignal{
  const state=states.GOLD;
  state.history=[];state.lastSourceAt=0;state.lastMode='';
  const out=offline('GOLD',source,reason,now);
  state.signal=out;
  return out;
}
export function updateGoldMarketLead(fast:any,now=Date.now(),wave:any=null):MarketLeadSignal{
  // A missing true MarketBookGet remains an explicit, independently tested
  // absence of DOM. Only the read-only PRICE WATCH may use another feed.
  const noVerifiedBrokerDepth=Boolean(fast?.ok&&fast.domReady!==true);
  // Do NOT label price-only MT5 ticks as authenticated DOM pressure.
  // Brokers may not provide MarketBookGet for spot XAUUSD at all.
  if(fast?.ok&&fast.domReady===true){
    return evaluate('GOLD',{
      source:'Exness/MT5 DOM · Market Lead AI',
      sourceAt:Number(fast.receivedAt||fast.at||now),
      quality:Math.max(Number(fast.confidence||0),Number(fast.score||0)),
      price:Number.isFinite(Number(fast.price))?Number(fast.price):null,
      bookImbalance:Number(fast.bookImbalance||0),
      pressureChange:Number(fast.pressureChange||0),
      replenishDelta:Number(fast.replenishDelta||0),
      acceleration:Number(fast.acceleration||0),
      flowDelta:0, // Tick-direction persistence is not signed executed trade flow.
      priceVelocity:Number(fast.velocity15s||fast.velocity1s||0),
      persistence:Number(fast.persistence||0),
      absorptionSide:'WAIT',absorptionScore:0,trapDetected:false,hintSide:'WAIT',domAvailable:fast.domReady===true
    },now,'DOM');
  }
  // Price-only watch remains visible even when an MT5 tick feed has no DOM.
  const priceWatch=goldPriceWatch(wave,now);
  if(priceWatch)return priceWatch;
  if(wave?.ok&&Number(wave?.at||0)>0&&Number(wave.at)<=now+1500&&now-Number(wave.at)<=4500){
    const side=sideOf(wave.side);
    return evaluate('GOLD',{
      source:'Gold price-tick proxy · no broker depth or signed trades',
      sourceAt:Number(wave.at),
      quality:Math.max(Number(wave.confidence||0),Number(wave.score||0)),
      price:null,
      bookImbalance:0, // Tick direction is not an order book.
      pressureChange:0,
      replenishDelta:0,
      acceleration:Number(wave.acceleration||0),
      flowDelta:0, // No signed execution prints.
      priceVelocity:Number(wave.velocity1s||0),
      persistence:Number(wave.persistence||0),
      absorptionSide:'WAIT',absorptionScore:0,trapDetected:false,hintSide:side,domAvailable:false
    },now,'MICRO_FLOW');
  }
  if(noVerifiedBrokerDepth)return goldOffline('MT5 broker depth',
    'تغذية MT5 السعرية موجودة لكن لا توجد ثلاث عينات عمق وسيط موثوقة؛ DOM غير مؤهل.',now);
  return goldOffline('Live gold microstructure','لا يوجد DOM أو Biquote micro-flow حديث الآن.',now);
}
export function updateBtcMarketLead(liq:any,now=Date.now()):MarketLeadSignal{
  if(!liq?.ok||!Number.isFinite(Number(liq?.checkedAt))||Number(liq.checkedAt)<=0||Number(liq.checkedAt)>now+1500||now-Number(liq.checkedAt)>8000){
    const state=states.BTC;
    state.history=[];state.lastSourceAt=0;state.lastMode='';
    const out=offline('BTC','Coinbase · Kraken · OKX microstructure','مصدر سيولة BTC غير مؤكد أو قديم؛ تم تعطيل إشارة الحركة المبكرة.',now);
    state.signal=out;return out;
  }
  const replenish=Number(liq?.dynamics?.bidDepthChangePct||0)-Number(liq?.dynamics?.askDepthChangePct||0);
  return evaluate('BTC',{source:'Coinbase · Kraken · OKX · Market Lead AI',sourceAt:Number(liq?.checkedAt||now),quality:Number(liq?.quality||0),price:Number.isFinite(Number(liq?.book?.microprice))?Number(liq.book.microprice):null,bookImbalance:Number(liq?.book?.weightedImbalance||liq?.book?.depthImbalance||0),pressureChange:Number(liq?.dynamics?.pressureChange||0),replenishDelta:replenish,acceleration:Number(liq?.dynamics?.acceleration||0),flowDelta:Number(liq?.flow?.deltaPct||0),priceVelocity:Number(liq?.flow?.priceChangeBps||0),persistence:Math.min(100,Math.abs(Number(liq?.flow?.deltaPct||0))*1.4),absorptionSide:sideOf(liq?.absorption?.side),absorptionScore:Number(liq?.absorption?.score||0),trapDetected:Boolean(liq?.absorption?.trapDetected),hintSide:sideOf(liq?.side)},now,'CROSS_EXCHANGE');
}
export function getMarketLead(asset:'GOLD'|'BTC',now=Date.now()):MarketLeadSignal|null{
  const s=states[asset].signal;if(!s)return null;
  if(s.sourceAt>0&&now-s.sourceAt>8000)return {...s,stage:'OFFLINE',armed:false,available:false,reason:'انتهت صلاحية القراءة المبكرة؛ بانتظار snapshot جديد.',ageMs:now-s.sourceAt};
  return {...s,checkedAt:now,ageMs:s.sourceAt?Math.max(0,now-s.sourceAt):0};
}
