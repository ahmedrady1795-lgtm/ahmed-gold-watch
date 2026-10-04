type Side='BUY'|'SELL'|'WAIT';
type LockState={side:Side;since:number;lastAt:number;pendingSide:Side;pendingCount:number};
const locks=new Map<string,LockState>();

const sideFrom=(x:any):Side=>x==='BUY'?'BUY':x==='SELL'?'SELL':'WAIT';

export function masterArbitrate(asset:string,decision:any,scalp:any,now=Date.now()){
  const action=sideFrom(decision?.action),phase=String(decision?.phase||'WAIT'),fusion=sideFrom(decision?.fusion?.side);
  const motion=sideFrom(decision?.motion?.side),behavior=sideFrom(decision?.behavior?.side),liq=sideFrom(decision?.liquidity?.side);
  const hunter=sideFrom(decision?.hunter?.side);
  const scalpSide:Side=scalp?.action==='BUY'?'BUY':scalp?.action==='SELL'?'SELL':Number(scalp?.score?.long||0)-Number(scalp?.score?.short||0)>=18?'BUY':Number(scalp?.score?.short||0)-Number(scalp?.score?.long||0)>=18?'SELL':'WAIT';

  const vetoes=(decision?.vetoes||[]).map(String);
  const hardConflict=phase==='CONFLICT'||vetoes.some((v:string)=>/Conflict Gate|Liquidity Gate|Trap Gate|Micro Gate|Motion Gate|Behavior Gate/i.test(v));
  const votes=[fusion,motion,behavior,liq,hunter,scalpSide].filter(x=>x!=='WAIT');
  const buys=votes.filter(x=>x==='BUY').length,sells=votes.filter(x=>x==='SELL').length;
  const splitConflict=buys>=2&&sells>=2;
  const conflict=hardConflict||splitConflict;

  const fusionGap=Math.abs(Number(decision?.fusion?.buy||0)-Number(decision?.fusion?.sell||0));
  const confidence=Number(decision?.confidence||0);
  const strongEvidence=action!=='WAIT'&&confidence>=68&&fusionGap>=8&&!conflict;

  let lock=locks.get(asset);
  if(lock&&now-lock.lastAt>120000){locks.delete(asset);lock=undefined;}

  let masterAction:Side='WAIT',state='WAIT',reason='لا يوجد توافق كافٍ لإصدار اتجاه واحد.';
  let watchSide:Side='WAIT';

  if(conflict){
    state='CONFLICT';
    reason='المحركات الداخلية متعارضة؛ تم إلغاء أي BUY/SELL حتى يختفي التعارض.';
  }else if(strongEvidence){
    if(!lock||lock.side==='WAIT'||lock.side===action){
      masterAction=action;state='TRADE';
      reason='اتجاه واحد معتمد بعد توافق النواة وعدم وجود تعارض.';
      locks.set(asset,{side:action,since:lock?.side===action?lock.since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
    }else{
      const pendingCount=lock.pendingSide===action?lock.pendingCount+1:1;
      const reversalStrong=confidence>=76&&fusionGap>=12&&pendingCount>=3;
      if(reversalStrong){
        masterAction=action;state='TRADE';
        reason='تم السماح بعكس الاتجاه بعد 3 تأكيدات متتالية وتوافق قوي.';
        locks.set(asset,{side:action,since:now,lastAt:now,pendingSide:'WAIT',pendingCount:0});
      }else{
        state='REVERSAL_LOCK';
        reason=`منع قلب الاتجاه من ${lock.side} إلى ${action} حتى 3 تأكيدات قوية متتالية (${pendingCount}/3).`;
        locks.set(asset,{...lock,lastAt:now,pendingSide:action,pendingCount});
      }
    }
  }else{
    const candidates:[Side,number][]=[
      [fusion,Math.abs(Number(decision?.fusion?.buy||0)-Number(decision?.fusion?.sell||0))],
      [motion,Number(decision?.motion?.score||0)],
      [behavior,Number(decision?.behavior?.score||0)],
      [liq,Math.abs(Number(decision?.liquidity?.buy||0)-Number(decision?.liquidity?.sell||0))]
    ];
    const best=candidates.filter(([s])=>s!=='WAIT').sort((a,b)=>b[1]-a[1])[0];
    watchSide=best?.[0]||'WAIT';
    if(watchSide!=='WAIT'){
      state='WATCH';
      reason='يوجد ميل سوقي للمراقبة فقط، لكنه غير معتمد كصفقة.';
    }
    if(lock)locks.set(asset,{...lock,lastAt:now,pendingSide:'WAIT',pendingCount:0});
  }

  const locked=locks.get(asset);
  return {
    action:masterAction,
    state,
    watchSide,
    conflict,
    reason,
    lockedSide:locked?.side||'WAIT',
    lockAgeSeconds:locked?Math.max(0,Math.round((now-locked.since)/1000)):0,
    pendingReversal:locked?.pendingSide||'WAIT',
    pendingCount:locked?.pendingCount||0,
    evidence:{buyVotes:buys,sellVotes:sells,fusion,scalp:scalpSide,hunter,motion,behavior,liquidity:liq,confidence,fusionGap},
    trade:masterAction!=='WAIT'?decision?.trade||null:null
  };
}
