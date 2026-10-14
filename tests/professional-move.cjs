const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('vm'),ts=require('typescript');
const ex={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/professional-move.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:ex});
const now=Date.parse('2026-10-14T17:00:00Z');
const bars=(period,side='BUY',n=84)=>{
  const values=[];let prev=100;
  for(let i=0;i<n;i++){
    const delta=(i%4===0?-.25:.24)*(side==='BUY'?1:-1);
    const close=prev+delta,open=prev;
    values.push({time:now-(n-i)*period,open,close,
      high:Math.max(open,close)+.035,low:Math.min(open,close)-.035});
    prev=close;
  }
  return values;
};
const frames=(side='BUY')=>({m1:bars(60000,side),m5:bars(300000,side),
  m15:bars(900000,side),h1:bars(3600000,side)});
const up=ex.evaluateProfessionalMove({now,frames:frames('BUY'),adxM5:28});
assert.equal(up.dataReady,true);
assert.equal(up.side,'BUY');
assert.equal(up.status,'CONFIRMED');
assert.ok(up.score>=68);
assert.ok(up.trigger>0&&up.invalidation>0&&up.trigger>up.invalidation);
assert.equal(up.confirmedAt,now);
assert.ok(up.reason.includes('إغلاق'));
const down=ex.evaluateProfessionalMove({now,frames:frames('SELL'),adxM5:28});
assert.equal(down.side,'SELL');
assert.equal(down.status,'CONFIRMED');
assert.ok(down.trigger<down.invalidation);
const mismatched=ex.evaluateProfessionalMove({now,
  frames:{...frames('BUY'),h1:bars(3600000,'SELL')},adxM5:28});
assert.equal(mismatched.status,'WAIT','H1 opposition must block direction');
assert.equal(mismatched.side,'WAIT');
const weak=ex.evaluateProfessionalMove({now,frames:frames('BUY'),adxM5:11});
assert.equal(weak.status,'WAIT','ADX lower than 18 does not qualify trend');
const old=ex.evaluateProfessionalMove({now:now+900000,frames:frames('BUY'),adxM5:28});
assert.equal(old.status,'WAIT','stale feeds must refuse a forecast');
assert.equal(old.dataReady,false);
const gap=frames('BUY');
gap.m5=gap.m5.filter((_,i)=>i!==82);
assert.equal(ex.evaluateProfessionalMove({now,frames:gap,adxM5:28}).status,'WAIT','cannot confirm two M5 closes across a gap');
const corrupted=frames('BUY');
corrupted.m5=[...corrupted.m5,{time:now-300000,open:100,high:1,low:2,close:100}];
assert.equal(ex.evaluateProfessionalMove({now,frames:corrupted,adxM5:28}).side,'BUY','reject malformed OHLC without overriding a valid bar');
console.log('PASS: closed-bar MTF directional forecasts, two-candle breakout, ADX, gap, stale and anti-opposition guards');
