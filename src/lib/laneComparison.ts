import type { DateRange } from '@/lib/comparison';
import { addDays, businessToday } from '@/lib/filters';

/**
 * Lane Comparison picks its own two date ranges (RPT-09), separate from the page's
 * comparison setting. Weeks are calendar weeks, Monday to Sunday.
 */
export type LaneComparePreset = 'lastWeek' | 'thisWeek' | 'custom';

export const LANE_COMPARE_PRESETS: { value: LaneComparePreset; label: string }[] = [
  { value: 'lastWeek', label: 'Last week vs week before (Mon–Sun)' },
  { value: 'thisWeek', label: 'This week so far vs last week' },
  { value: 'custom', label: 'Custom dates' },
];

export interface LaneCompareRanges { a: DateRange; b: DateRange }

/** Monday of the week that contains `d` (YYYY-MM-DD). */
export function mondayOf(d: string): string {
  const day = new Date(d + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
  return addDays(d, -((day + 6) % 7));
}

/**
 * a = the period being looked at, b = the period it is compared with.
 * - lastWeek: last full Mon–Sun week vs the Mon–Sun week before it.
 * - thisWeek: Monday of this week up to yesterday vs the same weekdays last week, so both
 *   sides cover the same number of days. Today is left out: its loads have no carrier cost yet.
 *   On a Monday there is no finished day this week yet, so it falls back to lastWeek.
 */
export function laneCompareRanges(preset: Exclude<LaneComparePreset, 'custom'>, today = businessToday()): LaneCompareRanges {
  const thisMonday = mondayOf(today);
  if (preset === 'thisWeek' && today > thisMonday) {
    const yesterday = addDays(today, -1);
    return {
      a: { start: thisMonday, end: yesterday },
      b: { start: addDays(thisMonday, -7), end: addDays(yesterday, -7) },
    };
  }
  const lastMonday = addDays(thisMonday, -7);
  return {
    a: { start: lastMonday, end: addDays(lastMonday, 6) },
    b: { start: addDays(lastMonday, -7), end: addDays(lastMonday, -1) },
  };
}