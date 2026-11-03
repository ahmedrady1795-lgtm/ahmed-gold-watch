'use client';

import {useEffect,useMemo,useState} from 'react';
import {closedM1ChartBars,fixedM1PriceRange,type M1Bar} from '../lib/sniper-mt5-m1';
import {sourceVenue,updateSampledLiveCandle,visibleSampledLiveCandle,type SampledLiveCandle} from '../lib/sampled-live-candle';

type Quote={ok?:boolean;price?:number;source?:string;sourceTime?:number}|null|undefined;
type Level={price:number|null;label:string;kind:'TRIGGER'|'STOP'|'TARGET'};
type Props={
  asset:'GOLD'|'BTC';history:M1Bar[];historicalSource:string;quote:Quote;
  now:number;marketOpen:boolean;providerTransition:boolean;
  levels:Level[];
};
const fmt=(v:number)=>v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const clock=(at:number)=>new Date(at).toLocaleTimeString('en-GB',{
  hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dubai'});
const W=430,H=660,LEFT=9,RIGHT=348,TOP=28,BOTTOM=622;
const UP='#43d7c5',DOWN='#ef6478';

export default function SniperMT5M1Chart(p:Props){
  const [sampled,setSampled]=useState<SampledLiveCandle|null>(null);
  const bars=useMemo(()=>closedM1ChartBars(p.history,p.now,36),[p.history,p.now]);
  const latest=bars.at(-1);
  const lastClosedAt=latest?latest.time+60000:0;
  const quotePrice=Number(p.quote?.price),quoteAt=Number(p.quote?.sourceTime);
  const source=String(p.quote?.source||'');
  const venue=sourceVenue(source);
  const matched=venue!=='UNKNOWN'&&venue===sourceVenue(p.historicalSource);
  const quoteFresh=p.marketOpen&&!p.providerTransition&&p.quote?.ok===true&&
    Number.isFinite(quotePrice)&&quotePrice>0&&Number.isFinite(quoteAt)&&
    quoteAt<=p.now+1000&&p.now-quoteAt>=0&&p.now-quoteAt<=10000&&matched;
  useEffect(()=>{
    if(!quoteFresh){setSampled(null);return;}
    setSampled(prev=>updateSampledLiveCandle(prev,{
      now:p.now,at:quoteAt,price:quotePrice,sourceKey:source,
      historicalSource:p.historicalSource,lastClosedAt
    }));
  },[p.now,quoteAt,quotePrice,source,p.historicalSource,lastClosedAt,quoteFresh]);
  const partial=quoteFresh?visibleSampledLiveCandle(sampled,p.now,lastClosedAt,source,p.historicalSource):null;
  const range=useMemo(()=>fixedM1PriceRange(bars),[bars]);
  const toY=(v:number)=>TOP+(range.high-v)/(range.high-range.low)*(BOTTOM-TOP);
  // The viewport depends only on CLOSED M1, never on tick updates.
  const observed=bars.length>0&&(p.now-lastClosedAt<125000)&&p.marketOpen&&
    !p.providerTransition;
  const currentPrice=partial?.close??latest?.close??null;
  const priceStatus=partial?'LIVE · عينة تيك جزئية':observed?'آخر إغلاق M1':'آخر شموع محفوظة';
  const slots=38,step=(RIGHT-LEFT-20)/slots;
  const first=RIGHT-(bars.length+(partial?1:0))*step+step*.5;
  const candle=(c:M1Bar,x:number,key:string,isLive=false)=>{
    const rising=c.close>=c.open,color=rising?UP:DOWN;
    const wickTop=toY(c.high),wickBottom=toY(c.low);
    const bodyTop=Math.min(toY(c.open),toY(c.close));
    const bodyHeight=Math.max(1.3,Math.abs(toY(c.open)-toY(c.close)));
    return <g key={key} className={isLive?'mt5-m1-live-candle':'mt5-m1-closed-candle'}>
      <line x1={x} x2={x} y1={wickTop} y2={wickBottom}
        stroke={color} strokeWidth="1.3"/>
      <rect x={x-3.3} y={bodyTop} width="6.6" height={bodyHeight}
        fill={color} stroke={color} strokeWidth=".25"/>
      <title>{(isLive?'جزئي · أول تيك مرصود وليس فتح دقيقة معتمد':'مغلق · مصدر الشموع')+
        ' · '+clock(c.time)+' O '+fmt(c.open)+' H '+fmt(c.high)+
        ' L '+fmt(c.low)+' C '+fmt(c.close)}</title>
    </g>;
  };
  const axis=Array.from({length:11},(_,i)=>range.high-i*(range.high-range.low)/10);
  const levels=p.levels.filter(l=>l.price!=null&&Number.isFinite(l.price)&&l.price>0)
    .filter(l=>l.price!>=range.low&&l.price!<=range.high).slice(0,4);
  const markerY=currentPrice!=null?Math.max(TOP,Math.min(BOTTOM,toY(currentPrice))):null;
  const previous=bars.at(-2);
  return <div className="sniper-mt5-m1" role="region"
    aria-label={'شارت M1 الحقيقي لل'+(p.asset==='GOLD'?'ذهب':'بيتكوين')+' على طريقة MetaTrader'}>
    <div className="sniper-mt5-m1-top">
      <b>{p.asset==='GOLD'?'XAUUSD':'BTCUSD'} · M1</b>
      <span>{priceStatus}{partial?' · '+partial.count+' تيك':''}</span>
    </div>
    <svg viewBox={'0 0 '+W+' '+H} preserveAspectRatio="none"
      role="img" aria-label="شموع دقيقة مغلقة حقيقية من مصدر واحد، شمعة جزئية فقط عند توافر تيكات حديثة، ومقياس أسعار على اليمين">
      <defs><clipPath id={'mt5-m1-plot-'+p.asset}>
        <rect x={LEFT} y={TOP} width={RIGHT-LEFT} height={BOTTOM-TOP}/>
      </clipPath></defs>
      <rect width={W} height={H} fill="#000"/>
      <line x1={RIGHT+2} x2={RIGHT+2} y1={TOP} y2={BOTTOM} stroke="#2a3037" strokeWidth="1"/>
      {axis.map((price,i)=><g key={'grid-'+i}>
        <line x1={LEFT} x2={RIGHT} y1={toY(price)} y2={toY(price)}
          stroke="#1b242b" strokeDasharray="2 7" strokeOpacity=".48"/>
        <text x={RIGHT+7} y={toY(price)+3.5} fill="#c2c9d0"
          fontSize="10.5" textAnchor="start" direction="ltr">{fmt(price)}</text>
      </g>)}
      <g clipPath={'url(#mt5-m1-plot-'+p.asset+')'}>
        {bars.map((c,i)=>candle(c,first+i*step,'closed-'+c.time))}
        {partial&&candle(partial,first+bars.length*step,'live-'+partial.time,true)}
        {levels.map((l,i)=><g key={'level-'+i}>
          <line x1={LEFT} x2={RIGHT} y1={toY(l.price!)} y2={toY(l.price!)}
            stroke={l.kind==='STOP'?'#e9899d':l.kind==='TARGET'?'#79d8bd':'#c9b989'}
            strokeWidth=".95" strokeDasharray="5 4" opacity=".8"/>
          <text x={LEFT+4} y={toY(l.price!)-3}
            stroke="#000" strokeWidth="2" paintOrder="stroke"
            fill={l.kind==='STOP'?'#e9899d':l.kind==='TARGET'?'#79d8bd':'#c9b989'}
            fontSize="8.5" textAnchor="start">{l.label+' · '+fmt(l.price!)}</text>
        </g>)}
        {markerY!=null&&<line x1={LEFT} x2={RIGHT} y1={markerY} y2={markerY}
          stroke={partial?(partial.close>=partial.open?UP:DOWN):'#a5bdc9'}
          strokeDasharray="3 3" opacity=".75" strokeWidth=".9"/>}
      </g>
      {markerY!=null&&<g>
        <rect x={RIGHT+3} y={markerY-12} width={W-RIGHT-4} height="24"
          rx="2" fill={partial?(partial.close>=partial.open?'#147c70':'#aa3a54'):'#355061'}/>
        <text x={RIGHT+9} y={markerY+4} fontSize="12" fontWeight="800"
          fill="#fff" textAnchor="start" direction="ltr">{fmt(currentPrice!)}</text>
      </g>}
      {bars.length>1&&[0,.5,1].map((v,i)=>{
        const b=bars[Math.min(bars.length-1,Math.round((bars.length-1)*v))];
        return <text key={i} x={first+(bars.length-1)*step*v} y={H-13}
          fill="#929da5" fontSize="10" textAnchor={i===0?'start':i===2?'end':'middle'}
          direction="ltr">{clock(b.time)}</text>;
      })}
      {!bars.length&&<text x={(LEFT+RIGHT)/2} y={H/2}
        textAnchor="middle" fill="#9db4c2" fontSize="13">
        لا توجد شموع M1 مغلقة من المصدر
      </text>}
      {bars.length===1&&previous==null&&<text x={LEFT+8} y={TOP+20}
        fill="#e2c68a" fontSize="10">بداية سلسلة شموع جديدة بعد انقطاع المصدر</text>}
    </svg>
    <p>الشموع السابقة مغلقة فعلًا؛ الشمعة الحية جزئية من تيكات نفس المصدر عند توفرها.
      مستويات التفعيل والإبطال للمراقبة، وليست أوامر BUY أو SELL حقيقية.</p>
  </div>;
}
