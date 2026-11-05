import fs from 'node:fs/promises';
import {renderFreeEcoEnabled,VIEWER_IDLE_MS} from './render-free-eco.ts';

/**
 * Share the dashboard's process-local viewer lease with standalone recorder
 * processes in the SAME Render container. No external service, disk volume or
 * upstream request is required. Fail closed if /tmp is not readable.
 *
 * This is a CPU/network budget, not a market-data quality or trading gate.
 */
export const RENDER_VIEWER_LEASE_PATH='/tmp/qannas-render-viewer-lease-v1.json';

export async function publishViewerLease(now=Date.now()):Promise<void>{
  if(!renderFreeEcoEnabled())return;
  if(!Number.isSafeInteger(now)||now<=0)return;
  const tmp=RENDER_VIEWER_LEASE_PATH+'.writing-'+process.pid+'-'+process.hrtime.bigint();
  try{
    await fs.writeFile(tmp,JSON.stringify({at:now}),{mode:0o600});
    await fs.rename(tmp,RENDER_VIEWER_LEASE_PATH);
  }catch{
    // Never break the dashboard/snapshot because the shared lease is missing.
    await fs.unlink(tmp).catch(()=>{});
  }
}
export async function sidecarWorkAllowed(now=Date.now()):Promise<boolean>{
  if(!renderFreeEcoEnabled())return true;
  if(!Number.isSafeInteger(now)||now<=0)return false;
  try{
    const raw=await fs.readFile(RENDER_VIEWER_LEASE_PATH,'utf8');
    if(raw.length>128)return false;
    const at=JSON.parse(raw)?.at;
    return Number.isSafeInteger(at)&&at>0&&at<=now&&now-at<=VIEWER_IDLE_MS;
  }catch{return false;}
}
