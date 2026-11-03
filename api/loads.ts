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
    const root = base.replace(/\/$/, '');
    const auth = { Authorization: `Bearer ${token}` };
    res.setHeader('Cache-Control', 'no-store');

    // List of saved snapshots for the "As of" picker (no load data, so no permission filter needed).
    if (req.query.list === 'snapshots') {
      const s = await fetch(`${root}/loads/snapshots`, { headers: auth });
      res.setHeader('Content-Type', 'application/json');
      return res.status(s.status).send(await s.text());
    }

    // ?asOf=<ISO time> = the latest snapshot saved at or before that time; otherwise live data.
    const asOf = typeof req.query.asOf === 'string' && req.query.asOf ? req.query.asOf : null;
    const r = await fetch(`${root}/loads${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`, { headers: auth });
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
