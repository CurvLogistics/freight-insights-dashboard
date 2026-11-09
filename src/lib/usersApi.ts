import { authHeader, type GetSessionToken } from '@/lib/loadsRepository';

export type AssignableRole = 'none' | 'user' | 'management' | 'admin';

export interface DashboardUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  lastSignInAt: number | null;
  role: AssignableRole;
  brokerName: string | null;
  isMe: boolean;
}

/** Someone an admin invited who hasn't signed up yet. */
export interface DashboardInvite {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  role: Exclude<AssignableRole, 'none'>;
  brokerName: string | null;
}

export interface NewUser {
  name: string;
  email: string;
  role: Exclude<AssignableRole, 'none'>;
  brokerName: string | null;
}

async function errorFrom(res: Response): Promise<Error> {
  const { error } = await res.json().catch(() => ({ error: '' }));
  return new Error(error || `Users API error ${res.status}`);
}

/** Admin only: everyone who has signed up, newest first. */
export async function listUsers(getToken: GetSessionToken): Promise<DashboardUser[]> {
  const res = await fetch('/api/users', { cache: 'no-store', headers: await authHeader(getToken) });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()).users;
}

/** Admin only: signed-up users plus pending invites. */
export async function listUsersAndInvites(getToken: GetSessionToken): Promise<{ users: DashboardUser[]; invites: DashboardInvite[] }> {
  const res = await fetch('/api/users', { cache: 'no-store', headers: await authHeader(getToken) });
  if (!res.ok) throw await errorFrom(res);
  const body = await res.json();
  return { users: body.users, invites: body.invites ?? [] };
}

/** Admin only: emails an invite; their role (and broker) is already set when they sign up. */
export async function createUser(getToken: GetSessionToken, user: NewUser): Promise<void> {
  const res = await fetch('/api/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeader(getToken)) },
    body: JSON.stringify(user),
  });
  if (!res.ok) throw await errorFrom(res);
}

/** Admin only: cancels a pending invite so the emailed link stops working. */
export async function revokeInvite(getToken: GetSessionToken, invitationId: string): Promise<void> {
  const res = await fetch(`/api/users?invitationId=${encodeURIComponent(invitationId)}`, {
    method: 'DELETE',
    headers: await authHeader(getToken),
  });
  if (!res.ok) throw await errorFrom(res);
}

/** Admin only: sets a user's role; brokerName is required for 'user' (broker) and ignored otherwise. */
export async function setUserRole(
  getToken: GetSessionToken,
  userId: string,
  role: AssignableRole,
  brokerName: string | null,
): Promise<void> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader(getToken)) },
    body: JSON.stringify({ userId, role, brokerName }),
  });
  if (!res.ok) throw await errorFrom(res);
}

/** Admin only: deletes the user's account (they'd have to sign up again to get back in). */
export async function removeUser(getToken: GetSessionToken, userId: string): Promise<void> {
  const res = await fetch(`/api/users?userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: await authHeader(getToken),
  });
  if (!res.ok) throw await errorFrom(res);
}
