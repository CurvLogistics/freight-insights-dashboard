import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const base = process.env.TURVO_SYNC_URL;
  const token = process.env.LOADS_API_TOKEN;
  if (!base || !token) {
    return res.status(500).json({ error: 'Missing TURVO_SYNC_URL or LOADS_API_TOKEN on the server' });
  }
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/loads`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(await r.text());
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Railway: ${err instanceof Error ? err.message : String(err)}` });
  }
}