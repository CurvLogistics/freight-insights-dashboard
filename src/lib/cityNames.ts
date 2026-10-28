import type { Load } from '@/types/loads';

/**
 * Turvo sometimes has the same city spelled more than one way ("The Bronx" vs "Bronx",
 * "St. Louis" vs "Saint Louis"), which splits one lane into two (RPT-19).
 *
 * Instead of a hard-coded alias list, spellings are matched on a loose key within the same
 * state, and every load is rewritten to the spelling used most often. A name only changes
 * when another spelling of it actually exists in the data, so "The Dalles, OR" stays as is
 * unless a "Dalles, OR" also shows up.
 */
export function cityKey(city?: string): string {
  return (city ?? '')
    .toLowerCase()
    .replace(/[.,'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/^saint /, 'st ')
    .replace(/^ste /, 'sainte ');
}

const stateOf = (s?: string) => (s ?? '').trim().toUpperCase();

export function normalizeCityNames<T extends Load>(loads: T[]): T[] {
  // Count every spelling per (state, loose key).
  const counts = new Map<string, Map<string, number>>();
  const tally = (city?: string, state?: string) => {
    const raw = (city ?? '').trim().replace(/\s+/g, ' ');
    if (!raw) return;
    const k = `${stateOf(state)}|${cityKey(raw)}`;
    const m = counts.get(k) ?? new Map<string, number>();
    m.set(raw, (m.get(raw) ?? 0) + 1);
    counts.set(k, m);
  };
  for (const l of loads) { tally(l.originCity, l.originState); tally(l.destinationCity, l.destinationState); }

  // Only keys with more than one distinct spelling (ignoring case) need a rewrite.
  const canonical = new Map<string, string>();
  for (const [k, m] of counts) {
    if (new Set([...m.keys()].map(s => s.toLowerCase())).size < 2) continue;
    // Most used spelling wins; on a tie prefer the one without "The", then alphabetical.
    const best = [...m.entries()].sort((a, b) =>
      b[1] - a[1] || Number(/^the /i.test(a[0])) - Number(/^the /i.test(b[0])) || a[0].localeCompare(b[0]))[0][0];
    canonical.set(k, best);
  }
  if (canonical.size === 0) return loads;

  const fix = (city?: string, state?: string) => {
    if (!city?.trim()) return city;
    return canonical.get(`${stateOf(state)}|${cityKey(city)}`) ?? city;
  };
  return loads.map(l => {
    const originCity = fix(l.originCity, l.originState);
    const destinationCity = fix(l.destinationCity, l.destinationState);
    return originCity === l.originCity && destinationCity === l.destinationCity ? l : { ...l, originCity, destinationCity };
  });
}