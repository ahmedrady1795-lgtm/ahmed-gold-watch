import type {NewsIntelligence} from './news-intelligence';
export type SentimentReading={asset:'GOLD'|'BTC';kind:'VIX_DAILY'|'CRYPTO_FEAR_GREED';
 value:number|null;asOf:number|null;source:string;available:boolean};
export type SniperMarketContext={newsSide:'BUY'|'SELL'|'WAIT';newsRisk:number;
 stress:boolean;reason:string;asOf:number};
/** Context changes the quality ranking, never fabricates an entry or vetoes analysis. */
export function assessSniperMarketContext(input:{now:number;asset:'GOLD'|'BTC';
 news?:NewsIntelligence|null;newsObservedAt?:number|null;newsReady:boolean;
 sentiment?:SentimentReading|null}):SniperMarketContext{
 const {now}=input,n=input.news,s=input.sentiment;
 const recent=(t:unknown,max:number)=>typeof t==='number'&&Number.isFinite(t)&&t>0&&t<=now&&now-t<=max;
 const newsFresh=input.newsReady&&n?.ok&&n.asset===input.asset&&
   recent(input.newsObservedAt,180000)&&recent(n.checkedAt,180000);
 const eventAt=Number(n?.event?.time);
 const released=newsFresh&&n?.directional&&Number.isFinite(n.surprise)&&
   n.surprise!=null&&eventAt<=now&&now-eventAt<=30*60000&&
   (n.phase==='RELEASED'||n.phase==='POST_EVENT');
 const newsSide=released&&(n!.side==='BUY'||n!.side==='SELL')?n!.side:'WAIT';
 const newsRisk=newsFresh&&Number.isFinite(n?.risk)?Math.max(0,Math.min(100,n!.risk)):0;
 const sentimentFresh=s?.available&&s.asset===input.asset&&
   s.kind===(input.asset==='GOLD'?'VIX_DAILY':'CRYPTO_FEAR_GREED')&&
   recent(s.asOf,input.asset==='GOLD'?4*86400000:36*3600000)&&
   typeof s.value==='number'&&Number.isFinite(s.value)&&s.value>=0&&s.value<=100;
 const stress=Boolean(sentimentFresh&&(input.asset==='GOLD'?s!.value!>=25:
   s!.value!<=20||s!.value!>=80));
 return {newsSide,newsRisk,stress,asOf:now,reason:
   (newsFresh?(newsSide==='WAIT'?'الأخبار: سياق تقلب بلا اتجاه مؤكد':
     'نتيجة خبر منشورة: '+(newsSide==='BUY'?'ترجيح صعود':'ترجيح هبوط')):'الأخبار: غير متاحة/قديمة')+
   ' · '+(sentimentFresh?(s!.kind==='VIX_DAILY'?'VIX يومي Cboe: ':'خوف/طمع Alternative.me: ')+s!.value:
     'مؤشر الخوف: غير متاح/قديم')+
   (stress?' · تقلب مرتفع؛ تفضيل إعادة الاختبار':'')};
}
