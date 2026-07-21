import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge, DataWarnings } from '@/components/DataTrust';

export default function ServiceView() {
  const { loads } = useData();

  const withPickup = loads.filter(l => l.onTimePickup !== 'Unknown');
  const withDelivery = loads.filter(l => l.onTimeDelivery !== 'Unknown');

  const onTimePickup = withPickup.filter(l => l.onTimePickup === 'On Time').length;
  const onTimeDelivery = withDelivery.filter(l => l.onTimeDelivery === 'On Time').length;
  const lateLoads = loads.filter(l => l.onTimePickup === 'Late' || l.onTimeDelivery === 'Late');
  const unknownLoads = loads.filter(l => l.onTimePickup === 'Unknown' && l.onTimeDelivery === 'Unknown');

  const pickupPct = withPickup.length ? (onTimePickup / withPickup.length * 100) : null;
  const deliveryPct = withDelivery.length ? (onTimeDelivery / withDelivery.length * 100) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold flex items-center gap-2">Service Performance <InfoTip text="On-time status is based on comparing actual vs scheduled timestamps. A 60-minute grace window is allowed." /></h2>
          <DataTrustBadge
            level={unknownLoads.length === 0 ? 'verified' : unknownLoads.length / loads.length < 0.2 ? 'partial' : 'incomplete'}
            tooltip={unknownLoads.length === 0 ? 'All loads have timestamp data' : `${unknownLoads.length} loads missing pickup/delivery timestamps`}
          />
        </div>
        <p className="text-muted-foreground text-sm mt-1">On-time metrics based on available timestamp data</p>
        <DataWarnings warnings={[
          ...(unknownLoads.length > 0 ? [`${unknownLoads.length} loads have no timestamp data — excluded from on-time calculations`] : []),
          'Customer pickup change logic not finalized — early/late may not reflect rescheduled appointments',
        ]} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="On-Time Pickup" value={pickupPct != null ? `${pickupPct.toFixed(0)}%` : 'No Data'} sub={`${onTimePickup}/${withPickup.length} loads`} good={pickupPct != null && pickupPct >= 90} />
        <MetricCard label="On-Time Delivery" value={deliveryPct != null ? `${deliveryPct.toFixed(0)}%` : 'No Data'} sub={`${onTimeDelivery}/${withDelivery.length} loads`} good={deliveryPct != null && deliveryPct >= 90} />
        <MetricCard label="Late Shipments" value={lateLoads.length.toString()} sub="Pickup or delivery late" good={lateLoads.length === 0} />
        <MetricCard label="Unknown / Missing" value={unknownLoads.length.toString()} sub="No timestamp data" good={unknownLoads.length === 0} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Late & Unknown Shipments</CardTitle></CardHeader>
        <CardContent>
          {lateLoads.length === 0 && unknownLoads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No late or unknown shipments</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground text-xs border-b">
                <th className="text-left py-2">Load ID</th><th className="text-left py-2">Customer</th><th className="text-left py-2">Lane</th><th className="text-left py-2">Pickup</th><th className="text-left py-2">Delivery</th>
              </tr></thead>
              <tbody>
                {[...lateLoads, ...unknownLoads].slice(0, 20).map(l => (
                  <tr key={l.loadId} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs">{l.loadId}</td>
                    <td className="py-2">{l.customerName || '—'}</td>
                    <td className="py-2 text-xs">{l.lane}</td>
                    <td className="py-2"><StatusBadge status={l.onTimePickup} /></td>
                    <td className="py-2"><StatusBadge status={l.onTimeDelivery} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, sub, good }: { label: string; value: string; sub: string; good: boolean }) {
  return (
    <Card>
      <CardContent className="p-5 text-center">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-3xl font-bold mt-2 font-mono ${good ? 'text-success' : 'text-warning'}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'On Time' ? 'default' : status === 'Late' ? 'destructive' : 'secondary';
  return <Badge variant={variant} className="text-xs">{status}</Badge>;
}
