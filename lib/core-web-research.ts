// Public web access for voice-led market research. Never fetch a user-provided URL.
// All outbound calls use a fixed public Google News RSS endpoint and short timeouts.
export type VoiceNewsItem={title:string;source:string;url:string;publishedAt:number|null};
export type VoiceNewsResult={ok:boolean;query:string;checkedAt:number;items:VoiceNewsItem[];error:string|null;cached:boolean};
const cache=new Map<string,{at:number,result:VoiceNewsResult}>();
const CACHE_MS=120000;
function decode(s:string){
  return s.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(1114111,Number(n)||32)))
    .replace(/\s+/g,' ').trim();
}
function xmlTag(source:string,tag:string){
  const escaped=tag.replace(/[^a-z]/gi,'');
  const m=source.match(new RegExp('<'+escaped+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+escaped+'>','i'));
  return decode(m?.[1]||'');
}
function queryFor(question:string,asset:'GOLD'|'BTC'|'BOTH'){
  const topic=question
    .replace(/(ابحث|دور|دوّر|هات|هاتلي|جيب|جيبي|شوف|اخبار|أخبار|نت|الإنترنت|الانترنت|علي|على|عن|آخر|اخر|تطورات|ايه|إيه|أخبار|النهاردة|اليوم|تحديثات|عايز|عاوز|معلومات|بحث)/g,' ')
    .replace(/[^\p{L}\p{N}\s.%\-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,80);
  const fallback=asset==='GOLD'?'أسعار الذهب الفيدرالي الدولار اليوم':
    asset==='BTC'?'bitcoin BTC ETF crypto market today':
    'gold bitcoin markets Federal Reserve latest';
  return (topic.length>=3?topic:fallback).slice(0,100);
}
export async function searchMarketNews(question:string,asset:'GOLD'|'BTC'|'BOTH'='BOTH'):Promise<VoiceNewsResult>{
  const query=queryFor(question,asset),now=Date.now();
  const hit=cache.get(query);
  if(hit&&now-hit.at<CACHE_MS)return {...hit.result,cached:true};
  const url='https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=ar&gl=EG&ceid=EG:ar';
  try{
    const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500),
      headers:{'User-Agent':'GoldWatch-VoiceMarketResearch/1.0','Accept':'application/rss+xml, application/xml, text/xml'}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const xml=(await response.text()).slice(0,700000);
    const blocks=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,12);
    const items:VoiceNewsItem[]=[];
    for(const [,block] of blocks){
      const title=xmlTag(block,'title').slice(0,210);
      const link=xmlTag(block,'link').trim();
      const source=xmlTag(block,'source').slice(0,90)||'Google News';
      const stamp=Date.parse(xmlTag(block,'pubDate'));
      if(!title||!/^https:\/\/news\.google\.com\//i.test(link))continue;
      items.push({title,source,url:link,publishedAt:Number.isFinite(stamp)?stamp:null});
      if(items.length>=5)break;
    }
    const result={ok:items.length>0,query,checkedAt:now,items,error:items.length?'':'no_results',cached:false} as VoiceNewsResult;
    cache.set(query,{at:now,result});
    if(cache.size>60)cache.delete(cache.keys().next().value||'');
    return result;
  }catch(e){
    return {ok:false,query,checkedAt:now,items:[],error:e instanceof Error?e.message:'network_error',cached:false};
  }
}
