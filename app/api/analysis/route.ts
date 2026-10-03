import {analyze,defaults} from '../../../lib/engine';
import {getMarketSnapshot} from '../../../lib/market-hub';
export const dynamic='force-dynamic';
export async function GET(){const now=Date.now();try{const s=await getMarketSnapshot(),m=s.market;const analysis=analyze(m.c1,m.c5,m.c15,m.c60,m.events,Boolean(m.newsReady&&now-m.checkedAt<120000),now,defaults);return Response.json({ok:true,checkedAt:now,analysis,quote:s.quote,mt5:s.mt5},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return Response.json({ok:false,message:'تعذر تكوين التحليل المجمع.',detail:e instanceof Error?e.message:'unknown'},{status:502,headers:{'Cache-Control':'private, no-store'}});}}
