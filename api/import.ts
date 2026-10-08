import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Forwards historical loads (parsed from a Turvo CSV export in the browser) to the
 * Railway service, which merges them into loads.json. Needed for "same period last
 * year": Turvo's API only returns shipments created in the last 180 days.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const base = process.env.TURVO_SYNC_URL;
  const token = process.env.LOADS_API_TOKEN;
  if (!base || !token) {
    return res.status(500).json({ error: 'Missing TURVO_SYNC_URL or LOADS_API_TOKEN on the server' });
  }
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/loads/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
    });
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(await r.text());
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Railway: ${err instanceof Error ? err.message : String(err)}` });
  }
}
