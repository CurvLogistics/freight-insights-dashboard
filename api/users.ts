import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient } from '@clerk/backend';
import { requireUser, requireRole, AuthError, AUTHORIZED_PARTIES, type Role } from './_lib/auth.js';

/** 'none' = signed up but not given access yet (no role and no broker, so they see no loads). */
type AssignableRole = Role | 'none';
const ROLES: AssignableRole[] = ['none', 'user', 'management', 'admin'];
/** Roles an admin can invite someone with ('user' = Broker). */
const INVITE_ROLES: Role[] = ['user', 'management', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteMeta = { role?: Role; brokerName?: string | null; invitedName?: string };

/** The dashboard the admin is on, so the invite link brings people back there (never an unknown site). */
function appUrl(req: VercelRequest): string {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  return AUTHORIZED_PARTIES.includes(origin) ? origin : AUTHORIZED_PARTIES[0];
}

/**
 * Admin-only: list everyone who has signed up plus pending invites (GET), set a user's role /
 * broker (POST), invite someone with a role already set (PUT) and remove a user or revoke an
 * invite (DELETE). People can still sign up themselves and wait for an admin to grant access.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const me = await requireUser(req);
    requireRole(me, ['admin']);
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

    if (req.method === 'GET') {
      const [{ data }, { data: pending }] = await Promise.all([
        clerk.users.getUserList({ limit: 200, orderBy: '-created_at' }),
        clerk.invitations.getInvitationList({ status: 'pending', limit: 200 }),
      ]);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        users: data.map(u => {
          const meta = u.publicMetadata as InviteMeta;
          return {
            id: u.id,
            email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? '',
            name: [u.firstName, u.lastName].filter(Boolean).join(' ') || meta.invitedName || '',
            createdAt: u.createdAt,
            lastSignInAt: u.lastSignInAt,
            role: meta.role ?? 'none',
            brokerName: meta.brokerName ?? null,
            isMe: u.id === me.userId,
          };
        }),
        invites: pending.map(i => {
          const meta = (i.publicMetadata ?? {}) as InviteMeta;
          return {
            id: i.id,
            email: i.emailAddress,
            name: meta.invitedName ?? '',
            createdAt: i.createdAt,
            role: meta.role ?? 'user',
            brokerName: meta.brokerName ?? null,
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

    if (req.method === 'PUT') {
      const body = (req.body ?? {}) as { name?: string; email?: string; role?: Role; brokerName?: string | null };
      const name = body.name?.trim() ?? '';
      const email = body.email?.trim().toLowerCase() ?? '';
      const broker = body.brokerName?.trim() || null;
      if (!name) return res.status(400).json({ error: 'Enter their name' });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
      if (!body.role || !INVITE_ROLES.includes(body.role)) {
        return res.status(400).json({ error: 'Pick Broker, Management or Admin' });
      }
      if (body.role === 'user' && !broker) return res.status(400).json({ error: 'Pick a broker for this user' });

      const existing = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
      if (existing.totalCount > 0) return res.status(409).json({ error: 'This email already has an account' });
      const invited = await clerk.invitations.getInvitationList({ status: 'pending', query: email });
      if (invited.data.some(i => i.emailAddress.toLowerCase() === email)) {
        return res.status(409).json({ error: 'An invite is already pending for this email' });
      }

      // Clerk emails the link; the metadata becomes their public metadata when they sign up
      const invite = await clerk.invitations.createInvitation({
        emailAddress: email,
        redirectUrl: appUrl(req),
        notify: true,
        publicMetadata: { role: body.role, brokerName: body.role === 'user' ? broker : null, invitedName: name },
      });
      return res.status(201).json({ ok: true, invitationId: invite.id });
    }

    if (req.method === 'DELETE') {
      const invitationId = typeof req.query.invitationId === 'string' ? req.query.invitationId : '';
      if (invitationId) {
        // The link in their email stops working
        await clerk.invitations.revokeInvitation(invitationId);
        return res.status(200).json({ ok: true });
      }
      const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
      if (!userId) return res.status(400).json({ error: 'userId or invitationId is required' });
      if (userId === me.userId) return res.status(400).json({ error: "You can't remove your own account" });
      // Deletes the Clerk account and ends their sessions; they'd have to sign up again
      await clerk.users.deleteUser(userId);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Use GET, POST, PUT or DELETE' });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
}
