'use client';
import {useEffect,useRef} from 'react';
export default function TradingViewGold(){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const host=ref.current;if(!host)return;
    host.innerHTML='';
    const widget=document.createElement('div');
    widget.className='tradingview-widget-container__widget';
    widget.style.height='calc(100% - 28px)';widget.style.width='100%';
    const credit=document.createElement('div');
    credit.className='tradingview-widget-copyright';
    credit.innerHTML='<a href="https://www.tradingview.com/symbols/XAUUSD/" rel="noopener nofollow" target="_blank"><span class="blue-text">XAU/USD chart</span></a><span class="trademark"> by TradingView</span>';
    const script=document.createElement('script');
    script.type='text/javascript';script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;
    script.innerHTML=JSON.stringify({autosize:true,symbol:'OANDA:XAUUSD',interval:'1',timezone:'Asia/Dubai',theme:'dark',style:'1',locale:'en',allow_symbol_change:false,calendar:false,details:false,hide_side_toolbar:true,hide_top_toolbar:false,hide_legend:false,hide_volume:true,hotlist:false,save_image:false,withdateranges:true,support_host:'https://www.tradingview.com'});
    host.append(widget,credit,script);
    return()=>{host.innerHTML='';};
  },[]);
  return <section className="panel"><div className="panelhead"><div><span className="eyebrow">LIVE CHART · TEMPORARY</span><h2>TradingView · XAU/USD</h2></div><span className="tag">M1</span></div><p className="muted">استخدم الرسم والمؤشرات المرئية مؤقتًا حتى ربط MT5. هذا الـwidget مستقل ولا يرسل قيم مؤشراته لمحرك التنفيذ.</p><div ref={ref} className="tradingview-widget-container" style={{height:520,width:'100%'}}/></section>;
}
