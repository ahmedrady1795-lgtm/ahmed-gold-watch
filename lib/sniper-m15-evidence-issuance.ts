/**
 * This is a READ-ONLY chart forecast issuance gate, not a trade-entry gate.
 * Two independent confirming frames upgrade the LABEL of a scenario;
 * absence of those confirmations must not suppress clear M15 price action.
 * A scenario is a conditional analogue, never a probability or guaranteed TP.
 */
export type EvidenceSide='BUY'|'SELL'|'WAIT';
export type EvidenceLevel='QUALIFIED'|'CONFLUENCE'|'PRELIMINARY'|'WAIT';
export function assessM15ScenarioIssuance(input:{
 side:EvidenceSide;qualified:boolean;radarStatus:string;
 radarSide:EvidenceSide;m15Side:EvidenceSide;m15Votes:number;
 structuralActive:boolean;structuralSide:EvidenceSide;structuralAgreement:number;
 fresh:boolean;goals:number;stop:number|null;anchor:number|null
}):{allowed:boolean;reason:string;level:EvidenceLevel}{
 const wait=(reason:string)=>({allowed:false,reason,level:'WAIT' as const});
 const {side,anchor,stop}=input;
 if(!input.fresh||anchor==null||!Number.isFinite(anchor)||anchor<=0)
   return wait('لا شموع حديثة وسعر مرصود من نفس المصدر');
 if(side==='WAIT')return wait('لا اتجاه مرجح من الشموع المغلقة');
 // A stop is OPTIONAL in a read-only forecast; if provided it must
 // still be on the invalidation side of the real anchor.
 if(stop!=null&&(!Number.isFinite(stop)||stop<=0||
   (side==='BUY'?stop>=anchor:stop<=anchor)))
   return wait('إبطال غير صالح بالنسبة للسعر الحالي');
 const m15=input.m15Side===side&&input.m15Votes>=2;
 const structure=input.structuralActive&&input.structuralSide===side&&
   input.structuralAgreement>=2;
 const radar=input.radarStatus==='ALIGNED'&&input.radarSide===side;
 const oppositeM15=input.m15Side!=='WAIT'&&
   input.m15Votes>=2&&input.m15Side!==side;
 const oppositeStructure=input.structuralActive&&
   input.structuralAgreement>=2&&input.structuralSide!==side&&
   input.structuralSide!=='WAIT';
 // Strong, grounded opposing structural evidence is a REAL disagreement,
 // not a missing trade-entry permission. Do not force a directional path.
 if(oppositeM15||oppositeStructure)
   return wait('تعارض واضح بين أطر السعر المغلقة؛ ترقب الكسر');
 if(!m15&&!structure&&!radar)
   return wait('لا دليل اتجاهي كافٍ حتى لسيناريو مبدئي');
 const goalNote=input.goals>0?'':' · بلا أهداف هيكلية مؤكدة';
 if(input.qualified&&(m15||structure||radar)&&
   input.radarStatus!=='CONFLICT')
   return {allowed:true,level:'QUALIFIED',
     reason:'سيناريو تحليلي مدعوم · لا يعني السماح بصفقة'+goalNote};
 const votes=Number(m15)+Number(structure)+Number(radar);
 if(votes>=2&&input.radarStatus!=='CONFLICT')
   return {allowed:true,level:'CONFLUENCE',
     reason:'ترجيح تحليلي من أكثر من إطار · ليس دخولًا'+goalNote};
 return {allowed:true,level:'PRELIMINARY',
   reason:'سيناريو مبدئي من حركة السعر · يحتاج تأكيدًا إضافيًا'+goalNote};
}
