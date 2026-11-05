import type {EveryM1Direction} from './sniper-m1-every-direction';

/**
 * Online direction correction. ALL evidence is a frozen prediction issued
 * before its future candle; never use an OHLC backtest result as forward proof.
 * This is a research-only model selector, never a broker/trading permission.
 */
export type OnlineM1Row={
  issuedAt:number;side:'BUY'|'SELL';originalSide?:'BUY'|'SELL';
  weak:boolean;pattern?:string;
  directionObserved?:'BUY'|'SELL'|'FLAT'|'UNKNOWN'|null;
  directionEvaluatedAt?:number|null
};
export type OnlineM1Choice={
  side:'BUY'|'SELL';model:'BASELINE'|'ONLINE_INVERSION';
  group:string;priorGraded:number;trainHits:number;trainTotal:number;
  checkedHits:number;checkedTotal:number;inverted:boolean;
  reason:string
};
export const M1_ONLINE_TRAIN=24;
export const M1_ONLINE_CHECK=12;
export function chooseOnlineM1(signal:EveryM1Direction,
  historical:readonly OnlineM1Row[]):OnlineM1Choice{
  const group=(signal.pattern||'MOMENTUM')+':'+(signal.weak?'WEAK':'STRONG');
  const prepared=historical.filter(t=>t.issuedAt<signal.issuedAt&&
    t.directionEvaluatedAt!=null&&Number.isFinite(t.directionEvaluatedAt)&&
    t.directionEvaluatedAt>=t.issuedAt+60000&&
    t.directionEvaluatedAt<=signal.issuedAt&&
    t.directionObserved!=null&&['BUY','SELL'].includes(t.directionObserved)&&
    t.pattern===signal.pattern&&t.weak===signal.weak&&
    (t.originalSide==='BUY'||t.originalSide==='SELL'||
      t.side==='BUY'||t.side==='SELL'))
    .sort((a,b)=>a.issuedAt-b.issuedAt);
  const sample=prepared.slice(-(M1_ONLINE_TRAIN+M1_ONLINE_CHECK));
  const fallback=(reason:string):OnlineM1Choice=>({
    side:signal.side,model:'BASELINE',group,priorGraded:prepared.length,
    trainHits:0,trainTotal:Math.min(sample.length,M1_ONLINE_TRAIN),
    checkedHits:0,checkedTotal:Math.max(0,sample.length-M1_ONLINE_TRAIN),
    inverted:false,reason});
  if(sample.length<M1_ONLINE_TRAIN+M1_ONLINE_CHECK)return fallback(
    'تعلّم أمامي: العينة المكتملة لم تكفِ لتغيير اتجاه القناص');
  const hit=(t:OnlineM1Row)=>(t.originalSide??t.side)===t.directionObserved;
  const train=sample.slice(0,M1_ONLINE_TRAIN),check=sample.slice(M1_ONLINE_TRAIN);
  const trainHits=train.filter(hit).length,checkedHits=check.filter(hit).length;
  // 24 chronological examples are TRAIN only, following 12 are a later
  // confirmation window. Repeated selection on that check is not an
  // independent OOS success claim, and paid execution remains disabled.
  const invert=(M1_ONLINE_TRAIN-trainHits)>=17&&
    (M1_ONLINE_CHECK-checkedHits)>=9;
  return {
    side:invert?(signal.side==='BUY'?'SELL':'BUY'):signal.side,
    model:invert?'ONLINE_INVERSION':'BASELINE',group,
    priorGraded:prepared.length,trainHits,trainTotal:train.length,
    checkedHits,checkedTotal:check.length,inverted:invert,
    reason:invert?'انقلاب اتجاه بحثي بعد 24 توقعًا سابقًا و12 تحققًا لاحقًا، دون ضمان نجاح':
      'التعلّم الأمامي لم يجد دليلاً كافيًا لتغيير اتجاه القناص'
  };
}
