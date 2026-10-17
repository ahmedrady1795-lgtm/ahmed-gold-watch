'use client';
import type {BtcOrderflow} from '../lib/btc-orderflow';

const num=(x:number,d=2)=>Number.isFinite(x)?x.toLocaleString('en-US',{
 maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const vol=(x:number)=>Number.isFinite(x)?x.toFixed(4):'—';
const clock=(t:number)=>new Date(t).toLocaleTimeString('en-GB',{
 hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'});
type Breakout={phase:string;side:'BUY'|'SELL'|'WAIT';headline:string};
export default function BtcOrderflowPanel({data,now,breakout}:{
 data:BtcOrderflow|null;now:number;breakout:Breakout
}){
 const fresh=Boolean(data?.ok&&data?.status==='LIVE_SAMPLE'&&data.asOf>0&&
   now>=data.asOf-2000&&now-data.asOf<=20000);
 const profile=fresh?data!.profile:null,flow=fresh?data!.flow:null;
 const bins=profile?.rows.slice().sort((a,b)=>b.price-a.price)??[];
 const maxVol=Math.max(.000001,...bins.map(x=>x.totalBtc));
 const confirming=flow&&breakout.side!=='WAIT'&&
   (breakout.phase==='TESTING'||breakout.phase==='M1_BREAK'||
    breakout.phase==='M5_FIRST'||breakout.phase==='M5_CONFIRMED')?
   (flow.imbalance==='BALANCED'?'الدلتا محايدة؛ لا تؤكد الكسر':
     flow.imbalance===breakout.side?'الدلتا تؤيد جهة اختبار الكسر · رصد فقط':
       'الدلتا تعارض جهة الكسر · حذر من استمرار الحركة'):null;
 const age=Number.isFinite(Number(data?.asOf))&&data!.asOf>0?
   Math.round((now-data!.asOf)/1000):null;
 return <section className="btc-orderflow" aria-label="أوردر فلو البيتكوين من صفقات Coinbase الحقيقية">
   <div className="btc-orderflow-head">
     <div><strong>ORDER FLOW · BTC</strong><small>Coinbase Exchange · صفقات منفذة حقيقية</small></div>
     <span className={'btc-orderflow-state '+(fresh?'btc-flow-live':'btc-flow-wait')}>
       {fresh?'● تدفق حديث · '+age+' ث':'◌ بيانات تدفق غير مؤهلة'}
     </span>
   </div>
   {!profile||!flow?<p className="btc-orderflow-unavailable">
     {data?.reason||'جاري تحميل صفقات Coinbase المنفذة...'}
     {' '}لا نعرض Delta أو عقودًا من بيانات غير موثوقة.
   </p>:<>
     <div className="btc-flow-stats">
       <div><small>POC · أعلى حجم</small><b dir="ltr">{num(profile.poc)}</b></div>
       <div><small>VAH · أعلى 70%</small><b dir="ltr">{num(profile.vah)}</b></div>
       <div><small>VAL · أدنى 70%</small><b dir="ltr">{num(profile.val)}</b></div>
       <div><small>VWAP · العينة</small><b dir="ltr">{num(profile.vwap)}</b></div>
       <div className={flow.deltaBtc>=0?'btc-flow-positive':'btc-flow-negative'}>
         <small>Delta · شراء هجومي − بيع</small>
         <b dir="ltr">{flow.deltaBtc>0?'+':''}{vol(flow.deltaBtc)} BTC</b>
       </div>
     </div>
     <p className="btc-flow-reading">
       {confirming||(
         flow.imbalance==='BUY'?'تدفق شراء هجومي أكبر في العينة، بلا تأكيد لاتجاه المستقبل':
         flow.imbalance==='SELL'?'تدفق بيع هجومي أكبر في العينة، بلا تأكيد لاتجاه المستقبل':
         'تدفق الشراء والبيع متوازن نسبيًا في العينة')}
       {flow.absorptionWatch&&' · تباعد دلتا/سعر قد يشير إلى امتصاص؛ يحتاج تحققًا مستقلًا'}
     </p>
     <div className="btc-orderflow-grid">
       <div className="btc-vp-pane">
         <div className="btc-flow-panel-title">Volume Profile <small>سعر × حجم BTC منفذ</small></div>
         <div className="btc-vp-levels">
           {bins.length?bins.map(z=><div key={z.price}
             className={'btc-vp-row '+(z.price===profile.poc?'btc-vp-poc':'')}
             title={'صفقات منفذة قرب '+num(z.price)+' · '+vol(z.totalBtc)+' BTC'}>
             <span dir="ltr">{num(z.price)}</span>
             <div className="btc-vp-meter">
               <i className="btc-vp-buy" style={{width:(z.buyBtc/maxVol*100)+'%'}}/>
               <i className="btc-vp-sell" style={{width:(z.sellBtc/maxVol*100)+'%'}}/>
             </div>
             <b dir="ltr">{vol(z.totalBtc)}</b>
           </div>):<span>لا مستويات مكتملة</span>}
         </div>
       </div>
       <div className="btc-footprint-pane">
         <div className="btc-flow-panel-title">Footprint <small>Bid / Ask · صفقات هجومية</small></div>
         <div className="btc-footprint-minutes">
           {data!.footprint.map(m=><div className="btc-footprint-minute" key={m.time}>
             <div className="btc-footprint-minute-head">
               <b>{clock(m.time)} · M1 جزئية</b>
               <small dir="ltr">Δ {m.deltaBtc>0?'+':''}{vol(m.deltaBtc)} BTC</small>
             </div>
             <table><thead><tr><th>Sell BTC</th><th>السعر</th><th>Buy BTC</th></tr></thead>
               <tbody>{m.rows.map(b=><tr key={b.price}
                 className={'btc-footprint-'+b.imbalance.toLowerCase()}>
                 <td className="btc-footprint-sell" dir="ltr">{vol(b.sellBtc)}</td>
                 <td dir="ltr">{num(b.price)}</td>
                 <td className="btc-footprint-buy" dir="ltr">{vol(b.buyBtc)}</td>
               </tr>)}</tbody>
             </table>
           </div>)}
         </div>
       </div>
     </div>
     <p className="btc-flow-provenance">
       عينة تنفيذ Coinbase: {data!.coverage.trades} صفقة خلال {num(data!.coverage.seconds,1)} ثانية
       {' · '}إجمالي {vol(profile.volumeBtc)} BTC، حجم حقيقي من منصة واحدة فقط.
       خانة side في المصدر هي جهة Maker وتم عكسها لحساب جهة التنفيذ الهجومي.
       شموع Footprint جزئية، والبيانات لا تشمل جلسة كاملة ولا كل البورصات، ولا تعتبر توصية دخول.
     </p>
   </>}
 </section>;
}
