type Side='BUY'|'SELL'|'WAIT';
type ProbeCategory='PRICE'|'ORDER_BOOK'|'TRADES'|'DERIVATIVES'|'VOLUME'|'MACRO'|'NEWS'|'WEB'|'BROKER'|'CANDLES';

export type MarketToolProbe={
  id:string;name:string;category:ProbeCategory;asset:'GOLD'|'BTC';
  ok:boolean;quality:number;latencyMs:number|null;freshnessMs:number|null;
  side:Side;score:number;value:number|null;unit:string|null;
  detail:string;source:string;
};
export type MarketToolMesh={
  ok:boolean;asset:'GOLD'|'BTC';checkedAt:number;cached:boolean;
  tools:MarketToolProbe[];
  summary:{
    available:number;total:number;quality:number;liveQuality:number;
    side:Side;buy:number;sell:number;edge:number;agreement:number;
    priceConsensus:number|null;priceSpreadBps:number|null;
    derivatives:{fundingRate:number|null;openInterest:number|null;side:Side;score:number};
    warnings:string[];
  };
};

const cap=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const side=(v:number,gate=10):Side=>v>=gate?'BUY':v<=-gate?'SELL':'WAIT';
const caches=new Map<string,{at:number;value:MarketToolMesh}>();
const TTL=12_000;

async function timedJson(url:string,timeout=1800){
  const started=Date.now();
  try{
    const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'AhmedMarketToolMesh/1.0','Accept':'application/json'}});
    const j=await r.json().catch(()=>null);
    if(!r.ok)throw new Error('HTTP '+r.status);
    return {ok:true,j,latency:Date.now()-started,error:''};
  }catch(e){return {ok:false,j:null,latency:Date.now()-started,error:e instanceof Error?e.message:String(e)};}
}
function p(args:Partial<MarketToolProbe>&Pick<MarketToolProbe,'id'|'name'|'category'|'asset'>):MarketToolProbe{
  return {ok:false,quality:0,latencyMs:null,freshnessMs:null,side:'WAIT',score:0,value:null,unit:null,detail:'',source:'',...args};
}
function priceSide(changePct:number|null){
  if(changePct==null||!Number.isFinite(changePct))return {side:'WAIT' as Side,score:0};
  const s=cap(Math.abs(changePct)*18,0,70);
  return {side:changePct>.02?'BUY':changePct<-.02?'SELL':'WAIT',score:s};
}
function consensus(tools:MarketToolProbe[]){
  const usable=tools.filter(x=>x.ok&&x.side!=='WAIT'&&x.score>0&&x.quality>0);
  let buy=0,sell=0;
  for(const x of usable){
    const v=x.score*(x.quality/100);
    if(x.side==='BUY')buy+=v;else sell+=v;
  }
  const total=buy+sell,edge=total?Math.abs(buy-sell)/total*100:0,winner:Side=buy>sell?'BUY':sell>buy?'SELL':'WAIT';
  const agree=total?Math.max(buy,sell)/total*100:0;
  return {buy,sell,edge,agreement:agree,side:edge>=12?winner:'WAIT' as Side};
}
function priceConsensus(tools:MarketToolProbe[]){
  const prices=tools.filter(x=>x.ok&&x.category==='PRICE'&&x.value!=null&&Number.isFinite(x.value)&&x.value!>0).map(x=>Number(x.value));
  if(!prices.length)return {mid:null as number|null,spreadBps:null as number|null};
  const sorted=[...prices].sort((a,b)=>a-b),mid=sorted[Math.floor(sorted.length/2)];
  const spread=prices.length>1?(Math.max(...prices)-Math.min(...prices))/mid*10000:0;
  return {mid,spreadBps:spread};
}
function internalProbe(asset:'GOLD'|'BTC',id:string,name:string,category:ProbeCategory,data:any):MarketToolProbe{
  const ok=Boolean(data?.ok??data?.available??data);
  const confidence=cap(Number(data?.confidence??data?.quality??data?.score??0));
  const s=String(data?.side||'WAIT') as Side;
  return p({id,name,category,asset,ok,quality:ok?Math.max(35,confidence):0,side:s==='BUY'||s==='SELL'?s:'WAIT',score:confidence,value:Number.isFinite(Number(data?.price))?Number(data.price):null,detail:ok?'internal live context':'unavailable',source:String(data?.source||'internal')});
}

async function btcExternal():Promise<MarketToolProbe[]>{
  const rows=await Promise.all([
    timedJson('https://api.exchange.coinbase.com/products/BTC-USD/ticker',1600),
    timedJson('https://api.kraken.com/0/public/Ticker?pair=XBTUSD',1800),
    timedJson('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',1800),
    timedJson('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP',1800),
    timedJson('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP',1800)
  ]);
  const out:MarketToolProbe[]=[];
  {
    const r=rows[0],price=Number(r.j?.price),bid=Number(r.j?.bid),ask=Number(r.j?.ask),vol=Number(r.j?.volume);
    const imbalance=Number.isFinite(bid)&&Number.isFinite(ask)&&price>0?((price-(bid+ask)/2)/price)*200000:0;
    out.push(p({id:'coinbase_ticker',name:'Coinbase BTC ticker',category:'PRICE',asset:'BTC',ok:r.ok&&price>0,quality:r.ok?92:0,latencyMs:r.latency,side:side(imbalance,4),score:cap(Math.abs(imbalance)*3),value:price||null,unit:'USD',detail:r.ok?('volume '+(Number.isFinite(vol)?vol.toFixed(2):'n/a')):r.error,source:'Coinbase Exchange'}));
  }
  {
    const r=rows[1],row=Object.values(r.j?.result||{})[0] as any,price=Number(row?.c?.[0]),open=Number(row?.o),chg=price>0&&open>0?(price-open)/open*100:null,ps=priceSide(chg);
    out.push(p({id:'kraken_ticker',name:'Kraken BTC ticker',category:'PRICE',asset:'BTC',ok:r.ok&&price>0,quality:r.ok?86:0,latencyMs:r.latency,side:ps.side,score:ps.score,value:price||null,unit:'USD',detail:r.ok?('day '+(chg??0).toFixed(2)+'%'):r.error,source:'Kraken'}));
  }
  {
    const r=rows[2],x=r.j?.data?.[0],price=Number(x?.last),open=Number(x?.open24h),chg=price>0&&open>0?(price-open)/open*100:null,ps=priceSide(chg);
    out.push(p({id:'okx_ticker',name:'OKX BTC ticker',category:'PRICE',asset:'BTC',ok:r.ok&&price>0,quality:r.ok?86:0,latencyMs:r.latency,side:ps.side,score:ps.score,value:price||null,unit:'USDT',detail:r.ok?('24h '+(chg??0).toFixed(2)+'%'):r.error,source:'OKX'}));
  }
  {
    const r=rows[3],x=r.j?.data?.[0],fund=Number(x?.fundingRate),v=Number.isFinite(fund)?fund*100:null;
    const s=v==null?'WAIT':v>.015?'SELL':v<-.015?'BUY':'WAIT',score=v==null?0:cap(Math.abs(v)*1600,0,70);
    out.push(p({id:'okx_funding',name:'OKX BTC funding',category:'DERIVATIVES',asset:'BTC',ok:r.ok&&v!=null,quality:r.ok?78:0,latencyMs:r.latency,side:s,score,value:v,unit:'%',detail:r.ok?'crowding/contrarian context':r.error,source:'OKX perpetual'}));
  }
  {
    const r=rows[4],x=r.j?.data?.[0],oi=Number(x?.oiUsd??x?.oi);
    out.push(p({id:'okx_open_interest',name:'OKX BTC open interest',category:'DERIVATIVES',asset:'BTC',ok:r.ok&&Number.isFinite(oi)&&oi>0,quality:r.ok?76:0,latencyMs:r.latency,side:'WAIT',score:0,value:Number.isFinite(oi)?oi:null,unit:x?.oiUsd?'USD':'contracts',detail:r.ok?'open interest context':r.error,source:'OKX perpetual'}));
  }
  return out;
}

async function goldExternal():Promise<MarketToolProbe[]>{
  const rows=await Promise.all([
    timedJson('https://biquote.io/api/XAUUSD/quote',1600),
    timedJson('https://data-asg.goldprice.org/dbXRates/USD',1800),
    timedJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1m&range=1d&includePrePost=false',1900)
  ]);
  const out:MarketToolProbe[]=[];
  {
    const r=rows[0],x=r.j||{},bid=Number(x.bid),ask=Number(x.ask),mid=Number(x.mid)||((bid+ask)/2),chg=Number(x.dayDiffPercent),ps=priceSide(Number.isFinite(chg)?chg:null);
    out.push(p({id:'biquote_xau',name:'Biquote XAUUSD',category:'PRICE',asset:'GOLD',ok:r.ok&&mid>0,quality:r.ok?94:0,latencyMs:r.latency,side:ps.side,score:ps.score,value:mid||null,unit:'USD',detail:r.ok?String(x.marketState||'live'):r.error,source:'Biquote · MT5 XAUUSD'}));
  }
  {
    const r=rows[1],x=r.j?.items?.[0],price=Number(x?.xauPrice),chg=Number(x?.pcXau),ps=priceSide(Number.isFinite(chg)?chg:null);
    out.push(p({id:'goldprice_spot',name:'GoldPrice.org spot',category:'PRICE',asset:'GOLD',ok:r.ok&&price>0,quality:r.ok?70:0,latencyMs:r.latency,side:ps.side,score:ps.score,value:price||null,unit:'USD',detail:r.ok?'spot cross-check':r.error,source:'GoldPrice.org'}));
  }
  {
    const r=rows[2],chart=r.j?.chart?.result?.[0],q=chart?.indicators?.quote?.[0],closes=Array.isArray(q?.close)?q.close.filter((v:any)=>Number.isFinite(Number(v))).map(Number):[],price=closes.at(-1),first=closes.at(-16)??closes[0],chg=price&&first?(price-first)/first*100:null,ps=priceSide(chg);
    out.push(p({id:'comex_gc',name:'COMEX gold futures proxy',category:'PRICE',asset:'GOLD',ok:r.ok&&Number(price)>0,quality:r.ok?62:0,latencyMs:r.latency,side:ps.side,score:ps.score,value:Number(price)||null,unit:'USD',detail:r.ok?'GC=F proxy, confirmation only':r.error,source:'Yahoo Finance · COMEX GC=F'}));
  }
  return out;
}

export async function buildMarketToolMesh(args:{
  asset:'GOLD'|'BTC';now?:number;
  price?:number;marketLead?:any;liquidity?:any;tick?:any;marketData?:any;webIntel?:any;news?:any;
}):Promise<MarketToolMesh>{
  const now=Number(args.now||Date.now()),key=args.asset,hit=caches.get(key);
  if(hit&&now-hit.at<TTL)return {...hit.value,cached:true,checkedAt:now};
  const tools:MarketToolProbe[]=[];
  tools.push(internalProbe(args.asset,'market_lead','Market Lead','TRADES',args.marketLead));
  if(args.asset==='BTC'){
    tools.push(internalProbe('BTC','liquidity_engine','Liquidity / Order Book engine','ORDER_BOOK',args.liquidity));
  }else{
    tools.push(internalProbe('GOLD','mt5_tick','MT5 tick / microstructure','BROKER',args.tick));
  }
  if(args.marketData?.pricesReady)tools.push(p({id:'candles',name:'Multi-timeframe candles',category:'CANDLES',asset:args.asset,ok:true,quality:88,side:'WAIT',score:0,value:Number(args.price)||null,unit:'USD',detail:String(args.marketData?.priceSource||'candles'),source:String(args.marketData?.priceSource||'market data')}));
  for(const b of Array.isArray(args.marketData?.background)?args.marketData.background:[]){
    if(b?.value==null)continue;
    const change=Number(b?.percentChange),inverseGold=args.asset==='GOLD'&&(b?.key==='dxy'||b?.key==='us10y'||b?.key==='us2y');
    const raw=Number.isFinite(change)?change:0,score=cap(Math.abs(raw)*18,0,60),s0=raw>.02?'BUY':raw<-.02?'SELL':'WAIT';
    const s:Side=inverseGold?(s0==='BUY'?'SELL':s0==='SELL'?'BUY':'WAIT'):s0;
    tools.push(p({id:'macro_'+String(b.key),name:String(b.label||b.key),category:'MACRO',asset:args.asset,ok:true,quality:b.status==='live'?82:65,side:s,score,value:Number(b.value),unit:null,detail:String(b.status||''),source:String(b.source||'macro')}));
  }
  if(args.webIntel?.ok){
    const x=args.asset==='GOLD'?args.webIntel.gold:args.webIntel.btc;
    tools.push(p({id:'web_scout',name:'Web Market Scout',category:'WEB',asset:args.asset,ok:true,quality:cap(45+Number(x?.freshCount||0)*7,45,82),side:x?.side==='BUY'||x?.side==='SELL'?x.side:'WAIT',score:cap(Number(x?.confidence||0)),value:null,unit:null,detail:'fresh '+Number(x?.freshCount||0)+' / sources '+Number(x?.sourceCount||0),source:'public web/news'}));
  }
  const eventCount=Array.isArray(args.news)?args.news.length:0;
  tools.push(p({id:'news_calendar',name:'Economic/news calendar',category:'NEWS',asset:args.asset,ok:eventCount>0,quality:eventCount>0?78:0,side:'WAIT',score:0,value:eventCount,unit:'events',detail:eventCount+' relevant events',source:'official/free calendars'}));
  const ext=args.asset==='BTC'?await btcExternal():await goldExternal();
  tools.push(...ext);

  const c=consensus(tools),pc=priceConsensus(tools),available=tools.filter(x=>x.ok).length;
  const qRows=tools.filter(x=>x.ok),quality=qRows.length?qRows.reduce((a,b)=>a+b.quality,0)/qRows.length:0;
  const liveRows=qRows.filter(x=>x.category==='PRICE'||x.category==='ORDER_BOOK'||x.category==='TRADES'||x.category==='BROKER');
  const liveQuality=liveRows.length?liveRows.reduce((a,b)=>a+b.quality,0)/liveRows.length:0;
  const funding=tools.find(x=>x.id==='okx_funding'),oi=tools.find(x=>x.id==='okx_open_interest');
  const warnings:string[]=[];
  if(pc.spreadBps!=null&&pc.spreadBps>35)warnings.push('cross-source price dispersion high');
  if(available<Math.ceil(tools.length*.55))warnings.push('too many market tools unavailable');
  if(c.agreement<58&&c.side!=='WAIT')warnings.push('tool disagreement');
  const value:MarketToolMesh={
    ok:available>=3,asset:args.asset,checkedAt:now,cached:false,tools,
    summary:{
      available,total:tools.length,quality:Math.round(quality),liveQuality:Math.round(liveQuality),
      side:c.side,buy:Number(c.buy.toFixed(1)),sell:Number(c.sell.toFixed(1)),edge:Math.round(c.edge),agreement:Math.round(c.agreement),
      priceConsensus:pc.mid!=null?Number(pc.mid.toFixed(args.asset==='BTC'?2:3)):null,
      priceSpreadBps:pc.spreadBps!=null?Number(pc.spreadBps.toFixed(2)):null,
      derivatives:{fundingRate:funding?.value??null,openInterest:oi?.value??null,side:funding?.side||'WAIT',score:funding?.score||0},
      warnings
    }
  };
  caches.set(key,{at:now,value});return value;
}
