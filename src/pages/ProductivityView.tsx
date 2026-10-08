import { useData } from '@/context/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge } from '@/components/DataTrust';

const fmt = (n?: number) => n != null ? `$${n.toLocaleString('en-US')}` : '—';

export default function ProductivityView() {
  const { loads } = useData();

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Productivity</h2>
          <DataTrustBadge level="verified" tooltip="Based on all loads with assigned brokers in the current filter" />
        </div>
        <p className="text-muted-foreground text-sm mt-1">Performance by broker / operator</p>
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
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{d.name}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{d.loads}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{fmt(d.revenue)}</td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{fmt(d.profit)}</td>
                    <td className={`px-4 py-3 text-right font-mono whitespace-nowrap font-medium ${d.margin >= 15 ? 'text-success' : d.margin >= 10 ? 'text-warning' : 'text-destructive'}`}>
                      {d.margin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
