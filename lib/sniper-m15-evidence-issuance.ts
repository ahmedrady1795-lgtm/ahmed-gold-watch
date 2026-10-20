/**
 * A chart-only issuance gate: a new scenario requires fresh observed evidence,
 * not simply the arrival of another M15 candle. It is NOT a confidence score
 * or proof that future prices will follow historical analogue candles.
 */
export type EvidenceSide='BUY'|'SELL'|'WAIT';
export function assessM15ScenarioIssuance(input:{
 side:EvidenceSide;qualified:boolean;radarStatus:string;
 radarSide:EvidenceSide;m15Side:EvidenceSide;m15Votes:number;
 structuralActive:boolean;structuralSide:EvidenceSide;structuralAgreement:number;
 fresh:boolean;goals:number;stop:number|null;anchor:number|null
}):{allowed:boolean;reason:string;level:'QUALIFIED'|'CONFLUENCE'|'WAIT'}{
 const wait=(reason:string)=>({allowed:false,reason,level:'WAIT' as const});
 const {side,anchor,stop}=input;
 if(!input.fresh||anchor==null||!Number.isFinite(anchor)||anchor<=0)
   return wait('انتظار سعر حي وشموع M15 مكتملة');
 if(side==='WAIT'||!input.goals)return wait('لا اتجاه وأهداف هيكلية مؤهلة');
 if(stop==null||!Number.isFinite(stop)||stop<=0||
   (side==='BUY'?stop>=anchor:stop<=anchor))
   return wait('مستوى الإبطال غير صالح؛ انتظار');
 if(input.radarStatus==='CONFLICT')return wait('تعارض M1 وM5؛ انتظار');
 const m15=input.m15Side===side&&input.m15Votes>=2;
 const structure=input.structuralActive&&input.structuralSide===side&&
   input.structuralAgreement>=2;
 const oppositeStructure=input.structuralActive&&
   input.structuralAgreement>=2&&input.structuralSide!==side&&
   input.structuralSide!=='WAIT';
 if(oppositeStructure)return wait('هيكل السعر يعارض الاتجاه؛ انتظار');
 if(input.qualified&&(m15||structure||
   (input.radarStatus==='ALIGNED'&&input.radarSide===side)))
   return {allowed:true,reason:'سيناريو مؤهل ومدعوم برصد فني',level:'QUALIFIED'};
 if(input.radarStatus==='ALIGNED'&&input.radarSide===side&&(m15||structure))
   return {allowed:true,reason:'توافق رصد M1/M5 مع M15 أو هيكل أعلى',level:'CONFLUENCE'};
 return wait('الترجيح غير كافٍ؛ انتظار توافق التحليل قبل رسم سيناريو جديد');
}
