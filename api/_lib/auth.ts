import type { VercelRequest } from '@vercel/node';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { can, normalizeRole, type Permission, type Role } from '../../src/auth/permissions.js';

export type { Role };

export interface AuthUser {
  userId: string;
  role: Role;
  brokerName?: string;
  canSeeAll: boolean;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403 | 500, message: string) {
    super(message);
  }
}

/** Origins allowed to call the API; also the only places an invite link may send someone back to. */
export const AUTHORIZED_PARTIES = [
  'https://freight-insights-dashboard.vercel.app',
  'http://localhost:3000', // vercel dev
  'http://localhost:8080', // vite dev
];

type UserMeta = { role?: string; brokerName?: string };

/**
 * Signed-in Clerk user for this request. The browser sends the session token as `X-Clerk-Session`
 * (`Authorization` carries the site-wide Basic login in middleware.ts). Role and broker come from
 * the user's Clerk public metadata, never from the browser.
 */
export async function requireUser(req: VercelRequest): Promise<AuthUser> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new AuthError(500, 'CLERK_SECRET_KEY is not set on the server');

  const header = req.headers['x-clerk-session'];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) throw new AuthError(401, 'Not signed in');

  let payload: Awaited<ReturnType<typeof verifyToken>>;
  try {
    payload = await verifyToken(token, { secretKey, authorizedParties: AUTHORIZED_PARTIES });
  } catch {
    throw new AuthError(401, 'Invalid or expired session');
  }

  // Uses the `metadata` claim if the Clerk session token is customized to include
  // {{user.public_metadata}}; otherwise looks the user up.
  const meta = ((payload as { metadata?: UserMeta }).metadata
    ?? (await createClerkClient({ secretKey }).users.getUser(payload.sub)).publicMetadata) as UserMeta;
  const role = normalizeRole(meta.role);

  return {
    userId: payload.sub,
    role,
    brokerName: meta.brokerName,
    canSeeAll: can(role, 'loads.all'),
  };
}

/** Checks the shared permission list (src/auth/permissions.ts). */
export function requirePermission(user: AuthUser, permission: Permission) {
  if (!can(user.role, permission)) {
    throw new AuthError(403, 'You do not have access to this');
  }
}
