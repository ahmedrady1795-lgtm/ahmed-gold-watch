import type {GoldOpeningCall} from './gold-opening-call';
import {acceptGoldPulse} from './gold-tick-quality.ts';

export type DisplayObservation = {
  target:number; issued:number; shown:number; side:'BUY'|'SELL'; method:'تحضير'|'استمرار';
  source:string; price:number|null; spread:number|null; lastQuoteAt:number|null;
  outcome:'قيد الرصد'|'مع الاتجاه'|'عكس الاتجاه'|'غير محسومة'|'لم يُرصد عبور';
  moveAt:number|null;
};

export function openingQuoteSource(source:unknown){
  return source==='Biquote · MT5 XAUUSD WebSocket'?'Biquote · MT5 XAUUSD':source;
}

function livePulse(quote:any, source:string, now:number){
  if(openingQuoteSource(quote?.source)!==source||quote?.status!=='live')return null;
  const pulse=acceptGoldPulse({...quote,fetchedAt:quote.receivedAt??quote.fetchedAt},now);
  return pulse&&pulse.sourceTime<=now?pulse:null;
}

export function startDisplayObservation(call:GoldOpeningCall,shown:number,quote:any):DisplayObservation {
  const pulse=livePulse(quote,call.quoteSource,shown);
  const spread=pulse?.ask!=null&&pulse.bid!=null&&pulse.ask>pulse.bid?pulse.ask-pulse.bid:null;
  return {target:call.target,issued:call.issued,shown,side:call.side,
    method:call.reason.startsWith('تحضير قبل الكسر')?'تحضير':'استمرار',
    source:call.quoteSource,price:pulse?.price??null,spread,lastQuoteAt:pulse?.sourceTime??null,
    outcome:spread===null?'غير محسومة':'قيد الرصد',moveAt:null};
}

export function advanceDisplayObservation(row:DisplayObservation,now:number,quote:any):DisplayObservation {
  if(row.outcome!=='قيد الرصد')return row;
  const end=row.target+300000;
  const pulse=livePulse(quote,row.source,now);
  const last=row.lastQuoteAt??row.shown;
  if(pulse&&pulse.sourceTime>Math.max(last,row.shown)&&pulse.sourceTime<=end){
    if(pulse.sourceTime-last>10000)return {...row,outcome:'غير محسومة'};
    const move=(pulse.price-row.price!)*(row.side==='BUY'?1:-1);
    if(Math.abs(move)+Number.EPSILON*pulse.price>=row.spread!)
      return {...row,lastQuoteAt:pulse.sourceTime,moveAt:pulse.sourceTime,outcome:move>0?'مع الاتجاه':'عكس الاتجاه'};
    return {...row,lastQuoteAt:pulse.sourceTime};
  }
  if(Math.min(now,end)-last>10000)return {...row,outcome:'غير محسومة'};
  if(now>=end)return {...row,outcome:'لم يُرصد عبور'};
  return row;
}
