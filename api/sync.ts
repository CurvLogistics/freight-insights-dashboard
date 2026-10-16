import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from './_adminAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!requireAdmin(req, res)) return;
  const base = process.env.TURVO_SYNC_URL;
  const token = process.env.LOADS_API_TOKEN;
  if (!base || !token) {
    return res.status(500).json({ error: 'Missing TURVO_SYNC_URL or LOADS_API_TOKEN on the server' });
  }
  const days = typeof req.query.days === 'string' ? req.query.days : '45';
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/loads/sync?days=${encodeURIComponent(days)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(await r.text());
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Railway: ${err instanceof Error ? err.message : String(err)}` });
  }
}