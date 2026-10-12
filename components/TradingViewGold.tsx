'use client';
import {useEffect,useRef,useState} from 'react';

type Asset='GOLD'|'BTC';
type Interval='1'|'5'|'15'|'60';
const symbols:Record<Asset,{symbol:string;name:string;url:string}>={
  GOLD:{symbol:'OANDA:XAUUSD',name:'الذهب XAU/USD',url:'https://www.tradingview.com/symbols/XAUUSD/'},
  BTC:{symbol:'COINBASE:BTCUSD',name:'بيتكوين BTC/USD',url:'https://www.tradingview.com/symbols/BTCUSD/'}
};

/** External TradingView candles are visual reference only: never drive MT5 execution. */
export default function TradingViewGold(){
  const hostRef=useRef<HTMLDivElement>(null);
  const [asset,setAsset]=useState<Asset>('GOLD');
  const [interval,setIntervalValue]=useState<Interval>('5');
  const info=symbols[asset];
  useEffect(()=>{
    const host=hostRef.current;
    if(!host)return;
    host.replaceChildren();
    const widget=document.createElement('div');
    widget.className='tradingview-widget-container__widget';
    widget.style.height='100%';
    widget.style.width='100%';
    const script=document.createElement('script');
    script.type='text/javascript';
    script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async=true;
    script.textContent=JSON.stringify({
      autosize:true,symbol:info.symbol,interval,
      timezone:'Asia/Dubai',theme:'dark',style:'1',locale:'en',
      allow_symbol_change:false,calendar:false,details:false,
      hide_side_toolbar:false,hide_top_toolbar:false,hide_legend:false,
      hide_volume:true,hotlist:false,save_image:false,
      withdateranges:true,support_host:'https://www.tradingview.com'
    });
    host.append(widget,script);
    return()=>{host.replaceChildren();};
  },[info.symbol,interval]);
  return <section className="live-trading-chart" aria-label="الشارت المباشر">
    <header className="live-trading-chart-head">
      <div><strong>الرسم البياني المباشر · {info.name}</strong>
        <small>TradingView · بيانات مرجعية مستقلة عن محرك القناص</small></div>
      <div className="live-trading-chart-actions">
        <div role="group" aria-label="اختر الأصل" className="live-chart-toggle">
          <button type="button" aria-pressed={asset==='GOLD'} onClick={()=>setAsset('GOLD')}>الذهب</button>
          <button type="button" aria-pressed={asset==='BTC'} onClick={()=>setAsset('BTC')}>بيتكوين</button>
        </div>
        <select value={interval} aria-label="الفريم الزمني" onChange={e=>setIntervalValue(e.target.value as Interval)}>
          <option value="1">M1</option><option value="5">M5</option>
          <option value="15">M15</option><option value="60">H1</option>
        </select>
      </div>
    </header>
    <div key={info.symbol+'-'+interval} ref={hostRef} className="tradingview-widget-container live-trading-chart-embed"/>
    <p className="live-trading-chart-note">لو مزود الشارت محجوب على متصفحك، <a href={info.url} target="_blank" rel="noopener noreferrer">افتح الرسم على TradingView ↗</a>. الشموع هنا للاستعراض؛ قد تختلف عن سعر Exness.</p>
  </section>;
}
