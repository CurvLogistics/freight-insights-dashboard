import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser, AuthError } from './_lib/auth.js';
import { filterLoadsForUser } from './_lib/permissions.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const base = process.env.TURVO_SYNC_URL;
  const token = process.env.LOADS_API_TOKEN;
  if (!base || !token) {
    return res.status(500).json({ error: 'Missing TURVO_SYNC_URL or LOADS_API_TOKEN on the server' });
  }
  try {
    const user = await requireUser(req);
    const r = await fetch(`${base.replace(/\/$/, '')}/loads`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.setHeader('Cache-Control', 'no-store');
    if (!r.ok) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(r.status).send(await r.text());
    }
    const data = await r.json();
    // Only loads this user may see leave the server; the dashboard computes every KPI from these.
    return res.status(200).json({ ...data, loads: filterLoadsForUser(data.loads ?? [], user) });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
    return res.status(502).json({ error: `Could not reach Railway: ${err instanceof Error ? err.message : String(err)}` });
  }
}
