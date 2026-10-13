import { useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import InfoTip from '@/components/InfoTip';
import { DataWarnings } from '@/components/DataTrust';
import LoadListDrawer from '@/components/LoadListDrawer';
import { formatUSDate } from '@/lib/dates';
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
        <DataWarnings warnings={hasFinance ? [] : ['No invoice data yet. Run a Turvo sync from Settings after the sync update is deployed.']} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Open AR" value={usd(sum(ar))} sub={`${ar.filter(i => i.invoiced).length} invoiced · ${ar.filter(i => !i.invoiced).length} not yet`} onClick={() => setDrawer({ title: 'Open AR', items: ar })} />
        <Kpi label="Open AP" value={usd(sum(ap))} sub={`${ap.length} carrier payables`} onClick={() => setDrawer({ title: 'Open AP', items: ap })} />
        <Kpi label="AR Past Due" value={usd(fc.overdueAr)} tone={fc.overdueAr > 0 ? 'bad' : 'good'} sub="Customers late paying" onClick={() => setDrawer({ title: 'AR past due', items: ar.filter(i => i.overdue) })} />
        <Kpi label="Net Next 8 Weeks" value={usd(net8)} tone={net8 >= 0 ? 'good' : 'bad'} sub="In minus out (excl. past due)" />
        <Kpi label={`Unpaid ${AR_FLAG_DAYS}+ Days`} value={flagged.length.toString()} tone={flagged.length ? 'bad' : 'good'} sub={usd(sum(flagged))} onClick={() => setDrawer({ title: `AR unpaid ${AR_FLAG_DAYS}+ days`, items: flagged })} />
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
        ]}
      />
    </div>
  );
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

function Kpi({ label, value, sub, tone = 'neutral', onClick }: {
  label: string; value: string; sub: string; tone?: 'good' | 'bad' | 'neutral'; onClick?: () => void;
}) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-foreground';
  return (
    <Card className={onClick ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''} onClick={onClick}>
      <CardContent className="p-4 text-center">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1.5 font-mono ${color}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
