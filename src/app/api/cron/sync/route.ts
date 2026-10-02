import { getDb } from '@/db';
import { syncAll } from '@/lib/sync';

// Called daily by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const results = await syncAll(await getDb());
  // Only counts — never user ids or URLs — in the response/logs.
  const failed = results.filter((r) => !r.ok).length;
  console.log(`calendar sync: ${results.length - failed} ok, ${failed} failed`);
  return Response.json({ synced: results.length - failed, failed });
}
