import {getMarketSentiment} from '../../../lib/market-sentiment';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
 const asset=new URL(request.url).searchParams.get('asset');
 if(asset!=='GOLD'&&asset!=='BTC')return Response.json({error:'Invalid asset'},{status:400});
 return Response.json(await getMarketSentiment(asset),{headers:{'Cache-Control':'no-store'}});
}
