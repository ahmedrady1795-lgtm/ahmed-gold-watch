import type {ForecastJournal} from './forecast-journal';
import type {Scenario} from './sniper-scorecard';

export function scenarioAsJournal(record:Scenario|null|undefined):ForecastJournal|null{
  if(!record)return null;
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
