/**
 * Compact phase badge for the live M15 sniper. Never call a box
 * accumulation/distribution without a CLOSED-bar confirmed H4/M5 context.
 */
export type PhaseBadge={key:'ACCUMULATION'|'DISTRIBUTION'|'COMPRESSION'|
 'BALANCE'|'TREND_UP'|'TREND_DOWN'|'UNKNOWN';label:string;confirmed:boolean};
type PhaseInput={ready:boolean;contextKind?:string|null;phase?:string|null;
 side?:'BUY'|'SELL'|'WAIT'};
export function sniperPhaseBadge(input:PhaseInput):PhaseBadge{
 if(!input.ready)return {key:'UNKNOWN',label:'غير متاح',confirmed:false};
 const kind=String(input.contextKind||'').toUpperCase();
 if(kind==='ACCUMULATION')return {key:'ACCUMULATION',label:'تجميع',confirmed:true};
 if(kind==='DISTRIBUTION')return {key:'DISTRIBUTION',label:'تصريف',confirmed:true};
 if(kind==='COMPRESSION')return {key:'COMPRESSION',label:'انضغاط',confirmed:true};
 const phase=String(input.phase||'');
 if(/توازن|انضغاط|ضغط|RANGE/i.test(phase))
   return {key:'BALANCE',label:'توازن',confirmed:false};
 if(input.side==='BUY')return {key:'TREND_UP',label:'ميل صاعد',confirmed:false};
 if(input.side==='SELL')return {key:'TREND_DOWN',label:'ميل هابط',confirmed:false};
 return {key:'BALANCE',label:'توازن',confirmed:false};
}
