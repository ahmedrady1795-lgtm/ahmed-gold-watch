import {getRuntimeEnv} from '../../../../lib/runtime';
import {telegramStatus} from '../../../../lib/telegram';
export const dynamic='force-dynamic';
let cached:{at:number;result:Record<string,unknown>}|null=null;
export async function GET(){
 const status=telegramStatus(),headers={'Cache-Control':'private, no-store'};
 if(!status.configured)return Response.json({...status,verified:false,message:!status.tokenConfigured?'توكن البوت غير مضاف على الخادم.':'معرّف المحادثة TELEGRAM_CHAT_ID غير مضاف.'},{headers});
 if(cached&&Date.now()-cached.at<60000)return Response.json({...status,...cached.result},{headers});
 const r=getRuntimeEnv();
 try{
  const response=await fetch('https://api.telegram.org/bot'+r.TELEGRAM_BOT_TOKEN?.trim()+'/getMe',{signal:AbortSignal.timeout(10000)}),data:any=await response.json();
  const result={verified:response.ok&&data.ok===true,checkedAt:Date.now(),username:response.ok&&data.ok?String(data.result.username):null,message:response.ok&&data.ok?'هوية البوت صالحة؛ تسليم الرسائل للمحادثة لم يُختبر بعد.':'تعذر التحقق من توكن البوت.'};
  cached={at:Date.now(),result};return Response.json({...status,...result},{headers});
 }catch{return Response.json({...status,verified:false,message:'تعذر الاتصال بـTelegram؛ لا نعتبر الربط ناجحًا.'},{status:502,headers});}
}
