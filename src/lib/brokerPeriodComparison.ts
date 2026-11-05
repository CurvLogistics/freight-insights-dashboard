import type { Load, ComputedLoad } from '@/types/loads';
import { getComparisonWindow, type DateRange, type ComparisonMode } from '@/lib/comparison';
import {
  aggregate, customerOf, getPresetRange, ownerOf, selectLoads, businessYesterday,
  type Agg, type Filters, type ViewMode,
} from '@/lib/filters';

/** The two fixed comparisons shown when you open a person on Productivity. */
export type PeriodKind = 'rolling30' | 'ytd';

export const PERIOD_LABEL: Record<PeriodKind, { current: string; previous: string }> = {
  rolling30: { current: 'Last 30 days', previous: 'Previous 30 days' },
  ytd: { current: 'Year to date', previous: 'Same period last year' },
};

const MODE: Record<PeriodKind, ComparisonMode> = { rolling30: 'prior', ytd: 'yoy' };

export interface CustomerComparisonRow {
  name: string;
  cur: Agg;
  prev: Agg;
  /** Only in the current period / only in the previous one. */
  status: 'new' | 'lost' | 'both';
}

export interface BrokerPeriodComparison {
  kind: PeriodKind;
  current: DateRange;
  previous: DateRange | null;
  /** False when synced data doesn't reach back to the start of the previous period. */
  covered: boolean;
  reason: string | null;
  /** Earliest synced shipment date. When it's after current.start, the current period is only partly covered. */
  dataStart: string;
  cur: Agg;
  prev: Agg;
  customers: CustomerComparisonRow[];
}

/**
 * One broker's numbers for a fixed window (rolling 30 days or YTD, both ending yesterday) against the
 * previous window, overall and per customer. The page's date range is ignored on purpose; every other
 * filter (teams, equipment, search) and the Booked/Locked toggle still apply, same as the rest of the app.
 */
export function brokerPeriodComparison(
  raw: Load[], filters: Filters, viewMode: ViewMode, broker: string, kind: PeriodKind, end = businessYesterday(),
): BrokerPeriodComparison {
  const current = getPresetRange(kind, end)!;
  const win = getComparisonWindow(current, MODE[kind], raw);
  // Ignore the toolbar's broker filter: we always want this person's loads.
  const f: Filters = { ...filters, owner: 'all' };
  const mine = (ls: ComputedLoad[]) => ls.filter(l => ownerOf(l) === broker);

  const curLoads = mine(selectLoads(raw, f, current, viewMode));
  const prevLoads = win.covered && win.range ? mine(selectLoads(raw, f, win.range, viewMode)) : [];

  const byCustomer = (ls: ComputedLoad[]) => {
    const m = new Map<string, ComputedLoad[]>();
    for (const l of ls) { const k = customerOf(l); const a = m.get(k); if (a) a.push(l); else m.set(k, [l]); }
    return m;
  };
  const curBy = byCustomer(curLoads);
  const prevBy = byCustomer(prevLoads);

  const customers: CustomerComparisonRow[] = [...new Set([...curBy.keys(), ...prevBy.keys()])]
    .map(name => {
      const c = curBy.get(name) ?? [];
      const p = prevBy.get(name) ?? [];
      return {
        name,
        cur: aggregate(c),
        prev: aggregate(p),
        status: (!p.length ? 'new' : !c.length ? 'lost' : 'both') as CustomerComparisonRow['status'],
      };
    })
    .sort((a, b) => b.cur.revenue - a.cur.revenue || b.prev.revenue - a.prev.revenue);

  return {
    kind, current, previous: win.range, covered: win.covered, reason: win.reason, dataStart: win.dataStart,
    cur: aggregate(curLoads), prev: aggregate(prevLoads), customers,
  };
}
