import {getSniperAudit} from '../../../lib/sniper-audit-store';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
  try{
    const report=getSniperAudit();
    return Response.json(report,{headers:{'Cache-Control':'private, no-store',
      'X-Scenario-Storage':report.persistence==='VOLUME'?'persistent-volume':'temporary'}});
  }catch{
    return Response.json({ok:false,message:'تعذر قراءة سجل الأهداف؛ لا يوجد تأكيد دائم'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
