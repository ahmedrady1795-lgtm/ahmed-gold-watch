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
 const side:Side=paused?'WAIT':input.planReady?input.planSide:
   conflicted?'WAIT':breakActive&&breakout.side!=='WAIT'?breakout.side:
   observation.status==='ALIGNED'?observation.side:
   observation.m5Side!=='WAIT'?observation.m5Side:'WAIT';
 const m5Closes=paused?0:Math.max(0,Math.min(2,breakout.closes||0));
 const phase=paused?'PAUSED':input.planReady?'QUALIFIED':
   conflicted?'CONFLICT':
   m5Closes===2?'CONFIRMED':m5Closes===1?'FIRST_CLOSE':
   breakActive?'TESTING':side!=='WAIT'?'TRACKING':'SCANNING';
 const title=phase==='PAUSED'?'الرصد الحي متوقف':phase==='QUALIFIED'?'سيناريو مؤهل مسجل':
   phase==='CONFLICT'?'اختلاف الاتجاه بين M1 وM5':
   phase==='CONFIRMED'?'الكسر تأكد سعريًا · 2/2 M5':
   phase==='FIRST_CLOSE'?'أول إغلاق M5 · 1/2':
   phase==='TESTING'?'اختبار مستوى كسر · دون تأكيد':
   phase==='TRACKING'?'رصد الاتجاه · انتظار دليل الكسر':'مسح الحركة · دون أفضلية اتجاه';
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
      observation.status==='ALIGNED'?'READY': 'WAIT',
    detail:paused?'البيانات غير حديثة':observation.status==='ALIGNED'?'متوافق':
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
   actionable:false as const,disclaimer:noTrade,
   priceIsFresh:!paused};
}
