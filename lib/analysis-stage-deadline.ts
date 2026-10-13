/**
 * Bound each awaited heavy AI stage to the SAME request deadline.
 * A timed-out provider may finish separately; its result is never accepted
 * into a new forecast generation after this request has exited.
 */
export async function awaitAiStage<T>(
  name:string,
  pending:Promise<T>,
  startedAt:number,
  options:{totalBudgetMs?:number;stageBudgetMs?:number}={}
):Promise<T>{
  const total=options.totalBudgetMs??39000;
  const stage=options.stageBudgetMs??12000;
  const elapsed=Date.now()-startedAt;
  const remaining=Math.min(stage,total-elapsed);
  if(!Number.isFinite(elapsed)||remaining<=0)
    throw new Error('AI_STAGE_DEADLINE:'+name);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const guard=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('AI_STAGE_TIMEOUT:'+name+':'+Math.round(remaining)+'ms')),remaining);
  });
  try{return await Promise.race([pending,guard]);}
  finally{if(timer)clearTimeout(timer);}
}
