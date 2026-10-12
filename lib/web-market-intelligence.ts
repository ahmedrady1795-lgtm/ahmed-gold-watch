import fs from 'node:fs';
import path from 'node:path';
type Side='BUY'|'SELL'|'WAIT';
type Asset='GOLD'|'BTC';
type SourceKind='OFFICIAL'|'CRYPTO_MEDIA';

type SourceDef={
  id:string;name:string;url:string;kind:SourceKind;reliability:number;
  assets:Asset[];maxAgeMinutes:number;
};
type WebItem={
  sourceId:string;source:string;title:string;link:string|null;publishedAt:number|null;
  ageMinutes:number|null;reliability:number;asset:Asset;side:Side;impact:number;risk:number;
  reason:string;
};
export type WebMarketSignal={
  ok:boolean;asset:Asset;checkedAt:number;side:Side;confidence:number;risk:number;weight:number;
  directional:boolean;sourceCount:number;freshCount:number;items:WebItem[];reasons:string[];
};
export type WebMarketIntelligence={
  ok:boolean;checkedAt:number;cached:boolean;
  sources:{id:string;name:string;ok:boolean;itemCount:number;error?:string}[];
  gold:WebMarketSignal;btc:WebMarketSignal;
};

const SOURCES:SourceDef[]=[
  {id:'fed',name:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_all.xml',kind:'OFFICIAL',reliability:1,assets:['GOLD','BTC'],maxAgeMinutes:720},
  {id:'bls_jobs',name:'BLS Employment Situation',url:'https://www.bls.gov/feed/empsit.rss',kind:'OFFICIAL',reliability:1,assets:['GOLD','BTC'],maxAgeMinutes:720},
  {id:'bls_cpi',name:'BLS CPI',url:'https://www.bls.gov/feed/cpi.rss',kind:'OFFICIAL',reliability:1,assets:['GOLD','BTC'],maxAgeMinutes:720},
  {id:'cftc',name:'CFTC',url:'https://www.cftc.gov/RSS/RSSGP/rssgp.xml',kind:'OFFICIAL',reliability:.95,assets:['BTC'],maxAgeMinutes:1440},
  {id:'coindesk',name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/',kind:'CRYPTO_MEDIA',reliability:.78,assets:['BTC'],maxAgeMinutes:240}
];

const CACHE_MS=120000;
let cache:WebMarketIntelligence|null=null,lastRun=0,pending:Promise<WebMarketIntelligence>|null=null;

type SourceOutcome='HIT'|'FAIL'|'NEUTRAL';
type SourceStat={hits:number;fails:number;neutral:number;updatedAt:number};
type SourcePending={
  id:string;asset:Asset;sourceId:string;side:'BUY'|'SELL';at:number;dueAt:number;
  entry:number;barrier:number;impact:number;title:string;bestBps:number;worstBps:number;
};
type SourceRecent=SourcePending&{settledAt:number;exit:number;outcome:SourceOutcome};
type SourceStore={version:string;stats:Record<string,SourceStat>;pending:SourcePending[];recent:SourceRecent[]};

const WEB_LEARN_FILE='/data/web-source-learning.json';
const WEB_LEARN_FALLBACK='/tmp/web-source-learning.json';
const WEB_LEARN_VERSION='web-source-learning-v1';
let webLearnCache:SourceStore|null=null,webLearnDirty=false,webLearnSavedAt=0;
const blankSourceStat=():SourceStat=>({hits:0,fails:0,neutral:0,updatedAt:0});
function webLearnFile(){
  try{if(fs.existsSync(path.dirname(WEB_LEARN_FILE)))return WEB_LEARN_FILE;}catch{}
  return WEB_LEARN_FALLBACK;
}
function loadWebLearning():SourceStore{
  if(webLearnCache)return webLearnCache;
  for(const f of [WEB_LEARN_FILE,WEB_LEARN_FALLBACK]){
    try{
      const x=JSON.parse(fs.readFileSync(f,'utf8')) as SourceStore;
      if(x?.version===WEB_LEARN_VERSION&&x?.stats){webLearnCache=x;return x;}
    }catch{}
  }
  webLearnCache={version:WEB_LEARN_VERSION,stats:{},pending:[],recent:[]};
  return webLearnCache;
}
function saveWebLearning(force=false){
  const s=loadWebLearning(); if(!webLearnDirty)return;
  const now=Date.now(); if(!force&&now-webLearnSavedAt<3000)return;
  try{
    const f=webLearnFile(),tmp=f+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(s)); fs.renameSync(tmp,f);
    webLearnDirty=false;webLearnSavedAt=now;
  }catch{}
}
function sourceStat(asset:Asset,sourceId:string){
  const s=loadWebLearning(),k=asset+':'+sourceId;
  s.stats[k] ||= blankSourceStat(); return s.stats[k];
}
function sourceRecent(asset:Asset,sourceId:string,limit=12){
  return loadWebLearning().recent.filter(x=>x.asset===asset&&x.sourceId===sourceId).slice(0,limit);
}
function sourceView(asset:Asset,sourceId:string){
  const st=sourceStat(asset,sourceId),n=st.hits+st.fails,resolved=n+st.neutral;
  const recent=sourceRecent(asset,sourceId,12);
  let failureStreak=0;
  for(const r of recent){
    if(r.outcome==='FAIL')failureStreak++;
    else if(r.outcome==='HIT')break;
  }
  const posterior=(st.hits+4)/(n+8)*100;
  let weight=1;
  if(n>=8&&posterior<40)weight=.45;
  else if(n>=5&&posterior<46)weight=.65;
  else if(n>=4&&failureStreak>=3)weight=.62;
  else if(n>=8&&posterior>=62)weight=1.14;
  else if(n>=5&&posterior>=58)weight=1.08;
  return {
    hits:st.hits,fails:st.fails,neutral:st.neutral,directional:n,resolved,
    accuracy:n?Number((st.hits/n*100).toFixed(1)):null,
    posterior:Number(posterior.toFixed(1)),failureStreak,
    performanceWeight:weight,
    status:weight<=.5?'BLACKLISTED':weight<.8?'PENALIZED':weight>1?'PROMOTED':n>=4?'WATCH':'COLLECTING'
  };
}
function settleWebLearning(asset:Asset,price:number,now:number){
  if(!Number.isFinite(price)||price<=0)return;
  const s=loadWebLearning(),keep:SourcePending[]=[];
  for(const p of s.pending){
    if(p.asset!==asset){keep.push(p);continue;}
    const signed=(price-p.entry)*(p.side==='BUY'?1:-1);
    const bps=signed/Math.max(1e-9,p.entry)*10000;
    p.bestBps=Math.max(Number(p.bestBps||0),bps);
    p.worstBps=Math.max(Number(p.worstBps||0),-bps);
    const hit=signed>=p.barrier,fail=signed<=-p.barrier,expired=now>=p.dueAt;
    if(!hit&&!fail&&!expired){keep.push(p);continue;}
    const outcome:SourceOutcome=hit?'HIT':fail?'FAIL':'NEUTRAL';
    const st=sourceStat(p.asset,p.sourceId);
    if(outcome==='HIT')st.hits++; else if(outcome==='FAIL')st.fails++; else st.neutral++;
    st.updatedAt=now;
    s.recent.unshift({...p,settledAt:now,exit:price,outcome});
    if(s.recent.length>300)s.recent=s.recent.slice(0,300);
    webLearnDirty=true;
  }
  if(keep.length!==s.pending.length){s.pending=keep;webLearnDirty=true;}
}
function headlineId(asset:Asset,sourceId:string,publishedAt:number|null,title:string){
  let h=2166136261;
  const raw=asset+'|'+sourceId+'|'+String(publishedAt||0)+'|'+title.slice(0,140);
  for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36);
}
export function recordWebSourceOutcome(args:{asset:Asset;price:number|null;atr:number|null;signal:WebMarketSignal|null|undefined;now?:number}){
  const now=Number(args.now||Date.now()),price=Number(args.price),atr=Number(args.atr);
  if(!Number.isFinite(price)||price<=0)return {ok:false,reason:'invalid_price'};
  settleWebLearning(args.asset,price,now);
  const s=loadWebLearning(),signal=args.signal;
  if(signal?.items?.length){
    const seen=new Set<string>();
    for(const item of signal.items){
      if(item.side!=='BUY'&&item.side!=='SELL')continue;
      if(Number(item.impact||0)<30)continue;
      if(item.ageMinutes!=null&&Number(item.ageMinutes)>180)continue;
      if(seen.has(item.sourceId))continue;
      seen.add(item.sourceId);
      const id=headlineId(args.asset,item.sourceId,item.publishedAt,item.title);
      if(s.pending.some(x=>x.id===id)||s.recent.some(x=>x.id===id))continue;
      const baseAtr=Number.isFinite(atr)&&atr>0?atr:price*(args.asset==='BTC'?.0012:.0007);
      const barrier=Math.max(baseAtr*(args.asset==='BTC'?.28:.24),price*(args.asset==='BTC'?.00055:.00020));
      const horizonMs=item.sourceId==='fed'?30*60000:item.sourceId==='cftc'?20*60000:15*60000;
      s.pending.push({
        id,asset:args.asset,sourceId:item.sourceId,side:item.side as 'BUY'|'SELL',at:now,dueAt:now+horizonMs,
        entry:price,barrier,impact:Number(item.impact||0),title:item.title,bestBps:0,worstBps:0
      });
      webLearnDirty=true;
    }
  }
  if(s.pending.length>80)s.pending=s.pending.slice(-80);
  saveWebLearning(true);
  const sources=Object.fromEntries(SOURCES.filter(x=>x.assets.includes(args.asset)).map(x=>[x.id,sourceView(args.asset,x.id)]));
  return {
    ok:true,asset:args.asset,pending:s.pending.filter(x=>x.asset===args.asset).length,
    sources,storage:webLearnFile()
  };
}
function performanceReliability(asset:Asset,source:SourceDef){
  const v=sourceView(asset,source.id);
  return {view:v,effective:Number(cap(source.reliability*Number(v.performanceWeight||1),.32,1.12).toFixed(3))};
}

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const strip=(s:string)=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
function tags(xml:string,tag:string){
  const out:string[]=[];const re=new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','gi');let m;
  while((m=re.exec(xml))&&out.length<30)out.push(strip(m[1]));
  return out;
}
function parseFeed(xml:string){
  const blocks=[...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].slice(0,24).map(x=>x[2]);
  return blocks.map(b=>{
    const title=tags(b,'title')[0]||'';
    const linkTag=tags(b,'link')[0]||'';
    const href=(b.match(/<link[^>]+href=["']([^"']+)["']/i)||[])[1]||linkTag||null;
    const date=tags(b,'pubDate')[0]||tags(b,'updated')[0]||tags(b,'published')[0]||'';
    const description=tags(b,'description')[0]||tags(b,'summary')[0]||tags(b,'content')[0]||'';
    const ts=Date.parse(date);
    return {title,link:href,publishedAt:Number.isFinite(ts)?ts:null,description};
  }).filter(x=>x.title);
}
function freshness(ageMin:number|null,maxAge:number){
  if(ageMin==null)return .35;
  if(ageMin<0)return 0;
  if(ageMin<=15)return 1;
  if(ageMin<=60)return .90;
  if(ageMin<=180)return .72;
  if(ageMin<=360)return .52;
  if(ageMin<=maxAge)return .30;
  return 0;
}
function classify(source:SourceDef,asset:Asset,title:string,description:string,ageMin:number|null){
  const text=(title+' '+description).toLowerCase();
  const fresh=freshness(ageMin,source.maxAgeMinutes);
  if(fresh<=0)return {side:'WAIT' as Side,impact:0,risk:0,reason:'stale'};

  let side:Side='WAIT',impact=0,risk=0,reason='headline context only';
  const macro=/fomc|federal reserve|interest rate|inflation|cpi|consumer price|employment situation|payroll|unemployment|jobs|pce|ppi|rate cut|rate hike/i.test(text);
  const crypto=/bitcoin|btc|crypto|digital asset|stablecoin|exchange|etf|perpetual|derivatives/i.test(text);

  if(source.id==='fed'){
    risk=macro?76:34;
    const hawkish=/raise(?:s|d)? rates?|rate hike|higher for longer|restrictive|inflation remains elevated|inflation risk|tighten/i.test(text);
    const dovish=/cut(?:s|ting)? rates?|rate cut|easing|lower rates|disinflation|inflation (?:has )?slowed|downside risks to employment/i.test(text);
    if(hawkish&&!dovish){side='SELL';impact=72;reason='Fed headline reads hawkish';}
    else if(dovish&&!hawkish){side='BUY';impact=72;reason='Fed headline reads dovish';}
  }else if(source.id==='bls_jobs'||source.id==='bls_cpi'){
    // Official BLS releases are authoritative, but without a consensus comparison
    // the headline alone should raise event risk rather than invent direction.
    risk=macro?82:44;impact=0;side='WAIT';reason='official macro release; direction awaits surprise/market reaction';
  }else if(source.id==='cftc'){
    risk=crypto?62:30;
    const positive=/approv|no-action|clarif|framework|innovation|perpetual contracts?|digital asset markets?/i.test(text);
    const negative=/charge|fraud|enforcement|penalt|ban|violation|manipulat/i.test(text);
    if(asset==='BTC'&&crypto&&positive&&!negative){side='BUY';impact=52;reason='regulatory headline supportive for crypto market structure';}
    if(asset==='BTC'&&crypto&&negative&&!positive){side='SELL';impact=44;reason='regulatory/enforcement headline adds crypto risk';}
  }else if(source.id==='coindesk'&&asset==='BTC'){
    risk=crypto?58:24;
    const positive=/inflow|approval|approve|adoption|treasury (?:buys|adds)|buys bitcoin|accumulat|record demand|reserve|launch(?:es)? bitcoin|institutional demand|breakout/i.test(text);
    const negative=/outflow|hack|exploit|liquidat|crackdown|ban|lawsuit|sell-off|selloff|dump|fraud|collapse|breach/i.test(text);
    if(crypto&&positive&&!negative){side='BUY';impact=48;reason='fresh crypto headline supportive';}
    else if(crypto&&negative&&!positive){side='SELL';impact=48;reason='fresh crypto headline negative';}
  }

  if(asset==='GOLD'&&side!=='WAIT'&&(source.id==='fed')){
    // Fed direction mapping already matches risk assets/gold in broad terms:
    // dovish -> BUY gold, hawkish -> SELL gold.
  }else if(asset==='BTC'&&side!=='WAIT'&&source.id==='fed'){
    // Same broad liquidity/rates transmission for BTC, kept intentionally low-weight.
  }

  impact=Math.round(cap(impact*source.reliability*fresh,0,82));
  risk=Math.round(cap(risk*source.reliability*Math.max(.35,fresh),0,92));
  if(impact<28)side='WAIT';
  return {side,impact,risk,reason};
}
async function fetchSource(source:SourceDef,now:number){
  try{
    const r=await fetch(source.url,{cache:'no-store',headers:{'User-Agent':'AhmedGoldWebScout/1.0 (+public-market-research)'},signal:AbortSignal.timeout(6500)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const text=await r.text();
    const rows=parseFeed(text).slice(0,18);
    return {source,ok:true,rows,error:null as string|null,now};
  }catch(e){
    return {source,ok:false,rows:[] as any[],error:e instanceof Error?e.message:String(e),now};
  }
}
function buildSignal(asset:Asset,results:any[],now:number):WebMarketSignal{
  const items:WebItem[]=[];
  for(const res of results){
    const baseSource:SourceDef=res.source;
    if(!baseSource.assets.includes(asset)||!res.ok)continue;
    const perf=performanceReliability(asset,baseSource);
    const source:SourceDef={...baseSource,reliability:perf.effective};
    for(const row of res.rows){
      const age=row.publishedAt!=null?Math.max(0,(now-row.publishedAt)/60000):null;
      if(age!=null&&age>source.maxAgeMinutes)continue;
      const c=classify(source,asset,row.title,row.description,age);
      if(c.impact<=0&&c.risk<30)continue;
      items.push({
        sourceId:source.id,source:source.name,title:row.title,link:row.link,publishedAt:row.publishedAt,
        ageMinutes:age==null?null:Number(age.toFixed(1)),reliability:source.reliability,asset,
        side:c.side,impact:c.impact,risk:c.risk,reason:c.reason
      });
    }
  }
  items.sort((a,b)=>(b.impact+b.risk*.45)-(a.impact+a.risk*.45));
  const top=items.slice(0,12),directional=top.filter(x=>x.side!=='WAIT'&&x.impact>=28);
  let buy=0,sell=0;
  for(const x of directional){
    const freshnessWeight=x.ageMinutes==null?.45:Math.max(.2,1-Math.min(360,x.ageMinutes)/480);
    const v=x.impact*x.reliability*freshnessWeight;
    if(x.side==='BUY')buy+=v;else sell+=v;
  }
  const total=buy+sell,edge=total?Math.abs(buy-sell)/total*100:0;
  let side:Side=total&&edge>=18?(buy>sell?'BUY':'SELL'):'WAIT';
  const strongest=Math.max(...top.map(x=>x.impact),0),risk=Math.max(...top.map(x=>x.risk),8);
  let confidence=side==='WAIT'?0:Math.round(cap(34+edge*.34+strongest*.18,0,72));
  if(directional.length<1){side='WAIT';confidence=0;}
  // Websites are contextual evidence, never the primary market-direction engine.
  const weight=side==='WAIT'?0:Number(Math.min(.10,.025+confidence/1200).toFixed(3));
  const reasons=top.slice(0,4).map(x=>`${x.source}: ${x.title} · ${x.reason}`);
  return {
    ok:true,asset,checkedAt:now,side,confidence,risk,directional:side!=='WAIT',
    weight,sourceCount:new Set(top.map(x=>x.sourceId)).size,
    freshCount:top.filter(x=>x.ageMinutes==null||x.ageMinutes<=180).length,
    items:top,reasons
  };
}
async function run(now:number):Promise<WebMarketIntelligence>{
  const results=await Promise.all(SOURCES.map(s=>fetchSource(s,now)));
  const out:WebMarketIntelligence={
    ok:results.some(x=>x.ok),checkedAt:now,cached:false,
    sources:results.map(x=>({id:x.source.id,name:x.source.name,ok:x.ok,itemCount:x.rows.length,...(x.error?{error:x.error}:{})})),
    gold:buildSignal('GOLD',results,now),btc:buildSignal('BTC',results,now)
  };
  cache=out;lastRun=Date.now();return out;
}
export async function getWebMarketIntelligence(now=Date.now()):Promise<WebMarketIntelligence>{
  if(cache&&Date.now()-lastRun<CACHE_MS)return {...cache,cached:true,checkedAt:now};
  if(pending)return pending;
  pending=run(now).finally(()=>{pending=null;});
  return pending;
}

export function mergeNewsWithWeb(news:any,web:WebMarketSignal){
  if(!news)return news;
  if(!web?.ok)return {...news,web};
  let side:Side=news.side==='BUY'||news.side==='SELL'?news.side:'WAIT';
  let confidence=Number(news.confidence||0),risk=Math.max(Number(news.risk||0),Number(web.risk||0));
  let directional=Boolean(news.directional),weight=Number(news.weight||0);
  const reasons=[...(Array.isArray(news.reasons)?news.reasons:[])];
  const eventSide:Side=side;
  if(web.side!=='WAIT'){
    if(side==='WAIT'){
      side=web.side;confidence=Math.min(58,Math.round(web.confidence*.82));
      directional=confidence>=38;weight=directional?Math.min(.08,Number(web.weight||0)):0;
      reasons.push('Web Scout أضاف ميلًا سياقيًا محدودًا؛ السيولة والسعر يظلان شرط التأكيد.');
    }else if(side===web.side){
      confidence=Math.min(88,Math.round(confidence+Math.min(8,web.confidence*.10)));
      weight=Math.min(.18,weight+Math.min(.035,Number(web.weight||0)*.45));
      reasons.push('المواقع الحديثة تؤكد اتجاه الخبر/السياق.');
    }else{
      confidence=Math.max(0,Math.round(confidence-Math.min(14,8+web.confidence*.08)));
      if(web.confidence>=58&&confidence<48){side='WAIT';directional=false;weight=0;}
      reasons.push('المواقع الحديثة تعارض الاتجاه؛ تم خفض الثقة بدل إجبار قرار.');
    }
  }
  return {
    ...news,side,confidence,risk,directional:directional&&side!=='WAIT',weight,
    web:{...web,eventSideBeforeWeb:eventSide},reasons
  };
}
