import { useState } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatUSDate } from '@/lib/dates';
import { businessTodayDate } from '@/lib/filters';

export default function ExceptionsView() {
  const { loads } = useData();
  const [unbilledDays, setUnbilledDays] = useState(7);

  const now = businessTodayDate();

  const unbilled = loads.filter(l => {
    if (!l.readyToBillDate || l.invoiceSentDate) return false;
    const readyDate = new Date(l.readyToBillDate.slice(0, 10) + 'T00:00:00Z');
    const daysSinceReady = Math.floor((now.getTime() - readyDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceReady >= unbilledDays;
  });

  const missingKey = loads.filter(l => l.revenue == null || l.carrierCost == null || !l.customerName || !l.carrierName);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">Exception Center</h2>
        <p className="text-muted-foreground text-sm mt-1">Loads needing attention</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Ready but Not Invoiced ({unbilledDays}+ days)</p>
            <p className="text-3xl font-bold mt-2 font-mono text-warning">{unbilled.length}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Days threshold:</span>
              <Input
                type="number"
                min={1}
                value={unbilledDays}
                onChange={e => setUnbilledDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-7 w-16 text-xs text-center"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Missing Key Data</p>
            <p className="text-3xl font-bold mt-2 font-mono text-destructive">{missingKey.length}</p>
          </CardContent>
        </Card>
      </div>

      {unbilled.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ready to Bill — Not Invoiced ({unbilledDays}+ days)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10"><tr className="text-muted-foreground text-xs border-b bg-muted/30">
                  <th className="text-left py-2 px-3">Load ID</th>
                  <th className="text-left py-2 px-3">Customer</th>
                  <th className="text-right py-2 px-3">Revenue</th>
                  <th className="text-left py-2 px-3">Ready Date</th>
                  <th className="text-right py-2 px-3">Days Waiting</th>
                </tr></thead>
                <tbody>
                  {unbilled.map((l, i) => {
                    const days = Math.floor((now.getTime() - new Date(l.readyToBillDate!).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={l.loadId} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-muted/15' : ''}`}>
                        <td className="py-2 px-3 font-mono text-xs">{l.loadId}</td>
                        <td className="py-2 px-3">{l.customerName || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono">{l.revenue != null ? `$${Math.round(l.revenue).toLocaleString('en-US')}` : '—'}</td>
                        <td className="py-2 px-3 text-xs">{formatUSDate(l.readyToBillDate)}</td>
                        <td className="py-2 px-3 text-right font-mono text-warning">{days}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {missingKey.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Loads Missing Key Data</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10"><tr className="text-muted-foreground text-xs border-b bg-muted/30">
                  <th className="text-left py-2 px-3">Load ID</th>
                  <th className="text-left py-2 px-3">Missing Fields</th>
                </tr></thead>
                <tbody>
                  {missingKey.slice(0, 50).map((l, i) => {
                    const missing: string[] = [];
                    if (l.revenue == null) missing.push('Revenue');
                    if (l.carrierCost == null) missing.push('Cost');
                    if (!l.customerName) missing.push('Customer');
                    if (!l.carrierName) missing.push('Carrier');
                    return (
                      <tr key={l.loadId} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-muted/15' : ''}`}>
                        <td className="py-2 px-3 font-mono text-xs">{l.loadId}</td>
                        <td className="py-2 px-3 flex gap-1 flex-wrap">
                          {missing.map(m => <Badge key={m} variant="destructive" className="text-xs">{m}</Badge>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
