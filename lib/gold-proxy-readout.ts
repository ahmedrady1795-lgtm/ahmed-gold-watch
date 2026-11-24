/**
 * Gold alternative orderbook: independently-traded PAXG token venues.
 * NEVER an Exness XAUUSD book, COMEX gold futures, or an authorization to trade.
 * The main sniper's source-coherent XAUUSD candles keep sole responsibility
 * for gold direction; disagreement is displayed, not silently merged.
 */
import type {PaxgFlow} from './paxg-flow';
export type GoldProxyReadout={
 status:'ALIGNED'|'DIVERGENT'|'OBSERVED'|'UNAVAILABLE';
 label:string;detail:string;source:string;side:'BUY'|'SELL'|'WAIT';
 actionable:false;
};
export function observeGoldProxyFlow(a:{
 now:number;marketOpen:boolean;flow:PaxgFlow|null|undefined;
 chartSide:'BUY'|'SELL'|'WAIT';
}):GoldProxyReadout{
 const blank=(reason:string):GoldProxyReadout=>({
  status:'UNAVAILABLE',label:'PAXG: دفتر بديل غير متاح',detail:reason,
  source:'NONE',side:'WAIT',actionable:false
 });
 const f=a.flow;
 const source=String(f?.source||'');
 if(!a.marketOpen||!Number.isSafeInteger(a.now)||a.now<=0)return blank('السوق مغلق أو الوقت غير صالح');
 if(!f||!['Binance PAXG/USDT proxy','Kraken PAXG/USD proxy'].includes(source)||
  !Number.isSafeInteger(f.observedAt)||!Number.isFinite(f.tradeAt)||
  !Number.isSafeInteger(f.count)||f.count<3||
  f.observedAt>a.now||f.tradeAt>f.observedAt||f.tradeAt<=0||
  a.now-f.observedAt>12000||a.now-f.tradeAt>15000||
  !Number.isFinite(f.depthImbalancePct)||!Number.isFinite(f.tradeDeltaPct)||
  Math.abs(f.depthImbalancePct!)>100||Math.abs(f.tradeDeltaPct!)>100||
  f.side==='UNAVAILABLE')
  return blank('يلزم دفتر PAXG حديث وصفقات حقيقية من نفس المنصة');
 const venue=source.startsWith('Binance')?'Binance':'Kraken';
 const side=f.side==='BUY'||f.side==='SELL'?f.side:'WAIT';
 const tape=f.tradeDeltaPct!,depth=f.depthImbalancePct!;
 const tapeSide=tape>=20?'BUY':tape<=-20?'SELL':'WAIT';
 const bookSide=depth>=15?'BUY':depth<=-15?'SELL':'WAIT';
 const splitLabel=tapeSide==='WAIT'?'تنفيذ متوازن':
   (tapeSide==='BUY'?'تنفيذ شراء ↑':'تنفيذ بيع ↓')+
   (bookSide!=='WAIT'&&bookSide!==tapeSide?' / دفتر معاكس':' / دفتر غير مؤكد');
 const match=side!=='WAIT'&&a.chartSide!=='WAIT'&&side===a.chartSide;
 const conflict=side!=='WAIT'&&a.chartSide!=='WAIT'&&side!==a.chartSide;
 return {
  status:match?'ALIGNED':conflict?'DIVERGENT':'OBSERVED',
  side,source,actionable:false,
  label:'PAXG '+venue+' · '+(
   side==='BUY'?'ضغط شراء بديل ↑':side==='SELL'?'ضغط بيع بديل ↓':splitLabel),
  detail:'PAXG فقط · عمق '+f.depthImbalancePct!.toFixed(1)+'% · دلتا تنفيذ '+
   f.tradeDeltaPct!.toFixed(1)+'% · '+(
    match?'يتفق مع رصد XAU السعري (ليس تأكيدًا)':
    conflict?'يتعارض مع رصد XAU السعري':
    'لا توجد مقارنة اتجاه مؤهلة'
   )+' · ليس دفتر Exness ولا تصريح دخول'
 };
}
