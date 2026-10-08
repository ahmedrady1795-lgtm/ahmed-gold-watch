import type {Candle} from './engine';
import type {ScalpQuote} from './scalp-opportunities';

// Price-derived stop-pool candidates, never exchange order-book quantities.
export function readScalpLiquidity(rows:Candle[],quote:ScalpQuote,now:number){
  const closed=rows.filter(c=>c.time+60000<=now&&[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)).slice(-90);
  const last=closed.at(-1),price=quote.price;
  const fresh=price!=null&&price>0&&quote.at!=null&&now-quote.at<=15000&&quote.at<=now+2000;
  const contiguous=closed.slice(-20).every((c,i,a)=>!i||c.time-a[i-1].time===60000);
  const available=Boolean(last&&closed.length>=21&&now-last.time-60000<=90000&&fresh&&contiguous);
  if(!available)return {available:false,checkedAt:now,reason:'قراءة السيولة تحتاج سعراً حديثاً وشموع M1 متصلة',levels:[],sweeps:[]};
  const sample=closed.slice(-21,-1),high=Math.max(...sample.map(c=>c.high)),low=Math.min(...sample.map(c=>c.low));
  const atr=closed.slice(-14).reduce((s,c)=>s+c.high-c.low,0)/14,tolerance=Math.max(atr*.12,price!*.000005);
  const pivots:{price:number;side:'ABOVE'|'BELOW';touches:number}[]=[];
  for(let i=2;i<closed.length-2;i++){
    const c=closed[i],near=closed.slice(i-2,i+3);
    for(const side of ['ABOVE','BELOW'] as const){
      const p=side==='ABOVE'?c.high:c.low;
      if(!(side==='ABOVE'?near.every(x=>x.high<=p):near.every(x=>x.low>=p)))continue;
      // Once a later closed candle trades through a pool, it is no longer untouched.
      if(closed.slice(i+1).some(x=>side==='ABOVE'?x.high>p+tolerance:x.low<p-tolerance))continue;
      const cluster=pivots.find(x=>x.side===side&&Math.abs(x.price-p)<=tolerance);
      if(cluster)cluster.touches++;else pivots.push({price:p,side,touches:1});
    }
  }
  const levels=[...pivots.filter(x=>x.side==='ABOVE'&&x.price>price!).sort((a,b)=>a.price-b.price).slice(0,2),...pivots.filter(x=>x.side==='BELOW'&&x.price<price!).sort((a,b)=>b.price-a.price).slice(0,2)].map(x=>({...x,price:Number(x.price.toFixed(2)),distance:Number(Math.abs(x.price-price!).toFixed(2))}));
  const sweeps:{side:'BUY'|'SELL';level:number;at:number}[]=[];
  for(let i=Math.max(20,closed.length-6);i<closed.length;i++){
    const c=closed[i],prior=closed.slice(i-20,i),h=Math.max(...prior.map(x=>x.high)),l=Math.min(...prior.map(x=>x.low));
    if(c.high>h+tolerance&&c.close<h)sweeps.push({side:'SELL',level:h,at:c.time+60000});
    if(c.low<l-tolerance&&c.close>l)sweeps.push({side:'BUY',level:l,at:c.time+60000});
  }
  const move=price!-last!.close;
  const pressure=move>atr*.12?'BUY':move<-atr*.12?'SELL':'WAIT';
  const position=high>low?Math.round((price!-low)/(high-low)*100):50;
  const state=price!>high?'السعر فوق قمة 20 دقيقة · اختبار استمرار الاختراق':price!<low?'السعر تحت قاع 20 دقيقة · اختبار استمرار الكسر':position>=80?'قرب سيولة القمم':position<=20?'قرب سيولة القيعان':'السعر داخل نطاق السيولة';
  return {available:true,checkedAt:now,reason:state,levels,sweeps,rangeHigh:high,rangeLow:low,pressure,move:Number(move.toFixed(2)),bars:closed.length,note:'مناطق سيولة محتملة من القمم والقيعان؛ ليست أوامر معلقة مرصودة. الزخم اللحظي مقارنة بآخر إغلاق.'};
}
