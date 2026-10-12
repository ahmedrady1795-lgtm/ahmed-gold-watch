import {getScalpDesk} from '../../../lib/scalp-desk';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
  try{return Response.json(await getScalpDesk(),{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({ok:false,message:'تعذر تحديث فرص السكالب'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
