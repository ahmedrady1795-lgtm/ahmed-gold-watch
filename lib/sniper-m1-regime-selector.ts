import type {M1MarketRegime} from './sniper-m1-market-regime';
type Side='BUY'|'SELL';
export type RegimeExpert='BODY_FOLLOW'|'BODY_FADE'|'THREE_CLOSE'|'EXHAUSTION_FADE';
export type RegimeExpertRow={
 regime:M1MarketRegime;observed:Side;pressure:Side;bodyFollow:Side;
 bodyFade:Side;threeClose:Side;exhaustionFade:Side
};
export type RegimeExpertDecision={
 model:RegimeExpert|null;trainN:number;checkN:number;trainHits:number;
 checkHits:number;trainPressureHits:number;checkPressureHits:number;
 trainBodyHits:number;checkBodyHits:number;reason:string;
 approvedForTrading:false
};
const candidates=[
 ['BODY_FOLLOW','bodyFollow'],['BODY_FADE','bodyFade'],
 ['THREE_CLOSE','threeClose'],['EXHAUSTION_FADE','exhaustionFade']
] as const;
const hits=(a:readonly RegimeExpertRow[],key:keyof RegimeExpertRow)=>
 a.filter(x=>x[key]===x.observed).length;
/** One candidate selected on OLD historical M1 outcomes, then checked on
 * the nonoverlapping later cohort of the SAME currently observed regime.
 * If regime drifts or there are fewer than 8+8 applicable cases: abstain.
 * It doesn't establish independent out-of-sample trading performance.
 */
export function selectRegimeM1Expert(
 regime:M1MarketRegime,older:readonly RegimeExpertRow[],
 later:readonly RegimeExpertRow[]
):RegimeExpertDecision{
 const train=older.filter(r=>r.regime===regime),check=later.filter(r=>r.regime===regime);
 const tP=hits(train,'pressure'),cP=hits(check,'pressure');
 const tB=hits(train,'bodyFollow'),cB=hits(check,'bodyFollow');
 const blank=(reason:string):RegimeExpertDecision=>({
   model:null,trainN:train.length,checkN:check.length,
   trainHits:0,checkHits:0,trainPressureHits:tP,checkPressureHits:cP,
   trainBodyHits:tB,checkBodyHits:cB,reason,approvedForTrading:false
 });
 if(['INVALID','LOW_ACTIVITY'].includes(regime))
   return blank('low-activity or invalid M1 cannot justify a regime switch');
 if(train.length<8||check.length<8)return blank('insufficient same-regime closed bars in both windows');
 const ranked=candidates.map(([model,key],priority)=>({
  model,key,priority,trainHits:hits(train,key)
 })).sort((a,b)=>b.trainHits-a.trainHits||a.priority-b.priority);
 const top=ranked[0];
 if(top.trainHits<Math.ceil(train.length*.69)||
   top.trainHits-tP<2||top.trainHits-tB<2)
   return blank('no superiority to pressure AND last closed candle in selection window');
 const checked=hits(check,top.key);
 if(checked<Math.ceil(check.length*.65)||checked-cP<2||checked-cB<2)
   return blank('chosen candidate failed later same-regime validation');
 return {model:top.model,trainN:train.length,checkN:check.length,
   trainHits:top.trainHits,checkHits:checked,
   trainPressureHits:tP,checkPressureHits:cP,
   trainBodyHits:tB,checkBodyHits:cB,approvedForTrading:false,
   reason:'past-only regime-specific challenger; research hypothesis until new frozen M1 outcomes'};
}
