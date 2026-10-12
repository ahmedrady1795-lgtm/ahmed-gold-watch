import {getSniperAudit,exportSniperArchive} from '../../../lib/sniper-audit-store';
import {sniperArchiveStatus} from '../../../lib/sniper-archive-status';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
  try{
    if(new URL(request.url).searchParams.get('archive')==='1')
      return Response.json(exportSniperArchive(),{headers:{'Cache-Control':'no-store'}});
    const audit=getSniperAudit(),archive=await sniperArchiveStatus();
    return Response.json({...audit,archive},{headers:{'Cache-Control':'private, no-store',
      'X-Scenario-Storage':audit.persistence==='VOLUME'?'volume':archive.savedAt?'periodic-github-checkpoint':'temporary'}});
  }catch{
    return Response.json({ok:false,message:'تعذر قراءة سجل الأهداف'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
