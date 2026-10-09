// Read-only, bounded site diagnostics for the Egyptian voice assistant.
// Never opens a trade, runs arbitrary commands or fetches user-supplied URLs.
import {getAiSnapshot} from './ai-snapshot-cache';
import {getAiReadiness} from './ai-readiness';
import {coreModelConfigured,coreModelProvider,coreModelTelemetry} from './core-language-model';

type CheckState='OK'|'WARN'|'FAIL'|'UNKNOWN';
export type SiteCheck={key:string;label:string;state:CheckState;detail:string};
export type SiteInspection={checkedAt:number;status:'HEALTHY'|'DEGRADED'|'UNAVAILABLE';checks:SiteCheck[];problems:string[];summary:string;dataAgeMs:number|null;modelProvider:string};
const number=(x:unknown):number|null=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const short=(s:unknown,limit=140)=>String(s??'').replace(/[\r\n\t]+/g,' ').slice(0,limit);
function goldMarketOpen(now:number){
  const d=new Date(now),day=d.getUTCDay(),hour=d.getUTCHours()+d.getUTCMinutes()/60;
  return !(day===6||(day===0&&hour<22)||(day===5&&hour>=21)||(day>=1&&day<=4&&hour>=21&&hour<22));
}
async function checkHomepage():Promise<SiteCheck>{
  const port=String(process.env.PORT||'8080');
  // Fixed loopback host and fixed route; no user-controlled outbound target.
  if(!/^\d{2,5}$/.test(port))return {key:'website',label:'الصفحة الرئيسية',state:'UNKNOWN',detail:'منفذ السيرفر غير متاح للفحص'};
  const started=Date.now();
  try{
    const response=await fetch('http://127.0.0.1:'+port+'/',{
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(1800),
      headers:{Accept:'text/html','X-Core-Diagnostic':'1'}
    });
    try{await response.body?.cancel();}catch{}
    return {key:'website',label:'الصفحة الرئيسية',state:response.ok?'OK':'FAIL',
      detail:'HTTP '+response.status+'، زمن الاستجابة '+(Date.now()-started)+' مللي ثانية'};
  }catch{
    return {key:'website',label:'الصفحة الرئيسية',state:'UNKNOWN',
      detail:'تعذر اختبار الصفحة داخليًا خلال مهلة قصيرة؛ ده مش إثبات إن الموقع واقع'};
  }
}
export async function inspectCoreSite():Promise<SiteInspection>{
  const checkedAt=Date.now(),snapshot=getAiSnapshot(checkedAt),data=snapshot.payload||{};
  const marketOpen=goldMarketOpen(checkedAt);
  const [homepage,ai]=await Promise.all([
    checkHomepage(),
    getAiReadiness().catch(()=>null)
  ]);
  const checks:SiteCheck[]=[homepage];
  const age=snapshot.ageMs;
  checks.push({key:'analysis',label:'دورة تحليل السوق',
    state:!snapshot.payload?'FAIL':age==null?'UNKNOWN':age>90000?'WARN':'OK',
    detail:!snapshot.payload?'لسه مفيش لقطة تحليل منشورة من السيرفر':
      age==null?'وقت آخر تحديث مش متاح':age>90000?'آخر تحليل من '+Math.round(age/1000)+' ثانية':
      'آخر تحليل من '+Math.round(age/1000)+' ثانية'});
  for(const [key,label] of [['gold','الذهب'],['bitcoin','البيتكوين']] as const){
    const asset=data?.[key]||{};
    const lastPrice=number(asset.price??asset.livePulse?.price);
    const sourceTime=number(asset.livePulse?.sourceTime);
    const ageMs=sourceTime?Math.max(0,checkedAt-sourceTime):null;
    const offline=key==='gold'&&!marketOpen;
    const valid=lastPrice!==null&&lastPrice>0;
    const fresh=ageMs!==null&&ageMs<60000;
    checks.push({
      key,label:label+' · البيانات',
      state:offline?'OK':!valid?'WARN':fresh?'OK':'WARN',
      detail:offline?'سوق الذهب مقفول دلوقتي؛ تأخر السعر مش دليل عطل':
        !valid?'سعر لحظي موثوق مش متاح في آخر لقطة تحليل':
        ageMs==null?'سعر موجود لكن وقت المصدر مش واضح':
        'السعر '+lastPrice.toLocaleString('en-US')+'، عمر المصدر '+Math.round(ageMs/1000)+' ثانية'
    });
  }
  const modelReady=coreModelConfigured(),model=coreModelTelemetry();
  checks.push({key:'conversation',label:'المحادثة الذكية',
    state:!modelReady?'WARN':model.lastStatus===200?'OK':model.lastAttempt?'WARN':'UNKNOWN',
    detail:!modelReady?'موديل المحادثة البديل لسه مش متوصل؛ الأوامر وفحص الموقع الصوتي متاحين':
      model.lastStatus===200?'آخر اتصال ناجح عبر '+coreModelProvider():
      model.lastAttempt?'آخر محاولة للموديل ما نجحتش':'المفتاح متوصل لكن مفيش اختبار رد ناجح لسه'});
  if(ai){
    const models=(ai as any).models||{};
    const ready=[models.mlM1,models.mlM5,models.neural].filter((v:any)=>v?.ready).length;
    checks.push({key:'prediction',label:'خدمات التنبؤ والتعلم',
      state:ready===3?'OK':'WARN',
      detail:'خدمات مُؤهّلة '+ready+' من 3. عدم التأهيل مش معناه إن الموقع كله واقع'});
  }else checks.push({key:'prediction',label:'خدمات التنبؤ والتعلم',state:'UNKNOWN',detail:'الفحص اتأخر ومفيش نتيجة كفاية'});
  const failures=checks.filter(c=>c.state==='FAIL');
  const warnings=checks.filter(c=>c.state==='WARN');
  const status:SiteInspection['status']=failures.length?'DEGRADED':warnings.length?'DEGRADED':'HEALTHY';
  const problems=[...failures,...warnings].map(c=>c.label+': '+short(c.detail)).slice(0,5);
  const summary=problems.length?
    'فحصت الموقع، ولقيت '+problems.length+' ملاحظة. '+problems.slice(0,3).map(x=>x.replace(/ · /g,' ')).join('؛ ')+'.':
    'فحصت الموقع. المؤشرات اللي قدرت أتحقق منها سليمة حاليًا، لكن ده مش اختبار شامل لكل وظائف الموقع.';
  return {checkedAt,status,checks,problems,summary,dataAgeMs:age??null,modelProvider:coreModelProvider()};
}
