import type {buildSniperOutlook} from './sniper-outlook';

type Sniper=ReturnType<typeof buildSniperOutlook>;
export type ScenarioTarget={
  stage:1|2|3;price:number;low:number;high:number;quality:number;kind:string;source?:string;distanceAtr?:number;reached:boolean
};
export type ForecastJournal={
  side:'BUY'|'SELL';
  startPrice:number;invalidation:number;confidence:number;targets:ScenarioTarget[];
  capturedAt:number;modelAt:number;expiresAt:number;lastConfirmedAt:number;
  state:'ACTIVE'|'MONITORING'|'STALE'|'UNQUALIFIED'|'TP_REACHED'|'INVALIDATED'|'EXPIRED';
  message:string;
};
const finite=(x:any)=>x!=null&&Number.isFinite(Number(x))?Number(x):null;
const beforeStop=(side:'BUY'|'SELL',price:number,stop:number)=>
  side==='BUY'?price>stop:price<stop;
const reached=(side:'BUY'|'SELL',price:number,goal:number)=>
  side==='BUY'?price>=goal:price<=goal;
const suitable=(s:Sniper)=>s.view.side!=='WAIT'&&s.view.priceFresh&&s.view.forecastFresh&&
  s.view.price!=null&&s.view.invalidation!=null&&s.targets.length>0;
const MAX_HISTORY=3*60*60*1000;
const MAX_LIFETIME=90*60*1000;
function start(s:Sniper,now:number,modelAt:number):ForecastJournal{
  const side=s.view.side as 'BUY'|'SELL';
  const suggested=Number(s.activation?.max||0)*60*1000;
  // One forecast has a fixed expiry; polling the same snapshot must never refresh it.
  const lifetime=Math.min(MAX_LIFETIME,Math.max(45*60*1000,(suggested||15*60*1000)*4));
  return {
    side,startPrice:s.view.price!,invalidation:s.view.invalidation!,
    confidence:Number(s.view.confidence||0),
    targets:s.targets.map(t=>({...t,reached:false})),
    capturedAt:now,modelAt,expiresAt:now+lifetime,lastConfirmedAt:now,
    state:'ACTIVE',message:'سيناريو مرصود · الأهداف ثابتة لحين تغيّر مؤكد'
  };
}
export function updateForecastJournal(
  previous:ForecastJournal|null,s:Sniper,now:number,modelTime:number
):ForecastJournal|null{
  const modelAt=finite(modelTime)??0;
  const usable=suitable(s);
  const quote=s.view.priceFresh?s.view.price:null;
  const live=quote!=null&&Number.isFinite(quote);
  const freshModel=s.view.forecastFresh&&modelAt>0&&now-modelAt>=0&&now-modelAt<=90000;

  if(!previous){
    return usable&&freshModel?start(s,now,modelAt):null;
  }
  // Keep only a clearly identified inactive historical record, not a permanent
  // 'live' trade. Future forecasts can replace expired or stopped records.
  if(now-previous.capturedAt>MAX_HISTORY){
    return usable&&freshModel?start(s,now,modelAt):null;
  }
  const stopHit=live&&!beforeStop(previous.side,quote!,previous.invalidation);
  // A single sampled quote cannot prove which level was touched first inside a candle.
  // When a stop is observed, do not credit fresh TP hits on the same update.
  // Expired or invalidated scenarios must not collect fresh target hits.
  const canMark=live&&!stopHit&&previous.state!=='INVALIDATED'&&previous.state!=='EXPIRED'&&now<previous.expiresAt;
  const nextTargets=previous.targets.map(t=>({...t,
    reached:t.reached||(canMark&&reached(previous.side,quote!,t.price))}));
  const hitCount=nextTargets.filter(t=>t.reached).length;
  const targetReached=hitCount>0;
  const expired=now>=previous.expiresAt;
  const hardStop=previous.state==='INVALIDATED'||stopHit;

  // Even an opposing signal cannot erase evidence of an invalidated scenario
  // until it is a fresh, separately produced model snapshot.
  const replacement=usable&&freshModel&&
    s.view.side!==previous.side&&
    modelAt>previous.modelAt;
  if(replacement)return start(s,now,modelAt);

  if(hardStop){
    const updated={...previous,targets:nextTargets,state:'INVALIDATED' as const,
      message:'اتلغى بكسر مستوى الإبطال · الأهداف محفوظة كسجل وليست إشارة'};
    return updated;
  }
  if(expired){
    if(usable&&freshModel&&modelAt>previous.modelAt+5000&&
       !targetReached)return start(s,now,modelAt);
    return {...previous,targets:nextTargets,state:'EXPIRED',
      message:'انتهت صلاحية السيناريو · الأهداف للرجوع فقط'} as ForecastJournal;
  }
  if(targetReached){
    return {...previous,targets:nextTargets,state:'TP_REACHED',
      message:'تحقق '+nextTargets.filter(t=>t.reached).map(t=>'TP'+t.stage).join('، ')+
        ' · باقي المستويات تحت المراقبة'} as ForecastJournal;
  }

  if(!live||!freshModel){
    return {...previous,targets:nextTargets,state:'STALE',
      message:'آخر سعر أو تحليل متأخر · الأهداف محفوظة ولكنها غير نشطة'} as ForecastJournal;
  }
  if(s.view.quality==='UNQUALIFIED'){
    return {...previous,targets:nextTargets,state:'UNQUALIFIED',
      message:'الدقة التاريخية غير مؤهلة · الأهداف تحت المراجعة'} as ForecastJournal;
  }
  const sameSide=usable&&s.view.side===previous.side;
  // Near-term recalculations can improve confidence but cannot continuously
  // rewrite the old target ladder. Fresh opposite forecasts get a NEW scenario.
  if(sameSide){
    const evidenceAt=Math.max(previous.modelAt,modelAt);
    return {...previous,targets:nextTargets,lastConfirmedAt:now,modelAt:evidenceAt,
      confidence:Math.round(Math.min(89,Number(s.view.confidence||previous.confidence))),
      state:'ACTIVE',message:'الأهداف مثبتة · التحديثات الصغيرة لا تغيّر المستويات'};
  }
  return {...previous,targets:nextTargets,state:'MONITORING',
    message:'تأكيد الاتجاه ضعُف مؤقتًا · الأهداف معلّقة وليست توصية دخول'} as ForecastJournal;
}
