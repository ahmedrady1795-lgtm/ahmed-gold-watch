/**
 * MT5 XAUUSD indicative quote-activity profile.
 * This is a distribution of BID/ASK quote UPDATES by price, NOT traded
 * contracts, executed aggressor flow or COMEX Volume Profile.
 */
export type BrokerQuoteTick={at:number;receivedAt:number;price:number;bid:number;ask:number};
export type Mt5QuoteProfile={
 ready:boolean;source:'MT5_QUOTE_TICKS';basis:'QUOTE_UPDATE_COUNT';
 asOf:number|null;from:number|null;samples:number;seconds:number;
 poc:number|null;vah:number|null;val:number|null;binSize:number|null;
 upticks:number;downticks:number;directionalPct:number;
 reason:string;actionable:false
};
const round=(x:number,d=2)=>Number(x.toFixed(d));
const empty=(reason:string):Mt5QuoteProfile=>({
 ready:false,source:'MT5_QUOTE_TICKS',basis:'QUOTE_UPDATE_COUNT',asOf:null,
 from:null,samples:0,seconds:0,poc:null,vah:null,val:null,binSize:null,
 upticks:0,downticks:0,directionalPct:0,reason,actionable:false
});
export function buildMt5QuoteProfile(raw:readonly BrokerQuoteTick[],now:number):Mt5QuoteProfile{
 if(!Number.isFinite(now)||now<=0)return empty('وقت الرصد غير صالح');
 const rows=raw.filter(t=>t&&[t.at,t.receivedAt,t.price,t.bid,t.ask].every(Number.isFinite)&&
   t.at>0&&t.at<=now+1000&&t.receivedAt<=now+1000&&
   now-t.receivedAt>=0&&now-t.receivedAt<=30000&&
   t.price>0&&t.bid>0&&t.ask>=t.bid&&t.price>=t.bid-2*(t.ask-t.bid)&&
   t.price<=t.ask+2*(t.ask-t.bid))
   .sort((a,b)=>a.at-b.at||a.receivedAt-b.receivedAt)
   .filter((t,i,a)=>i===0||t.at!==a[i-1].at||t.price!==a[i-1].price)
   .slice(-600);
 const newest=rows.at(-1),first=rows[0];
 if(!newest||!first||rows.length<12)return empty('عينات تحديث سعر MT5 غير كافية');
 if(now-newest.receivedAt>3500)return empty('تحديثات أسعار MT5 متأخرة');
 const span=newest.receivedAt-first.receivedAt;
 if(span<6000)return empty('يلزم رصد تحديثات السعر لمدة 6 ثوانٍ على الأقل');
 const midSpread=rows.reduce((s,t)=>s+t.ask-t.bid,0)/rows.length;
 // A stable quoted-price grid; do NOT invent trade sizes from tickVolume.
 const step=Math.max(.01,round(Math.max(midSpread*.75,newest.price*.000005),2));
 const bins=new Map<number,number>();
 let up=0,down=0;
 for(let i=0;i<rows.length;i++){
   const t=rows[i],price=round(Math.round(t.price/step)*step,2);
   bins.set(price,(bins.get(price)||0)+1);
   if(i>0){if(t.price>rows[i-1].price)up++;else if(t.price<rows[i-1].price)down++;}
 }
 if(bins.size<2)return empty('لا توجد مستويات سعرية مختلفة في عينة التحديثات');
 const sorted=[...bins.entries()].sort((a,b)=>a[0]-b[0]);
 let pivot=0;
 for(let i=1;i<sorted.length;i++)
   if(sorted[i][1]>sorted[pivot][1])pivot=i;
 let l=pivot,r=pivot,covered=sorted[pivot][1];
 while(covered<rows.length*.7&&(l>0||r<sorted.length-1)){
   const left=l>0?sorted[l-1][1]:-1,right=r<sorted.length-1?sorted[r+1][1]:-1;
   if(right>=left&&r<sorted.length-1)covered+=sorted[++r][1];
   else if(l>0)covered+=sorted[--l][1];
   else break;
 }
 return {ready:true,source:'MT5_QUOTE_TICKS',basis:'QUOTE_UPDATE_COUNT',
   asOf:newest.receivedAt,from:first.receivedAt,samples:rows.length,
   seconds:round(span/1000,1),poc:sorted[pivot][0],val:sorted[l][0],
   vah:sorted[r][0],binSize:step,upticks:up,downticks:down,
   directionalPct:up+down?round((up-down)/(up+down)*100,1):0,
   reason:'بروفايل نشاط الأسعار من تحديثات Bid/Ask لدى الوسيط، ليس حجم تداول منفذًا',
   actionable:false};
}
