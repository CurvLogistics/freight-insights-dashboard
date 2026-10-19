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
