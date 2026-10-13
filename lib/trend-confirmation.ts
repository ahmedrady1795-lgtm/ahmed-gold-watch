import type {Candle} from './engine';

export type TrendSide='BUY'|'SELL'|'WAIT';
export type SupertrendReading={
  ready:boolean;side:TrendSide;line:number|null;atr:number|null;
  flipped:boolean;confirmedAt:number|null
};

/** ATR(10) / factor(3) Supertrend. Closed OHLC supplied by the caller only.
 * No volume inference, predictive probability, or future-candle look-ahead.
 */
export function supertrend(rows:readonly Candle[],period=10,factor=3):SupertrendReading{
  const empty:SupertrendReading={ready:false,side:'WAIT',line:null,atr:null,flipped:false,confirmedAt:null};
  if(!Number.isInteger(period)||period<2||!Number.isFinite(factor)||factor<=0||rows.length<period+3)return empty;
  const valid=rows.every((b,i)=>Number.isFinite(b.time)&&Number.isFinite(b.open)&&
    Number.isFinite(b.high)&&Number.isFinite(b.low)&&Number.isFinite(b.close)&&
    b.time>0&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
    b.low<=Math.min(b.open,b.close)&&(i===0||b.time>rows[i-1].time));
  if(!valid)return empty;
  const tr=(i:number)=>Math.max(rows[i].high-rows[i].low,
    Math.abs(rows[i].high-rows[i-1].close),Math.abs(rows[i].low-rows[i-1].close));
  let atr=0;
  for(let i=1;i<=period;i++)atr+=tr(i)/period;
  if(!(atr>0))return empty;
  let mid=(rows[period].high+rows[period].low)/2;
  let upper=mid+factor*atr,lower=mid-factor*atr;
  // Consistent with the conventional Supertrend initialization: down until
  // price closes above the final upper band.
  let side:TrendSide='SELL',flipped=false;
  for(let i=period+1;i<rows.length;i++){
    atr=((period-1)*atr+tr(i))/period;
    mid=(rows[i].high+rows[i].low)/2;
    const basicUpper=mid+factor*atr,basicLower=mid-factor*atr;
    const nextUpper=basicUpper<upper||rows[i-1].close>upper?basicUpper:upper;
    const nextLower=basicLower>lower||rows[i-1].close<lower?basicLower:lower;
    const nextSide:TrendSide=side==='SELL'?
      (rows[i].close>nextUpper?'BUY':'SELL'):
      (rows[i].close<nextLower?'SELL':'BUY');
    flipped=i===rows.length-1&&nextSide!==side;
    side=nextSide;upper=nextUpper;lower=nextLower;
  }
  return {ready:true,side,line:side==='BUY'?lower:upper,atr,
    flipped,confirmedAt:rows.at(-1)!.time};
}
