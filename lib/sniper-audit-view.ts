import type {ForecastJournal} from './forecast-journal';
import type {Scenario} from './sniper-scorecard';

export function watchForChart(audit:any,asset:'GOLD'|'BTC',now:number,loaded:boolean){
  const at=Number(audit?.updatedAt||0),watch=audit?.watch?.[asset];
  const connected=Boolean(loaded&&at>0&&at<=now&&now-at<90000);
  const watchAt=Number(watch?.updatedAt||0),modelAt=Number(watch?.modelAt||0);
  const fresh=Boolean(connected&&watchAt>0&&watchAt<=now&&now-watchAt<90000&&
    modelAt>0&&modelAt<=now&&now-modelAt<90000&&!watch?.stale);
  return {connected,durable:connected&&audit?.persistence==='VOLUME',fresh,
    state:watch?.state??null,
    bias:watch?.bias?(fresh?watch.bias:{...watch.bias,active:false,status:'PAUSED'}):null};
}

export function scenarioAsJournal(record:Scenario|null|undefined):ForecastJournal|null{
  if(!record||record.purpose==='OBSERVATION')return null;
  const state:ForecastJournal['state']=record.status==='ACTIVE'?'ACTIVE':
    record.status==='COMPLETED'?'TP_REACHED':
    record.status==='STOPPED'?'INVALIDATED':
    record.status==='EXPIRED'?'EXPIRED':
    record.status==='AMBIGUOUS'?'UNQUALIFIED':'STALE';
  return {
    side:record.side,startPrice:record.entry,invalidation:record.stop,
    confidence:record.confidence,
    targets:record.targets.map(t=>({
      stage:t.stage,price:t.price,low:t.low,high:t.high,quality:t.quality,
      kind:t.kind,reached:t.reachedAt!=null
    })),
    capturedAt:record.startedAt,modelAt:record.modelAt,expiresAt:record.expiresAt,
    lastConfirmedAt:record.lastCheckedAt,state,
    message:record.note+(record.status==='ACTIVE'?' · مُسجل في سجل الأداء':' · للرجوع وليس إشارة دخول')
  };
}
