import {NextRequest} from 'next/server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Entry={checkedAt:number;ledger:any;status:string};
const cache=new Map<'GOLD'|'BTC',Entry>();
const MAX=4_000_000;
export async function GET(request:NextRequest){
 const asset=request.nextUrl.searchParams.get('asset');
 if(asset!=='GOLD'&&asset!=='BTC')
   return Response.json({ok:false,error:'INVALID_ASSET'},{status:400});
 const now=Date.now(),name=asset as 'GOLD'|'BTC';
 const existing=cache.get(name);
 if(existing&&now-existing.checkedAt<10*60000)
   return Response.json({ok:existing.status==='OK',ledger:existing.ledger,
     status:existing.status,checkedAt:existing.checkedAt},
     {headers:{'Cache-Control':'private, max-age=120'}});
 let next:Entry={checkedAt:now,ledger:null,status:'NO_ARCHIVE_YET'};
 try{
  const uri='https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/render-free/archive/m15-'+asset+'.json';
  const resp=await fetch(uri,{cache:'no-store',signal:AbortSignal.timeout(4500)});
  if(resp.status===404)next.status='NO_ARCHIVE_YET';
  else if(!resp.ok)next.status='ARCHIVE_UNAVAILABLE';
  else {
   const text=await resp.text();
   if(text.length>MAX)next.status='ARCHIVE_TOO_LARGE';
   else {
    const obj=JSON.parse(text);
    if(obj?.schema==='qannas-m15-v1'&&obj.asset===asset&&
      Array.isArray(obj.feeds)&&obj.feeds.length<=8){
      next={checkedAt:now,ledger:obj,status:'OK'};
    }else next.status='INVALID_ARCHIVE_FORMAT';
   }
  }
 }catch{next.status='ARCHIVE_UNAVAILABLE';}
 cache.set(name,next);
 return Response.json({ok:next.status==='OK',ledger:next.ledger,
   status:next.status,checkedAt:now},
   {headers:{'Cache-Control':'private, max-age=120'}});
}
