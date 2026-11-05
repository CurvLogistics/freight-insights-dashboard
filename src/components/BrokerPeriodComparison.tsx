import { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { Badge } from '@/components/ui/badge';
import { formatUSDate } from '@/lib/dates';
import { brokerPeriodComparison, PERIOD_LABEL, type PeriodKind, type CustomerComparisonRow } from '@/lib/brokerPeriodComparison';
import type { Agg } from '@/lib/filters';

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const marginCls = (m: number) => (m >= 15 ? 'text-success' : m >= 10 ? 'text-warning' : 'text-destructive');
const CUSTOMER_LIMIT = 15;

/** "+12% / −$3,400" style change. Margin changes are in percentage points. */
function Delta({ cur, prev, kind }: { cur: number; prev: number; kind: 'money' | 'count' | 'pp' }) {
  const diff = cur - prev;
  if (kind !== 'pp' && prev === 0) return <span className="text-muted-foreground">{cur === 0 ? '—' : 'New'}</span>;
  const cls = Math.abs(diff) < 0.05 ? 'text-muted-foreground' : diff > 0 ? 'text-success' : 'text-destructive';
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const abs = Math.abs(diff);
  const text =
    kind === 'pp' ? `${sign}${abs.toFixed(1)}pp`
    : kind === 'count' ? `${sign}${abs.toLocaleString('en-US')} (${sign}${Math.abs((diff / prev) * 100).toFixed(0)}%)`
    : `${sign}${fmt(abs)} (${sign}${Math.abs((diff / prev) * 100).toFixed(0)}%)`;
  return <span className={cls}>{text}</span>;
}

function Compare({ label, cur, prev, show, kind, hasPrev }: {
  label: string; cur: number; prev: number; show: (n: number) => string; kind: 'money' | 'count' | 'pp'; hasPrev: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold font-mono mt-0.5">{show(cur)}</p>
      {hasPrev ? (
        <p className="text-xs font-mono mt-0.5">
          <Delta cur={cur} prev={prev} kind={kind} />
          <span className="text-muted-foreground"> · was {show(prev)}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-0.5">No comparison</p>
      )}
    </div>
  );
}

function Totals({ cur, prev, hasPrev }: { cur: Agg; prev: Agg; hasPrev: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Compare label="Loads" cur={cur.loads} prev={prev.loads} show={n => n.toLocaleString('en-US')} kind="count" hasPrev={hasPrev} />
      <Compare label="Revenue" cur={cur.revenue} prev={prev.revenue} show={fmt} kind="money" hasPrev={hasPrev} />
      <Compare label="Gross Profit" cur={cur.profit} prev={prev.profit} show={fmt} kind="money" hasPrev={hasPrev} />
      <Compare label="Margin" cur={cur.margin} prev={prev.margin} show={n => `${n.toFixed(1)}%`} kind="pp" hasPrev={hasPrev} />
    </div>
  );
}

function CustomerTable({ rows, hasPrev }: { rows: CustomerComparisonRow[]; hasPrev: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, CUSTOMER_LIMIT);
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Customers</h4>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs min-w-[640px]">
          <thead><tr className="text-muted-foreground border-b bg-muted/30">
            <th className="text-left px-3 py-2">Customer</th>
            <th className="text-right px-3 py-2 whitespace-nowrap">Loads</th>
            {hasPrev && <th className="text-right px-3 py-2 whitespace-nowrap">Prev</th>}
            <th className="text-right px-3 py-2 whitespace-nowrap">Revenue</th>
            {hasPrev && <th className="text-right px-3 py-2 whitespace-nowrap">Δ Revenue</th>}
            <th className="text-right px-3 py-2 whitespace-nowrap">Gross Profit</th>
            {hasPrev && <th className="text-right px-3 py-2 whitespace-nowrap">Δ GP</th>}
            <th className="text-right px-3 py-2 whitespace-nowrap">Margin</th>
            {hasPrev && <th className="text-right px-3 py-2 whitespace-nowrap">Δ Margin</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={hasPrev ? 9 : 5} className="text-center text-muted-foreground py-6">No loads in this period</td></tr>
            )}
            {visible.map(r => (
              <tr key={r.name} className="border-b border-border/50 even:bg-muted/15">
                <td className="px-3 py-2 font-medium max-w-[220px]">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate" title={r.name}>{r.name}</span>
                    {hasPrev && r.status === 'new' && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">New</Badge>}
                    {hasPrev && r.status === 'lost' && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">No loads</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{r.cur.loads}</td>
                {hasPrev && <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-muted-foreground">{r.prev.loads}</td>}
                <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmt(r.cur.revenue)}</td>
                {hasPrev && <td className="px-3 py-2 text-right font-mono whitespace-nowrap"><Delta cur={r.cur.revenue} prev={r.prev.revenue} kind="money" /></td>}
                <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmt(r.cur.profit)}</td>
                {hasPrev && <td className="px-3 py-2 text-right font-mono whitespace-nowrap"><Delta cur={r.cur.profit} prev={r.prev.profit} kind="money" /></td>}
                <td className={`px-3 py-2 text-right font-mono font-medium ${r.cur.loads ? marginCls(r.cur.margin) : 'text-muted-foreground'}`}>
                  {r.cur.loads ? `${r.cur.margin.toFixed(1)}%` : '—'}
                </td>
                {hasPrev && (
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                    {r.status === 'both' ? <Delta cur={r.cur.margin} prev={r.prev.margin} kind="pp" /> : <span className="text-muted-foreground">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > CUSTOMER_LIMIT && (
        <button type="button" onClick={() => setShowAll(s => !s)} className="text-xs text-primary underline underline-offset-2 mt-2">
          {showAll ? 'Show top 15' : `Show all ${rows.length} customers`}
        </button>
      )}
    </div>
  );
}

/** Current vs previous period for one broker: totals and a per-customer comparison. */
export default function BrokerPeriodComparison({ broker, kind }: { broker: string; kind: PeriodKind }) {
  const { rawLoads, filters, viewMode } = useData();
  const c = useMemo(
    () => brokerPeriodComparison(rawLoads, filters, viewMode, broker, kind),
    [rawLoads, filters, viewMode, broker, kind],
  );
  const labels = PERIOD_LABEL[kind];
  const hasPrev = c.covered;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {labels.current}: {formatUSDate(c.current.start)} – {formatUSDate(c.current.end)}
        {c.previous && <> · vs {labels.previous.toLowerCase()}: {formatUSDate(c.previous.start)} – {formatUSDate(c.previous.end)}</>}
        . Ignores the date range in the toolbar; other filters still apply.
      </p>
      {c.dataStart > c.current.start && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          Synced data starts {formatUSDate(c.dataStart)}, so {labels.current.toLowerCase()} only includes loads from that date.
        </div>
      )}
      {!hasPrev && c.reason && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">{c.reason}</div>
      )}
      <Totals cur={c.cur} prev={c.prev} hasPrev={hasPrev} />
      <CustomerTable rows={hasPrev ? c.customers : c.customers.filter(r => r.cur.loads > 0)} hasPrev={hasPrev} />
    </div>
  );
}
