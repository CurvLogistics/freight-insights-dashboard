import type { Load } from '@/types/loads';

export interface LoadsResponse {
  loads: Load[];
  lastSyncedAt: string | null;
}

export async function fetchLoadsFromApi(): Promise<LoadsResponse> {
  const res = await fetch('/api/loads', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Loads API error ${res.status}`);
  const data = await res.json();
  return { loads: data.loads ?? [], lastSyncedAt: data.lastSyncedAt ?? null };
}

export async function triggerSync(days = 45): Promise<void> {
  const res = await fetch(`/api/sync?days=${days}`, { method: 'POST' });
  if (!res.ok && res.status !== 409) throw new Error(`Sync error ${res.status}`);
}

/**
 * Saves historical loads (from a Turvo CSV export) on the server, in batches to stay
 * under Vercel's request-size limit. Loads already synced from the API are never
 * overwritten — the server only adds load IDs it doesn't have yet.
 */
export async function importHistoricalLoads(
  loads: Load[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ added: number; skipped: number }> {
  const BATCH = 1000;
  let added = 0, skipped = 0;
  for (let i = 0; i < loads.length; i += BATCH) {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loads: loads.slice(i, i + BATCH) }),
    });
    if (!res.ok) throw new Error(`Import error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    added += data.added ?? 0;
    skipped += data.skipped ?? 0;
    onProgress?.(Math.min(i + BATCH, loads.length), loads.length);
  }
  return { added, skipped };
}
