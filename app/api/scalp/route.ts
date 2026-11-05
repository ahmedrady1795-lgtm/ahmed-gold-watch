import {noteViewerActivity} from '../../../lib/render-free-eco';
import {publishViewerLease} from '../../../lib/render-free-viewer-lease';
import {getScalpDesk} from '../../../lib/scalp-desk';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
  // /scalp is an independent active dashboard. The viewer token is sent
  // only by the visible tab; an idle internal worker cannot extend it.
  // Without this, the independent GOLD/coinbase observers stay paused
  // while the user actively watches Scalp Lab.
  if(request.headers.get('x-qannas-viewer')==='1'){
    const now=Date.now();
    noteViewerActivity(now);
    await publishViewerLease(now);
  }
  // Only a GOLD-only request skips external BTC sources; existing combined
  // API behavior and callers keep all market lanes.
  const asset=new URL(request.url).searchParams.get('asset')==='GOLD'?'GOLD':'ALL';
  try{return Response.json(await getScalpDesk(asset),{headers:{'Cache-Control':'no-store'}});
  catch{return Response.json({ok:false,message:'تعذر تحديث فرص السكالب'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
