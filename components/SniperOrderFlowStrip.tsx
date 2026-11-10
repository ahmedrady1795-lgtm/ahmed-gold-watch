import type {OrderFlowObservation} from '../lib/sniper-order-flow-observation';

const fmt=(n:number|null,decimals=1)=>n==null||!Number.isFinite(n)?'—':
 n.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
const signed=(n:number|null)=>n==null?'—':(n>0?'+':'')+fmt(n)+'%';
const directional=(v:number|null,word:string)=>v==null?'—':
 v>=15?'↑ '+word+' صاعد':v<=-15?'↓ '+word+' هابط':'↔ '+word+' متوازن';
/** Source-labelled order-flow evidence visible in both M1 and M15.
 * The panel is read-only; it does NOT place orders, raise lots or change SL/TP.
 */
export default function SniperOrderFlowStrip({data}:{data:OrderFlowObservation}){
 const isTrade=data.status==='EXECUTED_TRADES';
 const isBook=data.status==='BROKER_DOM';
 const isQuote=data.status==='QUOTE_ACTIVITY';
 const proxy=data.status==='PRICE_PROXY';
 const live=isTrade||isBook||isQuote;
 const primary=isTrade?signed(data.deltaPct):
   isBook?signed(data.depthPct):
   isQuote?signed(data.quotePressurePct):
   proxy?signed(data.proxyPressurePct):'—';
 const primaryLabel=isTrade?'دلتا التنفيذ':
   isBook?'اختلال DOM':
   isQuote?'ميل التحديثات':'ضغط الشموع';
 const secondary=live&&data.poc!=null?fmt(data.poc,2):
   proxy?'8 شموع':'—';
 const state=isTrade?'تنفيذات Coinbase':
   isBook?'DOM وسيط MT5':
   isQuote?'تحديثات Bid/Ask':
   proxy?'بديل سعري غير تنفيذي':'بانتظار تغذية موثوقة';
 return <details className={'sniper-orderflow-strip is-'+data.status.toLowerCase()}
   aria-label="Order Flow: تدفق الأوامر ودرجة موثوقية المصدر"
   data-flow-status={data.status} data-flow-side={data.side}>
   <summary>
     <strong>ORDER FLOW <small>· {state}</small></strong>
     <span className="sniper-orderflow-primary">
       <small>{primaryLabel}</small><b dir="ltr">{primary}</b>
     </span>
     <span className="sniper-orderflow-secondary">
       <small>{live?'POC':proxy?'العينة':'المصدر'}</small>
       <b dir="ltr">{secondary}</b>
     </span>
     <span className="sniper-orderflow-expand" aria-hidden="true">＋</span>
   </summary>
   <div className="sniper-orderflow-details">
     <div className="sniper-orderflow-heading">
       <b>{data.label}</b>
       <small>{data.freshnessSeconds==null?'عينة غير حية':
         'عمر العينة '+fmt(data.freshnessSeconds)+' ثانية'}</small>
     </div>
     {(isTrade||isBook||isQuote)&&<>
       {isTrade&&<div>
         <span>دلتا تداولات منفذة · Coinbase BTC فقط</span>
         <b dir="ltr">{signed(data.deltaPct)}</b>
       </div>}
       {isBook&&<>
         <div><span>عمق طلب Bid معلن</span>
           <b dir="ltr">{fmt(data.bidLots,3)} · {fmt(data.bidSharePct)}%</b></div>
         <div><span>عمق عرض Ask معلن</span>
           <b dir="ltr">{fmt(data.askLots,3)} · {fmt(data.askSharePct)}%</b></div>
         <div><span>مقارنة العمق (Bid − Ask)</span>
           <b dir="ltr">{signed(data.depthPct)}</b></div>
       </>}
       {data.quotePressurePct!=null&&<div>
         <span>ضغط تحديثات Bid/Ask (ليس حجمًا منفذًا)</span>
         <b dir="ltr">{signed(data.quotePressurePct)}</b>
       </div>}
       <div><span>POC / VAH / VAL</span>
         <b dir="ltr">{fmt(data.poc,2)} / {fmt(data.vah,2)} / {fmt(data.val,2)}</b>
       </div>
       {isBook&&<div><span>سحب أوامر معلنة محتمل</span>
         <b>{data.withdrawal==='BOTH'?'طلب وعرض':
           data.withdrawal==='BID'?'جانب الطلب':
           data.withdrawal==='ASK'?'جانب العرض':'غير مرصود'}</b>
       </div>}
       <div><span>توافق اتجاه التدفق</span>
         <b>{data.side==='BUY'?'شراء استرشادي':
           data.side==='SELL'?'بيع استرشادي':'لا اتجاه معتمد'}</b>
       </div>
     </>}
     {proxy&&<div><span>ملخص السعر السابق (OHLC مغلق)</span>
       <b>{directional(data.proxyPressurePct,'ضغط الشموع')}</b></div>}
     <small className="sniper-orderflow-provenance">{data.reason}</small>
     <small className="sniper-orderflow-provenance">
       المصدر: {data.source} · رصد فقط؛ لا تغيير للأوامر أو أهداف الربح أو وقف الخسارة.
       {isBook||isQuote||proxy?' الذهب الفوري لا يتيح من هذا المصدر حجم صفقات COMEX المنفذة.':''}
     </small>
   </div>
 </details>;
}
