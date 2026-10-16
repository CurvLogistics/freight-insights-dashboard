import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';

/**
 * Temporary admin gate for routes that change shared data (sync, import).
 * The admin enters ADMIN_TOKEN once in Settings; the browser sends it as `x-admin-token`.
 * Replaced by a Clerk role check in ticket 15.
 */
export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_TOKEN is not set on the server' });
    return false;
  }
  const header = req.headers['x-admin-token'];
  const given = Array.isArray(header) ? header[0] : header ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}