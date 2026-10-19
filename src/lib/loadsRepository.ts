import type { Load } from '@/types/loads';

/** Thrown when the server refuses an admin action (signed out, or not an admin). */
export class AdminAuthError extends Error {}

/** Returns the signed-in user's Clerk session token (Clerk's `getToken`). Tokens are short-lived, so fetch one per request. */
export type GetSessionToken = () => Promise<string | null>;

/**
 * The server checks the user's role from this token. It goes in its own header because
 * `Authorization` carries the site-wide Basic login (middleware.ts) — overwriting it fails that check.
 */
async function authHeader(getToken: GetSessionToken): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { 'X-Clerk-Session': token } : {};
}

async function checkAdminResponse(res: Response): Promise<void> {
  if (res.status === 401 || res.status === 403) {
    const { error } = await res.json().catch(() => ({ error: '' }));
    throw new AdminAuthError(error || 'Admin access required.');
  }
}

export interface LoadsResponse {
  loads: Load[];
  lastSyncedAt: string | null;
}

/** Returns only the loads the signed-in user may see (the server filters by role / broker). */
export async function fetchLoadsFromApi(getToken: GetSessionToken): Promise<LoadsResponse> {
  const res = await fetch('/api/loads', { cache: 'no-store', headers: await authHeader(getToken) });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: '' }));
    throw new Error(error || `Loads API error ${res.status}`);
  }
  const data = await res.json();
  return { loads: data.loads ?? [], lastSyncedAt: data.lastSyncedAt ?? null };
}

export async function triggerSync(getToken: GetSessionToken, days = 45): Promise<void> {
  const res = await fetch(`/api/sync?days=${days}`, {
    method: 'POST',
    headers: await authHeader(getToken),
  });
  await checkAdminResponse(res);
  if (!res.ok && res.status !== 409) throw new Error(`Sync error ${res.status}`);
}

/**
 * Saves historical loads (from a Turvo CSV export) on the server, in batches to stay
 * under Vercel's request-size limit. Loads already synced from the API are never
 * overwritten — the server only adds load IDs it doesn't have yet.
 */
export async function importHistoricalLoads(
  getToken: GetSessionToken,
  loads: Load[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ added: number; skipped: number }> {
  const BATCH = 1000;
  let added = 0, skipped = 0;
  for (let i = 0; i < loads.length; i += BATCH) {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader(getToken)) },
      body: JSON.stringify({ loads: loads.slice(i, i + BATCH) }),
    });
    await checkAdminResponse(res);
    if (!res.ok) throw new Error(`Import error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    added += data.added ?? 0;
    skipped += data.skipped ?? 0;
    onProgress?.(Math.min(i + BATCH, loads.length), loads.length);
  }
  return { added, skipped };
}
