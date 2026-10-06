export const dynamic='force-dynamic';

const bootedAt=Date.now();
const WARMUP_MS=12_000;

export async function GET(){
  const now=Date.now();
  const uptimeMs=now-bootedAt;
  const ready=uptimeMs>=WARMUP_MS;
  return Response.json(
    {ok:ready,status:ready?'ready':'warming',checkedAt:now,uptimeMs,warmupMs:WARMUP_MS},
    {
      status:ready?200:503,
      headers:{'Cache-Control':'no-store'}
    }
  );
}
