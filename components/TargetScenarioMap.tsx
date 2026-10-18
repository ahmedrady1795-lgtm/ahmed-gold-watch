'use client';
import {useMemo,useState} from 'react';
import {buildTargetScenarioMap} from '../lib/target-scenario-map';
type Bar={open:number;high:number;low:number;close:number};
export default function TargetScenarioMap({history,targets,side,anchor,stop,enabled}:{
  history:readonly Bar[];targets:readonly {stage:number;price:number}[];
  side:string;anchor:number|null;stop:number|null;enabled:boolean;
}){
  const [detail,setDetail]=useState(false);
  const revision=history.slice(-36).map(c=>[c.open,c.high,c.low,c.close].join(':')).join('|');
  const goalKey=targets.map(t=>`${t.stage}:${t.price}`).join('|');
  // The map is frozen between closed-candle updates, including hover refreshes.
  const model=useMemo(()=>enabled?buildTargetScenarioMap(history,anchor,side,targets,stop):null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision,goalKey,anchor,side,stop,enabled]);
  if(!model?.bars.length)return null;
  const real=history.slice(-12),bars=[...real,...model.bars];
  const prices=[...bars.flatMap(c=>[c.low,c.high]),...targets.map(t=>t.price)];
  const lo=Math.min(...prices),hi=Math.max(...prices),span=Math.max(hi-lo,.01);
  const width=detail?Math.max(1000,bars.length*13+150):1000,height=460;
  const y=(p:number)=>30+(hi-p)/span*360;
  const step=(width-160)/bars.length,x=(i:number)=>35+(i+.5)*step;
  const format=(p:number)=>p.toLocaleString('en-US',{maximumFractionDigits:2});
  return <section className="sniper-target-map" aria-label="خريطة الوصول المشروط لجميع الأهداف">
    <header><div><strong>خريطة الأهداف كاملة · {side==='BUY'?'صعود':'هبوط'}</strong>
      <p>شكل توضيحي مشروط بالوصول للأهداف؛ ليس توقعًا للشموع أو توقيت الوصول.</p></div>
      <button type="button" aria-pressed={detail} onClick={()=>setDetail(v=>!v)}>{detail?'كل الأهداف في شاشة واحدة':'تفصيل الشموع ↔'}</button></header>
    <div className="sniper-target-map-levels">{targets.map(t=><span key={t.stage}>TP{t.stage} <b dir="ltr">{format(t.price)}</b></span>)}</div>
    <div style={{overflowX:'auto',direction:'ltr'}}>
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:detail?width:'100%',minWidth:detail?width:600,display:'block'}} role="img" aria-label="شموع تاريخية ثم مسار افتراضي مشروط نحو الأهداف">
      <rect width={width} height={height} fill="#091a28"/>
      <rect x={x(real.length)-step/2} y={20} width={width-x(real.length)-100} height={390} fill="#12313c" opacity=".5"/>
      {targets.map(t=><g key={t.stage}><line x1={25} x2={width-105} y1={y(t.price)} y2={y(t.price)} stroke="#448e83" strokeDasharray="5 5"/><text x={width-98} y={y(t.price)+4} fill="#a7efcf" fontSize="12">TP{t.stage} {format(t.price)}</text></g>)}
      {bars.map((c,i)=><g key={i} opacity={i<real.length?1:.7}><line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={c.close>=c.open?'#51dca5':'#f08095'}/><rect x={x(i)-step*.32} y={y(Math.max(c.open,c.close))} width={Math.max(.6,step*.64)} height={Math.max(.7,Math.abs(y(c.open)-y(c.close)))} fill={c.close>=c.open?'#51dca5':'#f08095'}/></g>)}
      <text x={30} y={440} fill="#94b3c7" fontSize="13">M1 history → conditional stages · no ETA</text>
    </svg></div>
    {!model.complete&&<p>الأهداف كلها ظاهرة؛ امتداد الشموع بلغ حد العرض. الأهداف البعيدة تظل مشروطة.</p>}
  </section>;
}
