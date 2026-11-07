/** Fast, strictly PAST-only research regime recovery for M1.
 * The main pressure model must fail in BOTH chronological eight-candle
 * windows; the challenger must win in BOTH. Never treat this selection
 * window as independent forward validation or a profitable trade.
 */
export type M1RecoveryModel='BODY_FOLLOW'|'BODY_FADE'|'THREE_CLOSE';
export type M1RecoveryRow={
 pressure:'BUY'|'SELL';bodyFollow:'BUY'|'SELL';
 bodyFade:'BUY'|'SELL';threeClose:'BUY'|'SELL';
 observed:'BUY'|'SELL';
};
export type M1Recovery={model:M1RecoveryModel|null;
 trainN:number;checkN:number;pressureTrain:number;pressureCheck:number;
 challengerTrain:number;challengerCheck:number};
const candidate=[
 ['BODY_FOLLOW','bodyFollow'],['BODY_FADE','bodyFade'],['THREE_CLOSE','threeClose']
] as const;
const hits=(rows:readonly M1RecoveryRow[],key:keyof M1RecoveryRow)=>
 rows.filter(r=>r[key]===r.observed).length;
export function selectM1RegimeRecovery(
 older:readonly M1RecoveryRow[],later:readonly M1RecoveryRow[]
):M1Recovery{
 const plain=(model:M1RecoveryModel|null,ct=0,cc=0):M1Recovery=>({
   model,trainN:older.length,checkN:later.length,
   pressureTrain:hits(older,'pressure'),pressureCheck:hits(later,'pressure'),
   challengerTrain:ct,challengerCheck:cc
 });
 if(older.length<8||later.length<8)return plain(null);
 const p1=hits(older,'pressure'),p2=hits(later,'pressure');
 // No auto-reversal based on a single bad screenshot or one short streak.
 if(p1>3||p2>3)return plain(null);
 let best:M1Recovery|null=null;
 for(const [model,key] of candidate){
   const h1=hits(older,key),h2=hits(later,key);
   if(h1<6||h2<6||h1-p1<3||h2-p2<3)continue;
   const proposal=plain(model,h1,h2);
   if(!best||h1+h2>best.challengerTrain+best.challengerCheck)
     best=proposal;
 }
 return best??plain(null);
}
