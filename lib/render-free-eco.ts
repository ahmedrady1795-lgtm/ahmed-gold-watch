/**
 * Render Free eco policy: background inference/observation runs only while
 * the actual dashboard is being viewed. Browser polling is read-only, and
 * may register activity even before the first AI snapshot exists.
 *
 * Uses process-local memory: a restart starts IDLE (safe for the free quota).
 * This is a resource guard, never permission to trade or proof of model quality.
 */
const globalState=globalThis as typeof globalThis & {__qannasLastViewerAt?:number};
export const VIEWER_IDLE_MS=120_000;

export function noteViewerActivity(now=Date.now()):void{
  if(Number.isFinite(now)&&now>0&&now>=Number(globalState.__qannasLastViewerAt||0))
    globalState.__qannasLastViewerAt=now;
}
export function renderFreeEcoEnabled():boolean{
  const mode=String(process.env.QANNAS_RENDER_ECO_MODE||'').trim().toLowerCase();
  if(mode==='0'||mode==='false')return false;
  if(mode==='1'||mode==='true')return true;
  // Scoped to the current free Render site; other deployments stay unchanged.
  return process.env.RENDER_SERVICE_NAME==='ahmed-gold-watch-free';
}
export function allowBackgroundWork(now=Date.now()):boolean{
  if(!renderFreeEcoEnabled())return true;
  const seen=Number(globalState.__qannasLastViewerAt||0);
  return seen>0&&Number.isFinite(now)&&now>=seen&&now-seen<=VIEWER_IDLE_MS;
}
