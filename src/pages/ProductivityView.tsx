import { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge } from '@/components/DataTrust';
import { brokerDrilldown, type DrillRow } from '@/lib/brokerDrilldown';

const fmt = (n?: number) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const marginCls = (m: number) => (m >= 15 ? 'text-success' : m >= 10 ? 'text-warning' : 'text-destructive');

export default function ProductivityView() {
  const { loads } = useData();
  const [selected, setSelected] = useState<string | null>(null);

  const brokerMap = new Map<string, { loads: number; revenue: number; cost: number; hasAnyCost: boolean }>();
  loads.forEach(l => {
    const b = l.broker || 'Unassigned';
    const e = brokerMap.get(b) || { loads: 0, revenue: 0, cost: 0, hasAnyCost: false };
    e.loads++;
    e.revenue += l.revenue || 0;
    if (l.carrierCost != null) { e.cost += l.carrierCost; e.hasAnyCost = true; }
    brokerMap.set(b, e);
  });

  const data = [...brokerMap.entries()]
    .map(([name, v]) => {
      const profit = v.revenue - v.cost;
      const margin = v.revenue > 0 ? (profit / v.revenue * 100) : 0;
      return { name, loads: v.loads, revenue: v.revenue, profit, margin };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const drill = useMemo(() => (selected ? brokerDrilldown(loads, selected) : null), [loads, selected]);
  const summary = selected ? data.find(d => d.name === selected) : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Productivity</h2>
          <DataTrustBadge level="verified" tooltip="Based on all loads with assigned brokers in the current filter" />
        </div>
        <p className="text-muted-foreground text-sm mt-1">Performance by broker / operator — click a name to see their top lanes and customers</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0 z-10"><tr className="text-muted-foreground text-xs border-b bg-muted/30">
                <th className="text-left px-4 py-3 whitespace-nowrap">Broker / Operator</th>
                <th className="text-right px-4 py-3 whitespace-nowrap w-[70px]">Loads</th>
                <th className="text-right px-4 py-3 whitespace-nowrap w-[110px]">Revenue</th>
                <th className="text-right px-4 py-3 whitespace-nowrap w-[110px]"><span className="inline-flex items-center gap-1">Gross Profit <InfoTip text="Revenue minus carrier cost" /></span></th>
                <th className="text-right px-4 py-3 whitespace-nowrap w-[90px]"><span className="inline-flex items-center gap-1">Margin <InfoTip text="Gross profit divided by revenue" /></span></th>
              </tr></thead>
              <tbody>
                {data.map((d, i) => (
                  <tr key={d.name} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? 'bg-muted/15' : ''}`}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelected(d.name)}
                        className="text-primary hover:underline underline-offset-2 text-left"
                        title={`Show ${d.name}'s top lanes and customers`}
                      >
                        {d.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{d.loads}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{fmt(d.revenue)}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{fmt(d.profit)}</td>
                    <td className={`px-4 py-3 text-right font-mono whitespace-nowrap font-medium ${marginCls(d.margin)}`}>
                      {d.margin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected}</SheetTitle>
            <SheetDescription>Top lanes and customers by volume for the current filters.</SheetDescription>
          </SheetHeader>

          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Stat label="Loads" value={summary.loads.toLocaleString('en-US')} />
              <Stat label="Revenue" value={fmt(summary.revenue)} />
              <Stat label="Gross Profit" value={fmt(summary.profit)} />
              <Stat label="Margin" value={`${summary.margin.toFixed(1)}%`} cls={marginCls(summary.margin)} />
            </div>
          )}

          {drill && (
            <div className="space-y-6 mt-6">
              <DrillTable title="Top Lanes" nameLabel="Lane" rows={drill.lanes} showAverages />
              <DrillTable title="Top Customers" nameLabel="Customer" rows={drill.customers} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold font-mono mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

function DrillTable({ title, nameLabel, rows, showAverages }: { title: string; nameLabel: string; rows: DrillRow[]; showAverages?: boolean }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground border-b bg-muted/30">
            <th className="text-left px-3 py-2">{nameLabel}</th>
            <th className="text-right px-3 py-2">Loads</th>
            {showAverages && <th className="text-right px-3 py-2">Avg Rev</th>}
            {showAverages && <th className="text-right px-3 py-2">Avg Cost</th>}
            <th className="text-right px-3 py-2">Revenue</th>
            <th className="text-right px-3 py-2">Gross Profit</th>
            <th className="text-right px-3 py-2">Margin</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={showAverages ? 7 : 5} className="text-center text-muted-foreground py-6">No loads in this period</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.name} className="border-b border-border/50 even:bg-muted/15">
                <td className="px-3 py-2 font-medium max-w-[260px] truncate" title={r.name}>{r.name}</td>
                <td className="px-3 py-2 text-right font-mono">{r.loads}</td>
                {showAverages && <td className="px-3 py-2 text-right font-mono">{fmt(r.avgRevenue)}</td>}
                {showAverages && <td className="px-3 py-2 text-right font-mono">{fmt(r.avgCost)}</td>}
                <td className="px-3 py-2 text-right font-mono">{fmt(r.revenue)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.profit)}</td>
                <td className={`px-3 py-2 text-right font-mono font-medium ${marginCls(r.margin)}`}>{r.margin.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}