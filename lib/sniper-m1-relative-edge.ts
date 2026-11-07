/**
 * Past-only relative-edge gate. The old M1 recovery required pressure to
 * crash below 4/8 before considering a challenger. This rule also catches a
 * challenger that beats an adequate-but-lagging pressure predictor.
 *
 * Rows must be generated strictly before the target minute. The first window
 * selects ONE hypothesis, the disjoint later window checks it; no result in
 * either window is a claim about profitability or independent future proof.
 */
export type M1EdgeSide='BUY'|'SELL';
export type M1EdgeModel='BODY_FOLLOW'|'BODY_FADE'|'THREE_CLOSE'|'EXHAUSTION_FADE';
export type M1EdgeRow={
 pressure:M1EdgeSide;bodyFollow:M1EdgeSide;bodyFade:M1EdgeSide;
 threeClose:M1EdgeSide;exhaustionFade:M1EdgeSide;actual:M1EdgeSide
};
export type M1RelativeEdge={
 model:M1EdgeModel|null;trainN:number;checkN:number;
 trainHits:number;trainBaselineHits:number;trainPressureHits:number;
 checkHits:number;checkBaselineHits:number;checkPressureHits:number;
 reason:string
};
const candidates=[
 ['BODY_FOLLOW','bodyFollow'],['BODY_FADE','bodyFade'],
 ['THREE_CLOSE','threeClose'],['EXHAUSTION_FADE','exhaustionFade']
] as const;
const hits=(rows:readonly M1EdgeRow[],key:keyof M1EdgeRow)=>
 rows.filter(r=>r[key]===r.actual).length;
export function selectM1RelativeEdge(
 train:readonly M1EdgeRow[],check:readonly M1EdgeRow[]
):M1RelativeEdge{
 const p1=hits(train,'pressure'),p2=hits(check,'pressure');
 const b1=hits(train,'bodyFollow'),b2=hits(check,'bodyFollow');
 const none=(reason:string):M1RelativeEdge=>({
   model:null,trainN:train.length,checkN:check.length,trainHits:0,
   trainBaselineHits:b1,trainPressureHits:p1,checkHits:0,
   checkBaselineHits:b2,checkPressureHits:p2,reason
 });
 if(train.length<10||check.length<10)return none('insufficient consecutive historical comparison');
 // Choose from TRAIN only: candidate can't see the later CHECK when selected.
 const ranked=candidates.map(([model,key],i)=>({
   model,key,i,train:hits(train,key)
 })).sort((a,b)=>b.train-a.train||a.i-b.i);
 const best=ranked[0];
 if(!best||best.train<Math.ceil(train.length*.66)||
   best.train-p1<2||best.train-b1<2)
   return none('no significant train advantage versus pressure and simple body');
 const later=hits(check,best.key);
 if(later<Math.ceil(check.length*.64)||later-p2<2||later-b2<2)
   return none('selected challenger failed later chronological check');
 return {
   model:best.model,trainN:train.length,checkN:check.length,
   trainHits:best.train,trainBaselineHits:b1,trainPressureHits:p1,
   checkHits:later,checkBaselineHits:b2,checkPressureHits:p2,
   reason:'two-window historical lift vs pressure AND simple last body; prospective accuracy still unknown'
 };
}
