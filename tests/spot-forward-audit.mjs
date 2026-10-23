import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qannas-forward-test-'));
process.env.SPOT_FORWARD_LOG_PATH=path.join(dir,'forward.json');
try{
  const {recordAndEvaluateSpot,settleFromClosedMinute,settleFromForwardCandles}=
    await import('../lib/spot-forward-audit.ts');
  const start=Date.parse('2026-10-20T16:00:00Z'),minute=60000,day=86400000;
  const candidate={symbol:'TESTUSDT',price:100,
    outlook24h:{state:'HIGH',rankScore:80}};
  const none=async()=>[];
  const first=await recordAndEvaluateSpot([candidate],none,start);
  assert.equal(first.total,0,'No fake 24h wins before a full day');
  assert.equal(first.pending,1,'Freeze exactly one forecast at the observed price');
  const journal=JSON.parse(await fs.readFile(process.env.SPOT_FORWARD_LOG_PATH,'utf8'));
  assert.equal(journal[0].entry,100);
  assert.equal(journal[0].dueAt,start+day);
  await recordAndEvaluateSpot([candidate],none,start+minute);
  const repeat=JSON.parse(await fs.readFile(process.env.SPOT_FORWARD_LOG_PATH,'utf8'));
  assert.equal(repeat.length,1,'Repeat polls do not create duplicate predictions');
  const due=start+day;
  assert.equal(settleFromClosedMinute(repeat[0],[[due,'1','1','1','104',
    '0',due+minute-1]],due-1000),null,'Do not settle before future minute closes');
  const verify=async(symbol,recordedAt,dueAt)=>{
    const rows=[];
    const firstHour=(Math.floor(recordedAt/3600000)+1)*3600000;
    const lastHour=Math.floor(dueAt/3600000)*3600000;
    for(let t=Math.ceil(recordedAt/minute)*minute;t<firstHour;t+=minute){
      const first=t===Math.ceil(recordedAt/minute)*minute;
      rows.push([t,'100',first?'104':'103.6','99','103.5','1',
        t+minute-1,'10000','0','0','5500','0']);
    }
    for(let t=firstHour;t<lastHour;t+=3600000)
      rows.push([t,'100','104','99','103.5','1',t+3600000-1,
        '100000','0','0','55000','0']);
    for(let t=lastHour;t<=dueAt+2*minute;t+=minute)
      rows.push([t,'100','104','99','103.5','1',t+minute-1,
        '10000','0','0','5500','0']);
    return rows;
  };
  const final=await recordAndEvaluateSpot([],verify,due+2*minute);
  assert.equal(final.total,1);
  assert.equal(final.hit3pct,1);
  assert.equal(final.pending,0);
  assert.equal(final.avgReturnPct,3.5);
  assert.equal(final.peakAudited,1);
  assert.equal(final.peakHit3pct,1);
  assert.equal(final.preMoveAudited,0);
  assert.equal(final.storage,'ephemeral-runtime');
  const old=JSON.parse(await fs.readFile(process.env.SPOT_FORWARD_LOG_PATH,'utf8'));
  assert.equal(old[0].status,'SETTLED');
  assert.ok(Math.abs(old[0].returnPct-3.5)<1e-9);
  assert.equal((await recordAndEvaluateSpot([],verify,due+3*minute)).total,1);
  assert.equal(settleFromClosedMinute({...old[0],status:'PENDING'},
    [[due,'100','105','90','104','0',due+minute*4]],due+2*minute),null,
    'No future or unclosed candles accepted');

  // A pre-move alert sees +4% intraday, then closes only +0.5% at expiry.
  // The forward audit must record the peak and adverse excursion separately.
  const hour=3600000,runStart=start,runDue=runStart+day;
  const forward=[];
  for(let t=runStart+minute;t<runStart+hour;t+=minute){
    const first=t===runStart+minute;
    forward.push([t,'100',first?'104':'101',first?'99':'99.5',
      first?'102':'100.2','10',t+minute-1,'10000','0','0','6000','0']);
  }
  for(let t=runStart+hour;t<runDue;t+=hour){
    forward.push([t,'100','101','99.8','100.1','10',t+hour-1,
      '100000','0','0','60000','0']);
  }
  forward.push([runDue,'100','101','99.9','100.5','10',runDue+minute-1,
    '10000','0','0','6000','0']);
  const pred={id:'PREMOVE',symbol:'PREMOVEUSDT',recordedAt:runStart,dueAt:runDue,
    entry:100,rankScore:42,signalType:'PREMOVE',status:'PENDING'};
  const peakResult=settleFromForwardCandles(pred,forward,runDue+2*minute);
  assert.ok(peakResult,'Complete contiguous forward candles settle the observation');
  assert.ok(Math.abs(peakResult.maxHighPct-4)<1e-8,'Record the maximum rise AFTER signal time');
  assert.ok(Math.abs(peakResult.returnPct-.5)<1e-9,
    'Peak capture must stay distinct from 24h closing return');
  assert.ok(Math.abs(peakResult.maxLowPct+1)<1e-8,'Record adverse excursion separately');
  const gap=forward.filter((_,i)=>i!==30);
  assert.equal(settleFromForwardCandles(pred,gap,runDue+2*minute),null,
    'Missing forward candles must not be treated as a valid pre-rise result');
  console.log('PASS: 24h close audit, pre-rise peak/adverse excursion, closed candles, no duplicate, no future fills, and gap rejection.');
}finally{
  delete process.env.SPOT_FORWARD_LOG_PATH;
  await fs.rm(dir,{recursive:true,force:true});
}
