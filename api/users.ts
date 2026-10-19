import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient } from '@clerk/backend';
import { requireUser, requireRole, AuthError, type Role } from './_lib/auth.js';

/** 'none' = signed up but not given access yet (no role and no broker, so they see no loads). */
type AssignableRole = Role | 'none';
const ROLES: AssignableRole[] = ['none', 'user', 'management', 'admin'];

/**
 * Admin-only: list everyone who has signed up (GET) and set a user's role / broker (POST).
 * Doesn't create or invite accounts — people sign up themselves, an admin then grants access.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const me = await requireUser(req);
    requireRole(me, ['admin']);
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

    if (req.method === 'GET') {
      const { data } = await clerk.users.getUserList({ limit: 200, orderBy: '-created_at' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        users: data.map(u => {
          const meta = u.publicMetadata as { role?: Role; brokerName?: string };
          return {
            id: u.id,
            email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? '',
            name: [u.firstName, u.lastName].filter(Boolean).join(' '),
            createdAt: u.createdAt,
            lastSignInAt: u.lastSignInAt,
            role: meta.role ?? 'none',
            brokerName: meta.brokerName ?? null,
            isMe: u.id === me.userId,
          };
        }),
      });
    }

    if (req.method === 'POST') {
      const { userId, role, brokerName } = (req.body ?? {}) as { userId?: string; role?: AssignableRole; brokerName?: string | null };
      if (!userId || !role || !ROLES.includes(role)) {
        return res.status(400).json({ error: 'userId and a valid role are required' });
      }
      if (userId === me.userId && role !== 'admin') {
        return res.status(400).json({ error: "You can't remove your own admin role" });
      }
      const broker = brokerName?.trim() || null;
      if (role === 'user' && !broker) {
        return res.status(400).json({ error: 'Pick a broker for this user' });
      }
      // null deletes the key in Clerk's metadata merge
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: {
          role: role === 'none' ? null : role,
          brokerName: role === 'user' ? broker : null,
        },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Use GET or POST' });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
}
