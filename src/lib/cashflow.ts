import type { Load } from '@/types/loads';
import { isActiveLoad } from './computeLoads';

/** Used only when Turvo has no invoice/due date yet. Confirm with Ibeth. */
export const CASHFLOW_ASSUMPTIONS = {
  arInvoiceLagDays: 5,   // delivered -> invoiced
  arTermsDays: 30,       // invoice -> customer pays
  apTermsDays: 21,       // delivery/carrier invoice -> we pay
};
export const AR_FLAG_DAYS = 180;

export type Side = 'ar' | 'ap';
export interface CashItem {
  load: Load; side: Side; amount: number;
  date: string;                  // expected cash date, yyyy-mm-dd
  basis: 'due date' | 'estimated';
  invoiced: boolean; overdue: boolean;
  ageDays?: number;              // since invoice date (or delivery if never invoiced)
}

const DAY = 86_400_000;
export const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, d: number) => new Date(new Date(iso.slice(0, 10)).getTime() + d * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.floor((new Date(b.slice(0, 10)).getTime() - new Date(a.slice(0, 10)).getTime()) / DAY);
const mondayOf = (iso: string) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));

export function cashItems(loads: Load[], side: Side, asOf = todayISO()): CashItem[] {
  const A = CASHFLOW_ASSUMPTIONS;
  const out: CashItem[] = [];
  for (const l of loads) {
    if (!isActiveLoad(l)) continue;
    const invAmount = side === 'ar' ? l.arInvoiceAmount : l.apInvoiceAmount;
    const invDate   = side === 'ar' ? l.arInvoiceDate   : l.apInvoiceDate;
    const dueDate   = side === 'ar' ? l.arDueDate       : l.apDueDate;
    const paid      = side === 'ar' ? l.arPaid          : l.apPaid;
    const invoiced = invAmount != null;
    if (paid) continue;

    let amount: number | undefined;
    let date: string | undefined;
    let basis: CashItem['basis'] = 'due date';
    if (invoiced) {
      amount = side === 'ar' ? l.arOpenBalance : l.apOpenBalance;
      date = dueDate?.slice(0, 10);
      if (!date && invDate) { basis = 'estimated'; date = addDays(invDate, side === 'ar' ? A.arTermsDays : A.apTermsDays); }
    } else if (l.deliveryDate) {
      basis = 'estimated';
      amount = side === 'ar' ? l.revenue : l.carrierCost;
      date = side === 'ar'
        ? addDays(l.deliveryDate, A.arInvoiceLagDays + A.arTermsDays)
        : addDays(l.deliveryDate, A.apTermsDays);
    }
    if (!amount || amount <= 0 || !date) continue;

    const ageFrom = invDate ?? l.deliveryDate;
    out.push({
      load: l, side, amount, date, basis, invoiced,
      overdue: date < asOf,
      ageDays: ageFrom && ageFrom.slice(0, 10) <= asOf ? daysBetween(ageFrom, asOf) : undefined,
    });
  }
  return out;
}

export interface WeekBucket { weekStart: string; label: string; ar: number; ap: number; net: number; cumulative: number }

export function weeklyForecast(ar: CashItem[], ap: CashItem[], weeks = 8, asOf = todayISO()) {
  const start = mondayOf(asOf);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(start, i * 7);
    return { weekStart: ws, label: `Wk ${ws.slice(5).replace('-', '/')}`, ar: 0, ap: 0, net: 0, cumulative: 0 };
  });
  let overdueAr = 0, overdueAp = 0;
  for (const it of [...ar, ...ap]) {
    if (it.overdue) { if (it.side === 'ar') overdueAr += it.amount; else overdueAp += it.amount; continue; }
    const idx = Math.floor(daysBetween(start, it.date) / 7);
    if (idx >= 0 && idx < weeks) buckets[idx][it.side] += it.amount;
  }
  let run = 0;
  for (const b of buckets) { b.net = b.ar - b.ap; run += b.net; b.cumulative = run; }
  return { overdueAr, overdueAp, buckets };
}

const AGING: { label: string; test: (daysLate: number) => boolean }[] = [
  { label: 'Not due yet', test: d => d <= 0 },
  { label: '1–30 late',   test: d => d >= 1 && d <= 30 },
  { label: '31–60 late',  test: d => d >= 31 && d <= 60 },
  { label: '61–90 late',  test: d => d >= 61 && d <= 90 },
  { label: '90+ late',    test: d => d > 90 },
];
export function agingBuckets(items: CashItem[], asOf = todayISO()) {
  return AGING.map(a => {
    const xs = items.filter(i => a.test(daysBetween(i.date, asOf)));
    return { label: a.label, items: xs, count: xs.length, amount: xs.reduce((s, i) => s + i.amount, 0) };
  });
}

/** Customer money unpaid 180+ days after invoice (or delivery, if never invoiced). */
export const isFlagged180 = (i: CashItem) => i.side === 'ar' && (i.ageDays ?? 0) >= AR_FLAG_DAYS;
