import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Vercel Cron calls this once a day (vercel.json) with Authorization: Bearer $CRON_SECRET. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const base = process.env.TURVO_SYNC_URL;
  const token = process.env.LOADS_API_TOKEN;
  if (!base || !token) return res.status(500).json({ error: 'Missing TURVO_SYNC_URL or LOADS_API_TOKEN' });
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/loads/sync?days=45`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(await r.text());
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Railway: ${err instanceof Error ? err.message : String(err)}` });
  }
}
