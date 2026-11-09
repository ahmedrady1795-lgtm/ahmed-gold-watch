import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sniper 2.0 is a NEW optional MT5 EA; the legacy /download-gold is untouched.
export async function GET() {
  const filename = 'AlQannas_Sniper2_Gold_M1_Demo.mq5';
  try {
    const source = await readFile(path.join(process.cwd(), 'public', 'downloads', filename), 'utf8');
    if (!source.includes('#property version   "2.00"') ||
        !source.includes('InpMagic                = 560179520'))
      return new Response('Sniper 2.0 EA version mismatch', {status: 503});
    return new Response(source, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="AlQannas_Sniper2_Gold_M1_Demo.mq5"',
        'Content-Length': String(Buffer.byteLength(source, 'utf8')),
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return new Response('Sniper 2.0 download temporarily unavailable', {
      status: 503, headers: {'Cache-Control': 'no-store'}
    });
  }
}
