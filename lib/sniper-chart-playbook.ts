/**
 * Read-only chart guidance. Uses ONLY prequalified, freshly calculated
 * structural breakout/observation evidence. It cannot trigger execution.
 * A retest strip is an ATR display guide, NOT measured liquidity or an order.
 */
type Side='BUY'|'SELL'|'WAIT';
type Observation={status:string;side:Side;m1Side:Side;m5Side:Side};
type Breakout={phase:string;side:Side;closes:number;level:number|null;headline:string;detail:string};
type Target={stage:number;price:number};
export function buildSniperChartPlaybook(input:{
 marketOpen:boolean;priceFresh:boolean;historyFresh:boolean;
 price:number|null;atr:number|null;observation:Observation;
 breakout:Breakout;planReady:boolean;planSide:Side;
 targets:Target[];liquidityAvailable:boolean;
}){
 const noTrade='رصد فني فقط · ليس توصية أو أمر دخول';
 const paused=!input.marketOpen||!input.priceFresh||!input.historyFresh||
   input.price==null||!Number.isFinite(input.price)||input.price<=0;
 const observation=input.observation,breakout=input.breakout;
 const breakActive=['TESTING','M1_BREAK','M5_FIRST','M5_CONFIRMED'].includes(breakout.phase);
 const conflicted=observation.status==='CONFLICT'&&!input.planReady;
 const framesAligned=(observation.status==='ALIGNED'||observation.status==='ALIGNED_WATCH')&&
   observation.m1Side!=='WAIT'&&observation.m1Side===observation.m5Side;
 const side:Side=paused?'WAIT':input.planReady?input.planSide:
   conflicted?'WAIT':breakActive&&breakout.side!=='WAIT'?breakout.side:
   framesAligned?observation.side:
   observation.m5Side!=='WAIT'?observation.m5Side:'WAIT';
 const m5Closes=paused?0:Math.max(0,Math.min(2,breakout.closes||0));
 const phase=paused?'PAUSED':input.planReady?'QUALIFIED':
   conflicted?'CONFLICT':
   m5Closes===2?'CONFIRMED':m5Closes===1?'FIRST_CLOSE':
   breakActive?'TESTING':side!=='WAIT'?'TRACKING':'SCANNING';
 const sideLabel=side==='BUY'?'الصعود':side==='SELL'?'الهبوط':'الحياد';
 const title=phase==='PAUSED'?'الرصد الحي غير متاح':phase==='QUALIFIED'?'سيناريو تداول مؤهل وفق الشروط':
   phase==='CONFLICT'?'تعارض الاتجاه بين M1 وM5':
   phase==='CONFIRMED'?'كسر '+sideLabel+' مؤكد فنيًا · 2/2 M5':
   phase==='FIRST_CLOSE'?'كسر '+sideLabel+' · أول إغلاق M5':
   phase==='TESTING'?'مستوى '+sideLabel+' تحت الاختبار':
   phase==='TRACKING'?framesAligned?'اتجاه '+sideLabel+' متوافق على M1/M5':
     'ميل '+sideLabel+' مرصود · ننتظر تأكيد الكسر':
     'السوق دون أفضلية اتجاه فنية';
 // Evidence strength describes ONLY the checklist actually observed, not
 // success probability, net-R profitability or independent ML certification.
 const breakConfirmed=!paused&&m5Closes===2&&breakout.side===side&&side!=='WAIT';
 const evidenceStrength:'NONE'|'PARTIAL'|'ALIGNED'|'CONFIRMED'|'QUALIFIED'=
   paused||conflicted||side==='WAIT'?'NONE':input.planReady?'QUALIFIED':
   framesAligned&&breakConfirmed&&input.liquidityAvailable?'CONFIRMED':
   framesAligned?'ALIGNED':'PARTIAL';
 const strengthTitle=evidenceStrength==='QUALIFIED'?'شروط السيناريو مكتملة':
   evidenceStrength==='CONFIRMED'?'أدلة فنية قوية':
   evidenceStrength==='ALIGNED'?'توافق اتجاهي واضح':
   evidenceStrength==='PARTIAL'?'دليل اتجاهي أولي':'لا ترجيح معتمد';
 const strengthDetail=evidenceStrength==='QUALIFIED'?
   'وفق بوابة التداول المستقلة، وليست ضمانًا للربح':
   evidenceStrength==='CONFIRMED'?
   'M1 + M5 متفقان · كسر مغلق 2/2 · مستويات سيولة مرصودة':
   evidenceStrength==='ALIGNED'?
   'M1 + M5 في الاتجاه نفسه · الكسر أو السيولة غير مكتملين':
   evidenceStrength==='PARTIAL'?
   'اتجاه من إطار واحد أو كسر قيد التحقق · ليس توقعًا معايرًا':
   paused?'لا بيانات سوق حديثة':conflicted?'اتجاهات متضاربة':'لا دليل اتجاهي كافٍ';
 // Display ONLY levels on the chosen side, preserving the structural ordering.
 const targets=side==='WAIT'||paused?[]:input.targets
   .filter(t=>Number.isFinite(t.price)&&t.price>0&&
     (side==='BUY'?t.price>input.price!:t.price<input.price!))
   .sort((a,b)=>Math.abs(a.price-input.price!)-Math.abs(b.price-input.price!)).slice(0,3);
 const level=!paused&&breakActive&&breakout.side===side&&breakout.level!=null&&
   Number.isFinite(breakout.level)&&breakout.level>0?breakout.level:null;
 const atr=input.atr;
 const validAtr=atr!=null&&Number.isFinite(atr)&&atr>0&&
   input.price!=null&&atr<input.price*.08;
 // Read-only +/- 0.15 M5 ATR price corridor. Never described as an order.
 const retest=level!=null&&validAtr?{
   low:Math.max(.000001,level!-atr!*.15),
   high:level!+atr!*.15,center:level!,
   label:'حزام إعادة اختبار تقريبي · 0.15 ATR',
   executable:false as const
 }:null;
 const steps:[
   {label:string;state:'READY'|'WAIT'|'BLOCKED';detail:string},
   {label:string;state:'READY'|'WAIT'|'BLOCKED';detail:string},
   {label:string;state:'READY'|'WAIT'|'BLOCKED';detail:string}
 ]=[
   {label:'ميل M1/M5',state:paused?'BLOCKED':
      framesAligned?'READY': 'WAIT',
    detail:paused?'البيانات غير حديثة':framesAligned?'متوافق':
      conflicted?'متعارض':'غير متوافق بعد'},
   {label:'تأكيد الكسر',state:paused?'BLOCKED':m5Closes===2?'READY':'WAIT',
    detail:paused?'متوقف':m5Closes+'/2 M5'},
   {label:'السيولة',state:paused?'BLOCKED':'WAIT',
    detail:input.liquidityAvailable?'مناطق مرصودة · تدفق الأوامر منفصل':
      'لا تتوفر خريطة حديثة'}
 ];
 return {phase,side,title,detail:paused?'لا أسعار أو شموع حديثة للقرار':
    phase==='CONFLICT'?'ننتظر زوال التعارض قبل ترجيح أي سيناريو':
    phase==='QUALIFIED'?'السيناريو مؤهل وفق المحرك؛ التنفيذ له بوابة مستقلة':
    breakout.detail||'الكسر والسيولة ما زالا تحت المراقبة',
   target:targets[0]??null,targets,level,retest,steps,
   evidenceStrength,strengthTitle,strengthDetail,
   actionable:false as const,disclaimer:noTrade,
   priceIsFresh:!paused};
}
