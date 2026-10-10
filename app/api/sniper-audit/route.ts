import {getSniperAudit} from '../../../lib/sniper-audit-store';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
  try{
    return Response.json(getSniperAudit(),{headers:{'Cache-Control':'private, no-store',
      'X-Scenario-Storage':'railway-volume'}});
  }catch{
    return Response.json({ok:false,message:'تعذر قراءة سجل الأهداف؛ لا يوجد تأكيد دائم'},
      {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
