/**
 * Optional external evidence (such as BTC order-book liquidity) must never
 * hold the independent gold analysis hostage. Return null on timeout/error.
 * A null result is MISSING evidence, not bullish/bearish or real DOM data.
 */
export async function optionalMarketEvidence<T>(
  pending:Promise<T>,limitMs:number
):Promise<T|null>{
  if(!Number.isFinite(limitMs)||limitMs<=0)throw Error('INVALID_OPTIONAL_MARKET_BUDGET');
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<null>(resolve=>{
    timeout=setTimeout(()=>resolve(null),limitMs);
  });
  try{return await Promise.race([pending.catch(()=>null),deadline]);}
  finally{if(timeout)clearTimeout(timeout);}
}
