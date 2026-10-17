/** Conservative XAUUSD session indicator for the chart, not a trading signal.
 * Holidays and broker-specific Sunday opening times may differ.
 */
export function goldMarketSession(now:number){
  const d=new Date(now),day=d.getUTCDay(),minute=d.getUTCHours()*60+d.getUTCMinutes();
  const weekend=day===6||(day===0&&minute<1320)||(day===5&&minute>=1260);
  const maintenance=day>=1&&day<=4&&minute>=1260&&minute<1320;
  return {open:!weekend&&!maintenance,
    reason:weekend?'WEEKEND' as const:maintenance?'MAINTENANCE' as const:'OPEN' as const};
}
