import type { Load } from '@/types/loads';
import { formatUSDate, toBusinessDate } from '@/lib/dates';

export type ComparisonMode = 'prior' | 'yoy';

export interface DateRange { start: string; end: string }

export interface ComparisonWindow {
  /** Inclusive comparison range (YYYY-MM-DD). */
  range: DateRange | null;
  /** True when synced data covers the whole comparison range. */
  covered: boolean;
  /** Earliest shipment date we have, YYYY-MM-DD ('' when no data). */
  dataStart: string;
  /** Plain-English reason when not covered (shown in the UI). */
  reason: string | null;
}

const DAY_MS = 86_400_000;

function toMs(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}
function toISO(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
function shiftYears(d: string, years: number) {
  const dt = new Date(toMs(d));
  // Feb 29 -> Feb 28 in non-leap years instead of rolling into March
  const target = new Date(Date.UTC(dt.getUTCFullYear() + years, dt.getUTCMonth(), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dt.getUTCDate(), lastDay));
  return toISO(target.getTime());
}

/** Same rule as filters.shipDate: pickup (else delivery) date, UTC timestamps moved to the US business day. */
export const shipmentDate = (l: Pick<Load, 'scheduledPickupDate' | 'pickupDate' | 'deliveryDate'>) =>
  toBusinessDate(l.scheduledPickupDate || l.pickupDate || l.deliveryDate);

/** Earliest / latest shipment date in the dataset. */
export function getDatasetBounds(loads: Load[]): { min: string; max: string } {
  let min = '', max = '';
  for (const l of loads) {
    const d = shipmentDate(l);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return { min, max };
}

/**
 * The single source of truth for "compare against" windows, used by every page.
 * - prior: the same number of days immediately before the current range
 * - yoy:   the same calendar dates one year earlier
 * Both are inclusive on both ends, like the current range.
 */
export function getComparisonRange(current: DateRange, mode: ComparisonMode): DateRange | null {
  if (!current.start || !current.end || current.end < current.start) return null;
  if (mode === 'yoy') return { start: shiftYears(current.start, -1), end: shiftYears(current.end, -1) };
  const startMs = toMs(current.start);
  const days = Math.round((toMs(current.end) - startMs) / DAY_MS) + 1;
  const prevEnd = startMs - DAY_MS;
  return { start: toISO(prevEnd - (days - 1) * DAY_MS), end: toISO(prevEnd) };
}

/**
 * Comparison range + whether we actually have data for it. We never compare
 * against a partially-synced window: before, the range was silently clamped to
 * the first synced day, so "same period last year" compared a full period to a
 * few days (or nothing) and the % changes were meaningless.
 */
export function getComparisonWindow(current: DateRange, mode: ComparisonMode, rawLoads: Load[]): ComparisonWindow {
  const range = getComparisonRange(current, mode);
  const { min } = getDatasetBounds(rawLoads);
  if (!range) return { range: null, covered: false, dataStart: min, reason: 'Pick a valid date range to compare.' };
  if (!min) return { range, covered: false, dataStart: min, reason: 'No synced data yet.' };
  if (range.start < min) {
    const label = mode === 'yoy' ? 'Same period last year' : 'Prior period';
    return {
      range, covered: false, dataStart: min,
      reason: `${label} (${formatUSDate(range.start)}–${formatUSDate(range.end)}) is before our data starts (${formatUSDate(min)}). ` +
        (mode === 'yoy'
          ? 'Turvo’s API only returns the last 180 days — import a historical Turvo export in Settings to enable year-over-year.'
          : 'Pick a shorter date range or backfill more history in Settings.'),
    };
  }
  return { range, covered: true, dataStart: min, reason: null };
}

export function inRange(l: Load, r: DateRange) {
  const d = shipmentDate(l);
  return !!d && d >= r.start && d <= r.end;
}