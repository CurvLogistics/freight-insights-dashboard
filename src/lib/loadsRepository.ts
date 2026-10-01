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