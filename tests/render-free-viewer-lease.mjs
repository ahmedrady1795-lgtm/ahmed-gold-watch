import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {publishViewerLease,sidecarWorkAllowed,RENDER_VIEWER_LEASE_PATH}
 from '../lib/render-free-viewer-lease.ts';

const previousService=process.env.RENDER_SERVICE_NAME;
const previousEco=process.env.QANNAS_RENDER_ECO_MODE;
const original=await fs.readFile(RENDER_VIEWER_LEASE_PATH,'utf8').catch(()=>null);
const t=Date.parse('2026-11-05T06:00:00Z');
try{
 process.env.RENDER_SERVICE_NAME='ahmed-gold-watch-free';
 delete process.env.QANNAS_RENDER_ECO_MODE;
 await fs.unlink(RENDER_VIEWER_LEASE_PATH).catch(()=>{});
 assert.equal(await sidecarWorkAllowed(t),false,'idle free site starts without active observer');
 await publishViewerLease(t);
 assert.equal(await sidecarWorkAllowed(t),true,'page heartbeat starts the independent observers');
 assert.equal(await sidecarWorkAllowed(t+120000),true,'viewer lease has bounded grace time');
 assert.equal(await sidecarWorkAllowed(t+120001),false,'closed page pauses sidecars after lease');
 assert.equal(await sidecarWorkAllowed(t-1),false,'future viewer heartbeat never authorizes prior ticks');
 await publishViewerLease(t+120002);
 assert.equal(await sidecarWorkAllowed(t+120002),true,'returning viewer resumes observations');
 await fs.writeFile(RENDER_VIEWER_LEASE_PATH,'{bad',{mode:0o600});
 assert.equal(await sidecarWorkAllowed(t),false,'corrupt shared file fails closed');
 await fs.writeFile(RENDER_VIEWER_LEASE_PATH,JSON.stringify({at:0}),{mode:0o600});
 assert.equal(await sidecarWorkAllowed(t),false,'zero timestamp cannot enable continuous work');
 process.env.QANNAS_RENDER_ECO_MODE='0';
 assert.equal(await sidecarWorkAllowed(t),true,'operator opt-out preserves other workloads');
 delete process.env.QANNAS_RENDER_ECO_MODE;
 process.env.RENDER_SERVICE_NAME='unrelated-service';
 assert.equal(await sidecarWorkAllowed(t),true,'other deployments keep legacy cadence');
 process.env.RENDER_SERVICE_NAME='ahmed-gold-watch-free';
 const worker=await fs.readFile('scripts/gold-preparation-worker.mjs','utf8');
 const radar=await fs.readFile('scripts/gold-radar-worker.mjs','utf8');
 const coinbase=await fs.readFile('scripts/radar-shadow-worker.mjs','utf8');
 const startup=await fs.readFile('scripts/start-with-audit-archive.mjs','utf8');
 const endpoint=await fs.readFile('app/api/ai-snapshot/route.ts','utf8');
 assert.match(worker,/if\(!\(await sidecarWorkAllowed\(\)\)\)return;/,
  'pre-break worker must skip every idle quote + historical refresh');
 assert.match(radar,/if\(!\(await sidecarWorkAllowed\(now\)\)\)return;/,
  'M1 radar must skip idle chart and disk observations');
 assert.match(coinbase,/const allowed=await sidecarWorkAllowed\(\)/,
  'Coinbase observer must recheck viewer every timer tick');
 assert.match(coinbase,/const prior=ws;ws=null;connected=false;/,
  'Coinbase L2 socket is closed while idle rather than draining traffic');
 assert.match(startup,/if\(renderFreeEcoEnabled\(\)\)return;/,
  'free startup must not force a market-wide Binance Spot warmup');
 assert.match(endpoint,/await publishViewerLease\(now\)/,
  'read-only dashboard snapshot publishes process-shared viewer lease');
}finally{
 if(previousService==null)delete process.env.RENDER_SERVICE_NAME;
 else process.env.RENDER_SERVICE_NAME=previousService;
 if(previousEco==null)delete process.env.QANNAS_RENDER_ECO_MODE;
 else process.env.QANNAS_RENDER_ECO_MODE=previousEco;
 if(original==null)await fs.unlink(RENDER_VIEWER_LEASE_PATH).catch(()=>{});
 else await fs.writeFile(RENDER_VIEWER_LEASE_PATH,original,{mode:0o600});
}
console.log('PASS: free-tier sidecars sleep without a viewer, no websocket leak, resumption and strict expiry');
