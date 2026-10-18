import {stabilizeSniperBias,type ObservedBias,type StableBiasState} from './sniper-stability';
import {advanceScenario,startScenario,type Scenario,type Asset} from './sniper-scorecard';

// Separate forward observation ledger. These records NEVER qualify an entry.
export type WatchMemory={state:StableBiasState|null;bias:ObservedBias|null;
  updatedAt:number;modelAt:number;rearmAfterM15:number;records:Scenario[]};
export const emptyWatch=():WatchMemory=>({state:null,bias:null,updatedAt:0,
  modelAt:0,rearmAfterM15:0,records:[]});

export function advanceWatch(previous:WatchMemory,raw:ObservedBias,asset:Asset,
  price:number|null,candles:any,now:number,modelAt:number,marketSource?:string):WatchMemory{
  // Late concurrent provider replies must not roll back server memory.
  if(modelAt<=previous.modelAt||modelAt>now||now-modelAt>90000)return previous;
  const records=previous.records.map(r=>r.status==='ACTIVE'?advanceScenario(r,candles,now,marketSource):r);
  const prior=records.at(-1);
  const reached=records.filter(r=>r.side===previous.state?.side&&r.startedAt>=previous.state.since)
    .flatMap(r=>r.targets.filter(t=>t.reachedAt!=null).map(t=>t.price));
  const saved=previous.state&&reached.length?{...previous.state,
    targets:previous.state.targets.filter(t=>!reached.includes(t.price)),
    reachedPrices:[...new Set([...(previous.state.reachedPrices||[]),...reached])]}:previous.state;
  const waitingForClose=!saved&&previous.rearmAfterM15>0&&
    (raw.m15ClosedAt||0)<=previous.rearmAfterM15;
  const stable=waitingForClose?{state:null,bias:{...raw,side:'WAIT' as const,
    targets:[],invalidation:null,rangeBound:true,label:'الاتجاه اتبطل · انتظار إغلاق هيكلي جديد',
    reason:'لا يُعاد اتجاه مبطل من نفس إغلاق M15'}}:
    stabilizeSniperBias(saved,raw,price,now);
  let rearmAfterM15=previous.rearmAfterM15;
  const invalidated=previous.state!=null&&stable.state==null&&raw.active;
  if(invalidated)rearmAfterM15=Math.max(rearmAfterM15,raw.m15ClosedAt||0);
  if(prior?.status==='ACTIVE'&&stable.state&&prior.side!==stable.state.side&&raw.active){
    // A confirmed structural reversal retires the old path without pretending
    // its remaining objectives were reached. Incomplete coverage stays unknown.
    const covered=prior.lastBarOpen!=null&&now-(prior.lastBarOpen+60000)<=120000;
    records[records.length-1]={...prior,status:covered?'REVERSED':'UNOBSERVED',
      resolvedAt:now,resolvedPrice:covered?price:null,
      note:covered?'انعكاس مؤكد؛ أُغلق مسار المراقبة السابق':'انعكاس مع متابعة ناقصة؛ النتيجة غير محسومة'};
  }
  const latest=records.at(-1);
  // Do not issue repeated predictions from one bar or revive a reached level.
  const canStart=(!latest||latest.status!=='ACTIVE'&&now-(latest.resolvedAt||latest.startedAt)>=15*60000)&&
    (raw.m15ClosedAt||0)>rearmAfterM15;
  if(canStart&&stable.bias.active&&stable.state&&price!=null&&stable.bias.invalidation!=null){
    const record=startScenario({asset,side:stable.state.side,at:now,modelAt,price,
      stop:stable.bias.invalidation,confidence:0,targets:stable.bias.targets,
      durationMs:8*3600000,purpose:'OBSERVATION',marketSource});
    if(record){
      record.note='رصد بعيد مسجل لمدة تقييم أقصاها 8 ساعات؛ ليست موعد وصول أو إشارة دخول';
      records.push(record);
    }
  }
  return {state:stable.state,bias:stable.bias,updatedAt:now,modelAt,rearmAfterM15,
    records:records.slice(-600)};
}
