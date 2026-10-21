import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'qannas-forward-test-'));
process.env.SPOT_FORWARD_LOG_PATH=path.join(dir,'forward.json');
try{
  const {recordAndEvaluateSpot,settleFromClosedMinute}=
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
  const verify=async()=>[[due,'100','104','100','103.5','1',
    due+minute-1,'10000','0','0','5500','0']];
  const final=await recordAndEvaluateSpot([],verify,due+2*minute);
  assert.equal(final.total,1);
  assert.equal(final.hit3pct,1);
  assert.equal(final.pending,0);
  assert.equal(final.avgReturnPct,3.5);
  assert.equal(final.storage,'ephemeral-runtime');
  const old=JSON.parse(await fs.readFile(process.env.SPOT_FORWARD_LOG_PATH,'utf8'));
  assert.equal(old[0].status,'SETTLED');
  assert.equal(old[0].returnPct,3.5);
  assert.equal((await recordAndEvaluateSpot([],verify,due+3*minute)).total,1);
  assert.equal(settleFromClosedMinute({...old[0],status:'PENDING'},
    [[due,'100','105','90','104','0',due+minute*4]],due+2*minute),null,
    'No future or unclosed candles accepted');
  console.log('PASS: frozen timestamp/price, 24h-only outcome, exact closed candle, no duplicate, no future fills.');
}finally{
  delete process.env.SPOT_FORWARD_LOG_PATH;
  await fs.rm(dir,{recursive:true,force:true});
}
