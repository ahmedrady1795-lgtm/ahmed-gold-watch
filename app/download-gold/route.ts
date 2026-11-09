import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Force the Firefox/Windows browser to download an .mq5 file, not preview the code.
export async function GET() {
  const filename = 'AlQannas_Gold_M1_Limit_Demo.mq5';
  try {
    const source = await readFile(path.join(process.cwd(), 'public', 'downloads', filename), 'utf8');
    if (!source.includes('#property version   "1.16"'))
      return new Response('Gold EA download version mismatch', {status: 503});
    return new Response(source, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="AlQannas_Gold_M1_Limit_Demo.mq5"',
        'Content-Length': String(Buffer.byteLength(source, 'utf8')),
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return new Response('Gold EA download temporarily unavailable', {
      status: 503, headers: {'Cache-Control': 'no-store'}
    });
  }
}
