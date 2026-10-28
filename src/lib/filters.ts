import type { Load, ComputedLoad } from '@/types/loads';
import { computeLoad, isActiveLoad, hasFinancials, finRev, finCost } from '@/lib/computeLoads';
import type { DateRange } from '@/lib/comparison';
import { BUSINESS_TZ, toBusinessDate } from '@/lib/dates';

export type TimeframePreset = 'rolling7' | 'rolling30' | 'rolling90' | 'mtd' | 'qtd' | 'ytd' | 'custom';
export type ViewMode = 'booked' | 'locked';

export interface Filters {
  dateRange: DateRange;
  excludedTeams: string[];
  owner: string;
  equipmentType: string;
  search: string;
}

/** "Yesterday" and every load's ship date are decided in this time zone (see lib/dates.ts). */
export { BUSINESS_TZ };

const DAY_MS = 86_400_000;
const toMs = (d: string) => { const [y, m, day] = d.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, day); };
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => toISO(toMs(d) + n * DAY_MS);
export const daysInRange = (r: DateRange) => Math.round((toMs(r.end) - toMs(r.start)) / DAY_MS) + 1;

export function businessToday(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const businessYesterday = (now = new Date()) => addDays(businessToday(now), -1);
/** Midnight UTC of the current business day — use for "days  since" math against YYYY-MM-DD dates. */
export const businessTodayDate = (now = new Date()) => new Date(businessToday(now) + 'T00:00:00Z');

/** All presets end yesterday (last full US day). Rolling 30 = 30 full days. Pure UTC math, no local-time drift. */
export function getPresetRange(preset: TimeframePreset, end = businessYesterday()): DateRange | null {
  const [y, m] = end.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (preset) {
    case 'rolling7': return { start: addDays(end, -6), end };
    case 'rolling30': return { start: addDays(end, -29), end };
    case 'rolling90': return { start: addDays(end, -89), end };
    case 'mtd': return { start: `${y}-${pad(m)}-01`, end };
    case 'qtd': return { start: `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, end };
    case 'ytd': return { start: `${y}-01-01`, end };
    default: return null;
  }
}

export const teamOf = (l: Pick<Load, 'team'>) => l.team?.trim() || 'Unassigned';
export const ownerOf = (l: Pick<Load, 'broker'>) => l.broker?.trim() || 'Unassigned';
/**
 * The date a load counts on, in Booked AND Locked view: pickup date, or delivery date if there is no pickup.
 * UTC timestamps are converted to the US business day (BUSINESS_TZ) so loads near midnight don't
 * land on the wrong day — the usual cause of an off-by-one versus Turvo's Shipment Summary.
 */
export const shipDate = (l: Pick<Load, 'scheduledPickupDate' | 'pickupDate' | 'deliveryDate'>) =>
  toBusinessDate(l.scheduledPickupDate || l.pickupDate || l.deliveryDate);

/** What the Booked / Locked toggle means. Shown as a tooltip next to the toggle. */
export const VIEW_MODE_HELP =
  'Both views filter by the scheduled pickup date, as in Turvo\'s Shipment Summary (actual pickup or delivery date if none is scheduled), excluding canceled and draft loads. ' +
  'Booked = every load scheduled to pick up in the period. Locked = only the loads whose financials are final: ' +
  'status Ready for Billing or Completed, or a ready-to-bill date in Turvo.';

/**
 * Click-to-filter on the Executive Overview (a customer, broker or lane row).
 * One matcher so the KPIs, charts and Business Intelligence all apply it the same way.
 */
export type Focus = { type: 'customer' | 'broker' | 'lane'; value: string } | null;
export const customerOf = (l: Pick<Load, 'customerName'>) => l.customerName?.trim() || 'Unknown';
export function matchesFocus(l: ComputedLoad, focus: Focus): boolean {
  if (!focus) return true;
  if (focus.type === 'customer') return customerOf(l) === focus.value;
  if (focus.type === 'broker') return ownerOf(l) === focus.value;
  return l.lane === focus.value;
}

/**
 * Rank tables hide entities with too few loads to be meaningful. A fixed 10 emptied every
 * table on short ranges (Oct 1–7 had 13 loads in total), so the bar scales with the range.
 */
export const minRankLoads = (r: DateRange) => (daysInRange(r) >= 28 ? 10 : daysInRange(r) >= 14 ? 5 : 2);
/** Every non-date filter. Used for the current AND comparison period, on every page. */
export function matchesFilters(l: Load, f: Filters): boolean {
  if (!isActiveLoad(l)) return false;
  if (f.excludedTeams.includes(teamOf(l))) return false;
  if (f.owner !== 'all' && ownerOf(l) !== f.owner) return false;
  if (f.equipmentType !== 'all' && l.equipmentType !== f.equipmentType) return false;
  if (f.search) {
    const s = f.search.toLowerCase();
    const hit = [l.loadId, l.customerName, l.carrierName, l.broker, l.originCity, l.originState, l.destinationCity, l.destinationState]
      .some(v => v?.toLowerCase().includes(s));
    if (!hit) return false;
  }
  return true;
}

/** Loads with no date are excluded (RPT-29). */
export function inDateRange(l: Load, r: DateRange): boolean {
  const d = shipDate(l);
  return !!d && d >= r.start && d <= r.end;
}

export function selectLoads(raw: Load[], f: Filters, range: DateRange, viewMode: ViewMode): ComputedLoad[] {
  return raw
    .filter(l => matchesFilters(l, f) && inDateRange(l, range))
    .map(computeLoad)
    .filter(l => viewMode === 'booked' || l.simpleStatus === 'Locked');
}

/** One formula everywhere: revenue = all booked revenue; profit/margin/averages only from loads with revenue AND cost. */
export interface Agg {
  loads: number; finLoads: number; revenue: number; finRevenue: number;
  cost: number; profit: number; margin: number; avgRevenue: number; avgCost: number;
}
export function aggregate(ls: Load[]): Agg {
  let revenue = 0, finRevenue = 0, cost = 0, finLoads = 0;
  for (const l of ls) {
    revenue += l.revenue ?? 0;
    if (hasFinancials(l)) { finLoads++; finRevenue += finRev(l); cost += finCost(l); }
  }
  const profit = finRevenue - cost;
  return {
    loads: ls.length, finLoads, revenue, finRevenue, cost, profit,
    margin: finRevenue > 0 ? (profit / finRevenue) * 100 : 0,
    avgRevenue: finLoads ? finRevenue / finLoads : 0,
    avgCost: finLoads ? cost / finLoads : 0,
  };
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) { const k = key(it); const arr = m.get(k); if (arr) arr.push(it); else m.set(k, [it]); }
  return m;
}

/** API loads win over CSV-imported loads with the same ID (RPT-01). */
export function dedupeLoads(ls: Load[]): Load[] {
  const byId = new Map<string, Load>();
  for (const l of ls) {
    const prev = byId.get(l.loadId);
    if (!prev || (prev.serviceSource === 'csv' && l.serviceSource !== 'csv')) byId.set(l.loadId, l);
  }
  return [...byId.values()];
}