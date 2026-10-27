import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import type { Load } from '@/types/loads';
import { formatUSDate } from '@/lib/dates';
import { laneOf } from '@/lib/computeLoads';

const money = (n?: number) => (n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—');

export interface ExtraColumn {
  label: string;
  render: (l: Load) => React.ReactNode;
  /** Plain value for the CSV export */
  csv?: (l: Load) => string | number | undefined;
  align?: 'left' | 'right';
}

interface LoadListDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  loads: Load[];
  /** Page-specific columns (e.g. "Late by") shown after the standard ones. */
  extraColumns?: ExtraColumn[];
  /** Highlight missing revenue / cost cells (Data Quality). */
  highlightMissingFinancials?: boolean;
}

/**
 * Side panel listing the shipments behind a number, with an "accounts" summary
 * (customers, most affected first). Used by Data Quality and Service Performance.
 */
export default function LoadListDrawer({
  open, onOpenChange, title, description, loads, extraColumns = [], highlightMissingFinancials,
}: LoadListDrawerProps) {
  const [account, setAccount] = useState<string | null>(null);

  const accounts = useMemo(() => {
    const m = new Map<string, number>();
    loads.forEach(l => m.set(l.customerName || 'Unknown', (m.get(l.customerName || 'Unknown') ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [loads]);

  const rows = useMemo(
    () => (account ? loads.filter(l => (l.customerName || 'Unknown') === account) : loads)
      .slice()
      .sort((a, b) => (b.pickupDate || '').localeCompare(a.pickupDate || '')),
    [loads, account],
  );

  const lane = (l: Load) => laneOf(l); // same normalized lane name as every table

  const exportCsv = () => {
    const header = ['Load', 'Customer', 'Carrier', 'Broker', 'Lane', 'Pickup', 'Status', 'Revenue', 'Cost', ...extraColumns.map(c => c.label)];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(l => [
      l.loadId, l.customerName, l.carrierName, l.broker, lane(l), formatUSDate(l.pickupDate), l.shipmentStatus,
      l.revenue ?? '', l.carrierCost ?? '', ...extraColumns.map(c => (c.csv ? c.csv(l) : '')),
    ].map(esc).join(','));
    const blob = new Blob([[header.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Sheet open={open} onOpenChange={o => { onOpenChange(o); if (!o) setAccount(null); }}>
      <SheetContent side="right" className="w-full sm:max-w-6xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title} <span className="text-muted-foreground font-normal">({loads.length})</span></SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        {loads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No loads match — nothing to fix.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Accounts</p>
                <button onClick={exportCsv} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Download className="w-3 h-3" /> Export CSV
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={!account} onClick={() => setAccount(null)}>All ({loads.length})</Chip>
                {accounts.map(([name, n]) => (
                  <Chip key={name} active={account === name} onClick={() => setAccount(account === name ? null : name)}>
                    {name} ({n})
                  </Chip>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b">
                    <th className="text-left py-2 pr-2">Load</th>
                    <th className="text-left py-2 pr-2">Customer</th>
                    <th className="text-left py-2 pr-2">Carrier</th>
                    <th className="text-left py-2 pr-2">Broker</th>
                    <th className="text-left py-2 pr-2">Lane</th>
                    <th className="text-left py-2 pr-2">Pickup</th>
                    <th className="text-left py-2 pr-2">Status</th>
                    <th className="text-right py-2 pr-2">Revenue</th>
                    <th className="text-right py-2 pr-2">Cost</th>
                    {extraColumns.map(c => (
                      <th key={c.label} className={`py-2 pr-2 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(l => (
                    <tr key={l.loadId} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">{l.loadId}</td>
                      <td className="py-2 pr-2">{l.customerName || '—'}</td>
                      <td className="py-2 pr-2">{l.carrierName || '—'}</td>
                      <td className="py-2 pr-2">{l.broker || '—'}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{lane(l)}</td>
                      <td className="py-2 pr-2 text-xs whitespace-nowrap">{formatUSDate(l.pickupDate)}</td>
                      <td className="py-2 pr-2"><Badge variant="secondary" className="text-[10px] whitespace-nowrap">{l.shipmentStatus || '—'}</Badge></td>
                      <td className={`py-2 pr-2 text-right font-mono text-xs ${highlightMissingFinancials && l.revenue == null ? 'text-destructive font-semibold' : ''}`}>
                        {highlightMissingFinancials && l.revenue == null ? 'missing' : money(l.revenue)}
                      </td>
                      <td className={`py-2 pr-2 text-right font-mono text-xs ${highlightMissingFinancials && l.carrierCost == null ? 'text-destructive font-semibold' : ''}`}>
                        {highlightMissingFinancials && l.carrierCost == null ? 'missing' : money(l.carrierCost)}
                      </td>
                      {extraColumns.map(c => (
                        <td key={c.label} className={`py-2 pr-2 text-xs ${c.align === 'right' ? 'text-right font-mono' : ''}`}>{c.render(l)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}
    >
      {children}
    </button>
  );
}