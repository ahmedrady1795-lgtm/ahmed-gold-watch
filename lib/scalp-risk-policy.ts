/** Pure strategy-specific paper risk floor; no broker authority. */
export function requiredScalpNetR(plan:{setup:string}):number{
  return plan.setup==='OB_FVG'?3:plan.setup==='RETEST'?1.5:1.25;
}
