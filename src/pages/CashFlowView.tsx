import { useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import InfoTip from '@/components/InfoTip';
import { METRIC_INFO, type MetricInfo } from '@/lib/metricInfo';
import { DataWarnings } from '@/components/DataTrust';
import LoadListDrawer from '@/components/LoadListDrawer';
import { formatUSDate } from '@/lib/dates';
import type { Load } from '@/types/loads';
import {
  cashItems, weeklyForecast, agingBuckets, isFlagged180,
  AR_FLAG_DAYS, CASHFLOW_ASSUMPTIONS as A, type CashItem,
} from '@/lib/cashflow';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdK = (n: number) => `$${Math.round(n / 1000)}k`;
const sum = (xs: CashItem[]) => xs.reduce((s, i) => s + i.amount, 0);

export default function CashFlowView() {
  // Cash flow ignores the pickup-date filter: an invoice from 60 days ago is still open money.
  const { rawLoads } = useData();
  const [drawer, setDrawer] = useState<{ title: string; items: CashItem[] } | null>(null);

  const ar = useMemo(() => cashItems(rawLoads, 'ar'), [rawLoads]);
  const ap = useMemo(() => cashItems(rawLoads, 'ap'), [rawLoads]);
  const fc = useMemo(() => weeklyForecast(ar, ap, 8), [ar, ap]);
  const arAging = useMemo(() => agingBuckets(ar), [ar]);
  const apAging = useMemo(() => agingBuckets(ap), [ap]);
  const flagged = useMemo(() => ar.filter(isFlagged180).sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0)), [ar]);
  const hasFinance = rawLoads.some(l => l.arInvoiceAmount != null || l.apInvoiceAmount != null);
  const net8 = fc.buckets[fc.buckets.length - 1]?.cumulative ?? 0;

  const byId = useMemo(() => new Map((drawer?.items ?? []).map(i => [i.load.loadId, i])), [drawer]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          Cash Flow
          <InfoTip text={`Money in = open customer invoices by due date. Money out = open carrier invoices by due date. Loads not invoiced yet are estimated: AR at delivery + ${A.arInvoiceLagDays + A.arTermsDays} days, AP at delivery + ${A.apTermsDays} days.`} />
        </h2>
        <p className="text-muted-foreground text-sm mt-1">All open receivables and payables. Date filters don’t apply here.</p>
        <DataWarnings warnings={hasFinance ? (OLD_AR_SYNCED ? [] : [OLD_AR_WARNING]) : ['No invoice data yet. Run a Turvo sync from Settings after the sync update is deployed.']} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Open AR" info={METRIC_INFO.openAr} value={usd(sum(ar))} sub={`${ar.filter(i => i.invoiced).length} invoiced · ${ar.filter(i => !i.invoiced).length} not yet`} onClick={() => setDrawer({ title: 'Open AR', items: ar })} />
        <Kpi label="Open AP" info={METRIC_INFO.openAp} value={usd(sum(ap))} sub={`${ap.length} carrier payables`} onClick={() => setDrawer({ title: 'Open AP', items: ap })} />
        <Kpi label="AR Past Due" info={METRIC_INFO.arPastDue} value={usd(fc.overdueAr)} tone={fc.overdueAr > 0 ? 'bad' : 'good'} sub="Customers late paying" onClick={() => setDrawer({ title: 'AR past due', items: ar.filter(i => i.overdue) })} />
        <Kpi label="Net Next 8 Weeks" info={METRIC_INFO.net8Weeks} value={usd(net8)} tone={net8 >= 0 ? 'good' : 'bad'} sub="In minus out (excl. past due)" />
        <Kpi label={`Unpaid ${AR_FLAG_DAYS}+ Days`} info={METRIC_INFO.unpaid180} value={flagged.length.toString()} tone={flagged.length ? 'bad' : 'good'} sub={usd(sum(flagged))} onClick={() => setDrawer({ title: `AR unpaid ${AR_FLAG_DAYS}+ days`, items: flagged })} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Weekly forecast</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fc.buckets}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis tickFormatter={usdK} fontSize={11} />
              <Tooltip formatter={(v: number) => usd(v)} />
              <Legend />
              <Bar dataKey="ar" name="Money in (AR)" fill="hsl(var(--success))" />
              <Bar dataKey="ap" name="Money out (AP)" fill="hsl(var(--destructive))" />
              <Line dataKey="cumulative" name="Cumulative net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <AgingCard title="AR aging (customers)" rows={arAging} onOpen={(t, items) => setDrawer({ title: `AR · ${t}`, items })} />
        <AgingCard title="AP aging (carriers)" rows={apAging} onOpen={(t, items) => setDrawer({ title: `AP · ${t}`, items })} />
      </div>

      <LoadListDrawer
        open={drawer != null}
        onOpenChange={o => { if (!o) setDrawer(null); }}
        title={drawer?.title ?? ''}
        description="Export to CSV for follow-up."
        loads={(drawer?.items ?? []).map(i => i.load)}
        extraColumns={[
          { label: 'Open', align: 'right', render: l => usd(byId.get(l.loadId)?.amount ?? 0), csv: l => byId.get(l.loadId)?.amount },
          { label: 'Expected', render: l => formatUSDate(byId.get(l.loadId)?.date), csv: l => formatUSDate(byId.get(l.loadId)?.date) },
          { label: 'Basis', render: l => <Badge variant="outline" className="text-xs">{byId.get(l.loadId)?.basis}</Badge>, csv: l => byId.get(l.loadId)?.basis },
          { label: 'Age (d)', align: 'right', render: l => byId.get(l.loadId)?.ageDays ?? '—', csv: l => byId.get(l.loadId)?.ageDays },
          { label: 'Check', render: l => { const f = apCheck(l, byId.get(l.loadId)?.side); return f ? <span className="text-xs text-warning">{f}</span> : ''; },
            csv: l => apCheck(l, byId.get(l.loadId)?.side) ?? '' },
        ]}
      />
    </div>
  );
}

/**
 * Loads picked up before 9 Jun 2026 were never synced (the first backfill could only reach 180 days
 * back), so their unpaid invoices aren't here (gap analysis 20 Nov 2026: ~$1.75M in Turvo's A/R report).
 * The sync keeps refreshing loads once stored. Set to true after backfilling those loads.
 */
const OLD_AR_SYNCED = false;
const OLD_AR_WARNING =
  'Open AR doesn’t include loads picked up before 9 Jun 2026. Unpaid invoices on those loads are in Turvo but not here yet, ' +
  'so Open AR, AR Past Due and Unpaid 180+ Days are understated. Use Turvo’s A/R report for older balances until this is fixed.';

/**
 * Open AP is what we owe the carrier (payable after deductions). When the carrier's invoice in
 * Turvo says something else, flag it so accounting can fix Turvo (QA: CL-27497 had a $12,000
 * invoice on a $100 charge).
 */
function apCheck(l: Load, side?: 'ar' | 'ap'): string | undefined {
  if (side !== 'ap' || l.apSettlementAmount == null || l.apInvoiceAmount == null) return undefined;
  if (l.apSettlementAmount <= l.apInvoiceAmount) return undefined;
  // Invoice minus deductions/claims = what we owe → normal, not a Turvo error (e.g. CL-26018, CL-25771)
  const explained = l.apSettlementAmount - (l.apDeductions ?? 0);
  if (Math.abs(explained - l.apInvoiceAmount) < 1) return undefined;
  return `Carrier invoice ${usd(l.apSettlementAmount)} ≠ owed ${usd(l.apInvoiceAmount)}`;
}

function AgingCard({ title, rows, onOpen }: {
  title: string;
  rows: { label: string; count: number; amount: number; items: CashItem[] }[];
  onOpen: (label: string, items: CashItem[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-border/50 cursor-pointer hover:bg-muted/50" onClick={() => onOpen(r.label, r.items)}>
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right font-mono">{r.count}</td>
                <td className="py-2 text-right font-mono">{usd(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, sub, tone = 'neutral', onClick, info }: {
  label: string; value: string; sub: string; tone?: 'good' | 'bad' | 'neutral'; onClick?: () => void;
  info?: MetricInfo;
}) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-foreground';
  return (
    <Card className={onClick ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''} onClick={onClick}>
      <CardContent className="p-4 text-center">
        <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center justify-center gap-1">
          {label}
          {info && <InfoTip text={info.text} source={info.source} />}
        </div>
        <p className={`text-2xl font-bold mt-1.5 font-mono ${color}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
