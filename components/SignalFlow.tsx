'use client';
import {Activity,ChartNoAxesCombined,CheckCircle2,ShieldCheck,TriangleAlert,Wifi,Waypoints} from 'lucide-react';
type Props={analysis:any;health:any;quote:any;rules:any};
const cls=(v:boolean)=>v?'gate ok':'gate wait';
export default function SignalFlow({analysis,health,quote,rules}:Props){
  const score=analysis?.score?Math.max(Number(analysis.score.long||0),Number(analysis.score.short||0)):0;
  const dataOk=Boolean(quote?.status==='live'&&health?.status!=='halted'&&analysis?.metrics);
  const regimeOk=Boolean(analysis?.regime&& !['shock','unknown'].includes(analysis.regime.key));
  const adxOk=Boolean(analysis?.metrics&&Number(analysis.metrics.adx)>=Number(rules?.adx||22));
  const scoreOk=score>=Number(rules?.minScore||76);
  const ready=analysis?.state==='setup'&&Boolean(analysis?.signal);
  const mt5=Boolean(health?.services?.mt5Bridge?.fresh);
  const gates=[
    {label:'البيانات',sub:dataOk?'Live':'انتظار',ok:dataOk,icon:Wifi},
    {label:'حالة السوق',sub:analysis?.regime?.label||'غير محسوم',ok:regimeOk,icon:Waypoints},
    {label:'قوة الاتجاه',sub:analysis?.metrics?`ADX ${Number(analysis.metrics.adx).toFixed(1)}`:'—',ok:adxOk,icon:Activity},
    {label:'التوافق',sub:`${score}/100`,ok:scoreOk,icon:ChartNoAxesCombined},
    {label:'إشارة مكتملة',sub:ready?'READY':'WAIT',ok:ready,icon:CheckCircle2},
    {label:'تنفيذ MT5',sub:mt5?'متصل':'لاحقًا',ok:mt5,icon:ShieldCheck},
  ];
  return <section className="signalflow"><div className="flowhead"><div><span className="eyebrow">TRADE GATE</span><h3>بوابة الصفقة</h3></div><span className={ready?'flowbadge ready':'flowbadge'}>{ready?'جاهزة للمراجعة':'الشروط لم تكتمل'}</span></div><div className="flowgrid">{gates.map(({label,sub,ok,icon:Icon})=><div className={cls(ok)} key={label}><Icon size={17}/><div><strong>{label}</strong><small>{sub}</small></div>{ok?<CheckCircle2 size={15}/>:<TriangleAlert size={15}/>}</div>)}</div><div className="scorebar"><span style={{width:`${Math.min(100,Math.max(0,score))}%`}}/><small>أعلى توافق حالي {score}/100 · الحد {Number(rules?.minScore||76)}/100</small></div></section>;
}
