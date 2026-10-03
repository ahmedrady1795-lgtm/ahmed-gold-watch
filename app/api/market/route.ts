import { getMarketData } from '../../../lib/market-hub';
export const dynamic = 'force-dynamic';
export async function GET(){try{return Response.json(await getMarketData(),{headers:{'Cache-Control':'private, no-store','X-Market-Hub':'shared'}});}catch(e){return Response.json({checkedAt:Date.now(),pricesReady:false,newsReady:false,backgroundReady:false,c1:[],c5:[],c15:[],c60:[],events:[],background:[],errors:[e instanceof Error?e.message:'market hub error']},{status:502,headers:{'Cache-Control':'no-store'}});}}
