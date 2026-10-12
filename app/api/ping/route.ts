// Lightweight platform health endpoint. Do not poll market providers here.
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { ok: true, service: 'gold-watch', checkedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
