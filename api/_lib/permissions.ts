import type { AuthUser } from './auth.js';

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/** Admin + management see every load (incl. Unassigned); everyone else only loads where they're the broker. */
export function filterLoadsForUser<T extends { broker?: string }>(loads: T[], user: AuthUser): T[] {
  if (user.canSeeAll) return loads;
  if (!user.brokerName) return []; // a user without brokerName sees nothing

  return loads.filter((l) => {
    if (!l.broker || norm(l.broker) === 'unassigned') return false;
    return norm(l.broker) === norm(user.brokerName);
  });
}
