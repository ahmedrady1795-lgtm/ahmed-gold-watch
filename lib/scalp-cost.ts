// Same round-trip assumptions as the scalp desk, including fees and slippage.
// These are estimated venue costs, never a claim of an Exness executable quote.
export function learnerCostAtr(asset:'GOLD'|'BTC',price:number|null,atr:number|null,spread:number|null,env:Record<string,string|undefined>=process.env){
  if(price==null||atr==null||!Number.isFinite(price)||!Number.isFinite(atr)||price<=0||atr<=0)return NaN;
  const configured=(key:string,fallback:number)=>{
    const raw=env[key];if(raw==null||raw==='')return fallback;
    const value=Number(raw);return Number.isFinite(value)&&value>=0&&value<=100?value:NaN;
  };
  const fee=configured('SCALP_'+asset+'_FEE_BPS',asset==='BTC'?12:0);
  const slip=configured('SCALP_'+asset+'_SLIPPAGE_BPS',asset==='BTC'?2:1);
  const effectiveSpread=spread!=null&&Number.isFinite(spread)&&spread>=0?spread:price*2/10000;
  return (effectiveSpread+price*(fee+slip)/10000)/atr;
}
