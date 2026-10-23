const assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/binance-cooldown.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const now=Date.parse('2026-10-22T00:00:00Z');
assert.equal(out.spotBackoffMs(418,'120',now),120000);
assert.equal(out.spotBackoffMs(429,'2',now),2000);
assert.equal(out.spotBackoffMs(418,'invalid',now),600000);
assert.equal(out.spotBackoffMs(429,null,now),90000);
assert.equal(out.spotBackoffMs(200,'120',now),0);
assert.equal(out.spotBackoffMs(418,new Date(now+300000).toUTCString(),now),300000);
assert.equal(out.spotBackoffMs(418,'99999999',now),259200000);
const src=fs.readFileSync('app/api/spot-radar/route.ts','utf8');
assert.ok(src.includes('binanceBlockedUntil'),'API must preserve cooling interval across requests');
assert.ok(src.includes('spotBackoffMs'),'API must respect Retry-After');
assert.ok(src.includes("status:'binance_cooldown'"),'UI must receive explicit cooldown status');
// Regression: one HTTP 429 during gateway discovery must not cancel a healthy
// gateway; apply process-wide cooldown only when all probe gateways fail.
assert.ok(src.includes('const rateLimited:Response[]=[]'),
  'Gateway discovery should retain isolated 429 responses until healthy gateways are checked');
assert.ok(src.includes("if(r.status===429){rateLimited.push(r);"),
  'A 429 probe must be recorded rather than immediately blocking every gateway');
assert.ok(src.indexOf("const winner=checks.find")<src.indexOf("if(rateLimited.length)binanceCooldown(rateLimited[0])"),
  'A healthy gateway must be selected before a 429 cooldown is applied');
assert.ok(src.includes("if(r.status===418){binanceCooldown(r);"),
  'HTTP 418 must continue to stop on an IP-wide ban');
assert.ok(src.includes('let rateLimited:Response|null=null;')&&
  src.includes('if(rateLimited)binanceCooldown(rateLimited);'),
  'Data requests should try one fallback gateway before applying 429 cooldown');
assert.ok(!src.includes('if(r.status===418||r.status===429)binanceCooldown(r);'),
  'Do not turn any gateway probe 429 into an immediate global cooldown');
console.log('PASS: Binance Retry-After and IP-ban cooldown; isolated 429 failover regression guard');
