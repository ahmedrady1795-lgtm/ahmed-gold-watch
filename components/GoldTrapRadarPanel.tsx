'use client';

const price=(v:unknown)=>{
  const x=Number(v);
  return v!==null&&v!==undefined&&Number.isFinite(x)&&x>0?
    x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
};

/** Compact read-only radar. Never turns a proxy into an execution signal. */
export default function GoldTrapRadarPanel({radar,now}:{radar:any;now:number}){
  const quoteAt=Number(radar?.quoteAt||0),candleAt=Number(radar?.candleAt||0);
  const live=Boolean(radar?.ok&&quoteAt>0&&candleAt>0&&quoteAt<=now+1500&&
    now-quoteAt<=20000&&now-candleAt<=240000);
  const active=Boolean(live&&radar?.side!=='WAIT'&&radar?.target!=null);
  const direction=active?(radar.side==='BUY'?'صعود نحو سيولة القمم':'هبوط نحو سيولة القيعان'):'انتظار / مراقبة';
  const stage=active?(radar.state==='DOM_PRE_MOVE'?'ضغط مبكر · DOM وسيط':'فخ سحب سيولة · شموع مغلقة'):
    live&&radar?.state==='WATCH'?'تحت المراقبة':'بيانات غير كافية أو متأخرة';
  const items=[
    ['سيولة علوية',price(live?radar?.upperLiquidity:null)],
    ['سيولة سفلية',price(live?radar?.lowerLiquidity:null)],
    ['هدف مشروط',price(active?radar?.target:null)],
    ['إبطال',price(active?radar?.invalidation:null)]
  ];
  const note=active?String(radar.rationale||''):
    live?String(radar?.rationale||'لا يوجد نمط مكتمل'):
      'تم إيقاف الرادار حتى تصل شموع M1 وسعر حديث.';
  return <section aria-label="رادار مصايد سيولة الذهب" dir="rtl"
    style={{borderTop:'1px solid rgba(147,173,195,.19)',borderBottom:'1px solid rgba(147,173,195,.19)',
      padding:'9px 10px',margin:'9px 0',fontSize:12,color:'#b9d0df',display:'grid',gap:6}}>
    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'8px 16px'}}>
      <strong style={{fontSize:13,color:'#f3e3bd'}}>◈ رادار فخ سيولة الذهب</strong>
      <b style={{color:active?(radar.side==='BUY'?'#67ddb4':'#ff9999'):'#aabcc8'}}>
        {direction}</b>
      <span>{stage}</span>
      <span style={{marginInlineStart:'auto'}}>{live?String(radar?.sourceLabel||'شموع'):'OFFLINE'}</span>
      <span>قوة الأدلة: {active?Math.round(Number(radar?.score)||0)+'/100':'—'}</span>
    </div>
    <div style={{display:'flex',flexWrap:'wrap',gap:'6px 19px',alignItems:'center'}}>
      {items.map(([name,value])=><span key={name} style={{display:'inline-flex',gap:5,whiteSpace:'nowrap'}}>
        <span>{name}</span><b dir="ltr" style={{color:'#e5f0f8',fontVariantNumeric:'tabular-nums'}}>{value}</b>
      </span>)}
    </div>
    <small style={{fontSize:11,color:'#a7bdcb',lineHeight:1.5}}>
      {note} {active&&radar?.trigger!=null?'· شرط تأكيد الكسر '+price(radar.trigger):''}
      {' · '}مستويات مراقبة وليست أوامر تداول أو احتمال نجاح.
      {live&&Array.isArray(radar?.warnings)&&radar.warnings.length?
        ' · '+String(radar.warnings[0]):''}
    </small>
  </section>;
}
