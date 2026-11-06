/** Causal paired, forward-only M1 direction evidence.
 * Each baseline uses ONLY the last CLOSED candle available at issuance.
 * Broker fills, backtests, paper P/L, and retrofitted legacy samples never
 * contribute. A directional result is never a claim about profitability.
 */
type Side='BUY'|'SELL';
export type DirectionPair={
  side:Side;baselineSide?:Side|null;
  directionObserved?:Side|'FLAT'|'UNKNOWN'|null;
  issuedAt:number;directionEvaluatedAt?:number|null;
};
const pct=(x:number)=>Number(x.toFixed(2));
function wilsonLower(hits:number,n:number){
  if(n<=0)return null;
  const z=1.959963984540054,z2=z*z,p=hits/n;
  return (p+z2/(2*n)-z*Math.sqrt((p*(1-p)+z2/(4*n))/n))/(1+z2/n);
}
export function auditPairedM1Direction(records:readonly DirectionPair[]){
  const rows=records.filter(t=>
    (t.baselineSide==='BUY'||t.baselineSide==='SELL')&&
    (t.directionObserved==='BUY'||t.directionObserved==='SELL')&&
    Number.isFinite(t.issuedAt)&&Number.isFinite(t.directionEvaluatedAt)&&
    Number(t.directionEvaluatedAt)>=t.issuedAt+60000);
  let modelHits=0,baselineHits=0,modelOnly=0,baselineOnly=0;
  for(const t of rows){
    const model=t.side===t.directionObserved;
    const baseline=t.baselineSide===t.directionObserved;
    if(model)modelHits++;
    if(baseline)baselineHits++;
    if(model&&!baseline)modelOnly++;
    if(baseline&&!model)baselineOnly++;
  }
  const n=rows.length,discordant=modelOnly+baselineOnly;
  const modelWinLower95=wilsonLower(modelOnly,discordant);
  // This is a research candidate, not independent statistical proof; M1
  // outcomes can be autocorrelated and the adaptive model evolves online.
  const sufficient=n>=100&&discordant>=25;
  const status=!sufficient?'COLLECTING':
    modelWinLower95!=null&&modelWinLower95>.5?'FORWARD_EDGE_CANDIDATE':
    'NO_DEMONSTRATED_EDGE';
  return {
    status,n,requiredN:100,discordant,requiredDiscordant:25,
    modelHits,baselineHits,modelOnly,baselineOnly,
    modelAccuracyPct:n?pct(modelHits/n*100):null,
    baselineAccuracyPct:n?pct(baselineHits/n*100):null,
    liftPctPoints:n?pct((modelHits-baselineHits)/n*100):null,
    pairedWinLower95Pct:modelWinLower95==null?null:pct(modelWinLower95*100),
    note:'Paired forward M1 vs last CLOSED candle; no future leakage, not Exness fills or proof of profit.'
  };
}
