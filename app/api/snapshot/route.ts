import { analyze, defaults } from '../../../lib/engine';
import { getMarketSnapshot } from '../../../lib/market-hub';
export const dynamic='force-dynamic';
export async function GET(){try{const snapshot=await getMarketSnapshot(),now=Date.now(),m=snapshot.market,analysis=analyze(m.c1,m.c5,m.c15,m.c60,m.events,Boolean(m.newsReady&&now-m.checkedAt<120000),now,defaults);return Response.json({...snapshot,analysis},{headers:{'Cache-Control':'private, no-store','X-Market-Hub':'snapshot'}});}catch(e){return Response.json({ok:false,message:'تعذر تكوين لقطة السوق الموحدة.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'no-store'}});}}
