import { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge, DataWarnings } from '@/components/DataTrust';
import type { ComputedLoad } from '@/types/loads';
import LoadListDrawer from '@/components/LoadListDrawer';
import { isScored } from '@/lib/computeLoads';
import { summarizeOtd } from '@/lib/delayReasons';

type StatusFilter = 'all' | 'on-time' | 'late' | 'hidden' | 'customer' | 'shipper' | 'excluded' | 'on-time-pickup' | 'late-pickup' | 'unknown';
type GroupBy = 'broker' | 'team' | 'customer' | 'carrier';

const STATUS_FILTERS: { key: StatusFilter; label: string; match: (l: ComputedLoad) => boolean }[] = [
  { key: 'all', label: 'All shipments', match: () => true },
  { key: 'on-time', label: 'On-time delivery', match: l => l.onTimeDelivery === 'On Time' },
  { key: 'late', label: 'Late delivery', match: l => l.onTimeDelivery === 'Late' },
  { key: 'hidden', label: 'Hidden late', match: l => l.hiddenLate },
  { key: 'on-time-pickup', label: 'On-time pickup', match: l => l.onTimePickup === 'On Time' },
  { key: 'late-pickup', label: 'Late pickup', match: l => l.onTimePickup === 'Late' },
  { key: 'customer', label: 'Customer fault (excused)', match: l => l.excludedFromOnTime && l.delayFault === 'customer' },
  { key: 'shipper', label: 'Shipper fault (excused)', match: l => l.excludedFromOnTime && l.delayFault === 'shipper' },
  { key: 'excluded', label: 'Excluded (rescheduled)', match: l => l.excludedFromOnTime },
  { key: 'unknown', label: "Can't score", match: l => l.onTimeDelivery === 'Unknown' },
];

const GROUP_LABEL: Record<GroupBy, string> = { broker: 'Broker', team: 'Team', customer: 'Customer', carrier: 'Carrier' };
const groupValue = (l: ComputedLoad, g: GroupBy) =>
  (g === 'broker' ? l.broker : g === 'team' ? l.team : g === 'customer' ? l.customerName : l.carrierName) || 'Unassigned';

const pct = (num: number, den: number) => (den ? (num / den) * 100 : null);
const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`);

export default function ServiceView() {
  const { loads } = useData();
  const [status, setStatus] = useState<StatusFilter>('late');
  const [groupBy, setGroupBy] = useState<GroupBy>('broker');
  const [group, setGroup] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [drawer, setDrawer] = useState<StatusFilter | null>(null);

  // Clicking a KPI card opens the shipments behind it (with the accounts involved),
  // and also sets the table below to the same filter.
  const openList = (key: StatusFilter) => { setStatus(key); setDrawer(key); };
  const drawerDef = STATUS_FILTERS.find(f => f.key === drawer);
  const drawerLoads = useMemo(
    () => (drawerDef ? loads.filter(drawerDef.match).filter(l => !group || groupValue(l, groupBy) === group) : []),
    [loads, drawerDef, group, groupBy],
  );


  const synced = loads.filter(l => l.serviceSource === 'turvo').length;
  const usingNewRules = loads.length > 0 && synced / loads.length >= 0.9;

  const kpi = useMemo(() => {
    const knownPu = loads.filter(l => isScored(l.onTimePickup));
    const knownDel = loads.filter(l => isScored(l.onTimeDelivery));
    const knownTurvo = loads.filter(l => l.onTimeDeliveryTurvo && l.onTimeDeliveryTurvo !== 'Unknown');
    const otd = summarizeOtd(loads);
    return {
    rawPct: otd.rawPct,
      total: loads.length,
      puPct: pct(knownPu.filter(l => l.onTimePickup === 'On Time').length, knownPu.length),
      puLate: knownPu.filter(l => l.onTimePickup === 'Late').length,
      delPct: pct(knownDel.filter(l => l.onTimeDelivery === 'On Time').length, knownDel.length),
      delKnown: knownDel.length,
      turvoPct: pct(knownTurvo.filter(l => l.onTimeDeliveryTurvo === 'On Time').length, knownTurvo.length),
      late: knownDel.filter(l => l.onTimeDelivery === 'Late').length,
      hidden: loads.filter(l => l.hiddenLate).length,
      customer: loads.filter(l => l.excludedFromOnTime && l.delayFault === 'customer').length,
      shipper: loads.filter(l => l.excludedFromOnTime && l.delayFault === 'shipper').length,
      excluded: loads.filter(l => l.excludedFromOnTime).length,
      unknown: loads.filter(l => l.onTimeDelivery === 'Unknown').length,
    };
  }, [loads]);

  // Accountability: who owns the late shipments
  const groups = useMemo(() => {
      const m = new Map<string, { name: string; loads: number; known: number; onTime: number; late: number; hidden: number; excluded: number; puKnown: number; puOnTime: number }>();
    for (const l of loads) {
      const name = groupValue(l, groupBy);
      const g = m.get(name) ?? { name, loads: 0, known: 0, onTime: 0, late: 0, hidden: 0, excluded: 0, puKnown: 0, puOnTime: 0 };
      g.loads++;
      if (isScored(l.onTimeDelivery)) { g.known++; if (l.onTimeDelivery === 'On Time') g.onTime++; else g.late++; }
      if (isScored(l.onTimePickup)) { g.puKnown++; if (l.onTimePickup === 'On Time') g.puOnTime++; }
      if (l.hiddenLate) g.hidden++;
      if (l.excludedFromOnTime) g.excluded++;

      m.set(name, g);
    }
    return [...m.values()].sort((a, b) => b.late - a.late || b.loads - a.loads);
  }, [loads, groupBy]);

  const statusDef = STATUS_FILTERS.find(f => f.key === status)!;
  const rows = useMemo(
    () => loads
      .filter(statusDef.match)
      .filter(l => !group || groupValue(l, groupBy) === group)
      .sort((a, b) => (b.minutesLate ?? 0) - (a.minutesLate ?? 0)),
    [loads, statusDef, group, groupBy],
  );
  const visible = showAll ? rows : rows.slice(0, 50);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            Service Performance
             <InfoTip text="Pickup is scored against its current appointment, so a customer moving the pickup never counts as late. Delivery is scored against the original appointment, unless the customer rescheduled the load or the shipper held the truck — those loads are left out of on-time % entirely. A moved date can no longer hide a late carrier." />
          </h2>
          <DataTrustBadge
            level={!usingNewRules ? 'incomplete' : kpi.unknown / Math.max(kpi.total, 1) < 0.1 ? 'verified' : 'partial'}
            tooltip={usingNewRules ? `${kpi.unknown} shipments missing arrival times` : 'Re-sync from Turvo to use the new on-time rules'}
          />
        </div>
            <p className="text-muted-foreground text-sm mt-1">True on-time excludes shipper/customer-caused delays; Raw = arrival vs. the original appointment with nothing excused.</p>
        <DataWarnings warnings={[
          ...(!usingNewRules ? ['Most loads were not synced with the new rules yet — run Settings → Sync now (180 days) so on-time uses original vs. rescheduled dates.'] : []),
          ...(kpi.unknown > 0 ? [`${kpi.unknown} shipments have no delivery arrival time in Turvo — excluded from on-time %`] : []),
        ]} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <MetricCard label="Total Shipments" value={kpi.total.toLocaleString('en-US')} sub="In current filters" tone="neutral" onClick={() => openList('all')} />
        <MetricCard label="On-Time Pickup" value={fmtPct(kpi.puPct)} sub={`${kpi.puLate} late pickups`} tone={kpi.puPct != null && kpi.puPct >= 90 ? 'good' : 'warn'} onClick={() => openList('on-time-pickup')} secondary={{ label: `${kpi.puLate} late`, onClick: () => openList('late-pickup') }} />
        <MetricCard label="True On-Time Delivery" value={fmtPct(kpi.delPct)} sub={`Raw ${fmtPct(kpi.rawPct)}${kpi.turvoPct != null ? ` · Turvo ${fmtPct(kpi.turvoPct)}` : ''}`} tone={'good'} />
        <MetricCard label="Late Shipments" value={kpi.late.toString()} sub="Late at delivery" tone={kpi.late === 0 ? 'good' : 'bad'} onClick={() => openList('late')} />
        <MetricCard label="Hidden Late" value={kpi.hidden.toString()} sub="On time in Turvo, date moved" tone={kpi.hidden === 0 ? 'good' : 'bad'} onClick={() => openList('hidden')} />
        <MetricCard label="Excluded (Rescheduled)" value={kpi.excluded.toString()} sub={`${kpi.customer} customer · ${kpi.shipper} shipper · not in on-time %`} tone="neutral" onClick={() => openList('excluded')} />
        <MetricCard label="Can't Score" value={kpi.unknown.toString()} sub="Missing arrival time" tone={kpi.unknown === 0 ? 'good' : 'warn'} onClick={() => openList('unknown')} />
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium">Who owns the late shipments</CardTitle>
          <Chips
            options={(Object.keys(GROUP_LABEL) as GroupBy[]).map(k => ({ key: k, label: `By ${GROUP_LABEL[k].toLowerCase()}` }))}
            value={groupBy}
            onChange={k => { setGroupBy(k as GroupBy); setGroup(null); }}
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground text-xs border-b">
              <th className="text-left py-2">{GROUP_LABEL[groupBy]}</th>
              <th className="text-right py-2">Shipments</th>
              <th className="text-right py-2">Late</th>
              <th className="text-right py-2">On-time delivery</th>
              <th className="text-right py-2">On-time pickup</th>
              <th className="text-right py-2">Hidden late</th>
               <th className="text-right py-2">Excluded</th>
            </tr></thead>
            <tbody>
              {groups.slice(0, 15).map(g => {
                const otd = pct(g.onTime, g.known);
                return (
                  <tr
                    key={g.name}
                    onClick={() => setGroup(group === g.name ? null : g.name)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-muted/50 ${group === g.name ? 'bg-muted' : ''}`}
                  >
                    <td className="py-2">{g.name}</td>
                    <td className="py-2 text-right font-mono">{g.loads}</td>
                    <td className="py-2 text-right font-mono">{g.late}</td>
                    <td className={`py-2 text-right font-mono ${otd != null && otd < 80 ? 'text-destructive' : ''}`}>{fmtPct(otd)}</td>
                    <td className="py-2 text-right font-mono">{fmtPct(pct(g.puOnTime, g.puKnown))}</td>
                    <td className="py-2 text-right font-mono">{g.hidden || '—'}</td>
                                        <td className="py-2 text-right font-mono">{g.excluded || '—'}</td>

                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">Click a row to see its shipments below.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 space-y-3">
          <CardTitle className="text-sm font-medium">
            {statusDef.label} {group && <>· {group}</>} <span className="text-muted-foreground font-normal">({rows.length})</span>
            {group && <button className="ml-2 text-xs underline text-muted-foreground" onClick={() => setGroup(null)}>clear</button>}
          </CardTitle>
          <Chips options={STATUS_FILTERS.map(f => ({ key: f.key, label: f.label }))} value={status} onChange={k => setStatus(k as StatusFilter)} />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No shipments match</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead><tr className="text-muted-foreground text-xs border-b">
                  <th className="text-left py-2">Load</th>
                  <th className="text-left py-2">Customer</th>
                  <th className="text-left py-2">Carrier</th>
                  <th className="text-left py-2">Broker</th>
                  <th className="text-left py-2">Lane</th>
                  <th className="text-left py-2">Pickup</th>
                  <th className="text-left py-2">Delivery</th>
                  <th className="text-left py-2">Date moved</th>
                  <th className="text-right py-2">Late by</th>
                </tr></thead>
                <tbody>
                  {visible.map(l => (
                    <tr key={l.loadId} className="border-b border-border/50">
                      <td className="py-2 font-mono text-xs">{l.loadId}</td>
                      <td className="py-2">{l.customerName || '—'}</td>
                      <td className="py-2">{l.carrierName || '—'}</td>
                      <td className="py-2">{l.broker || '—'}</td>
                      <td className="py-2 text-xs">{l.lane}</td>
                      <td className="py-2"><StatusBadge status={l.onTimePickup} /></td>
                      <td className="py-2"><StatusBadge status={l.onTimeDelivery} hidden={l.hiddenLate} /></td>
                      <td className="py-2 text-xs"><MovedCell load={l} /></td>
                      <td className="py-2 text-right font-mono text-xs">{l.minutesLate ? formatDuration(l.minutesLate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <button className="mt-3 text-xs underline text-muted-foreground" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show first 50' : `Show all ${rows.length}`}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <LoadListDrawer
        open={drawer != null}
        onOpenChange={o => { if (!o) setDrawer(null); }}
        title={`${drawerDef?.label ?? ''}${group ? ` · ${group}` : ''}`}
        description="Shipments in the current filters. Click an account to narrow the list."
        loads={drawerLoads}
        extraColumns={[
          { label: 'Pickup', render: l => <StatusBadge status={(l as ComputedLoad).onTimePickup} />, csv: l => (l as ComputedLoad).onTimePickup },
          { label: 'Delivery', render: l => <StatusBadge status={(l as ComputedLoad).onTimeDelivery} hidden={(l as ComputedLoad).hiddenLate} />, csv: l => (l as ComputedLoad).onTimeDelivery },
          { label: 'Date moved', render: l => <MovedCell load={l as ComputedLoad} /> },
          { label: 'Late by', align: 'right', render: l => (l.minutesLate ? formatDuration(l.minutesLate) : '—'), csv: l => l.minutesLate },
        ]}
      />
    </div>
  );
}

function Chips({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${value === o.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MetricCard({ label, value, sub, tone, onClick, secondary }: {
  label: string; value: string; sub: string; tone: 'good' | 'warn' | 'bad' | 'neutral';
  onClick?: () => void;
  /** Optional second link inside the card, e.g. "12 late" on an on-time card. */
  secondary?: { label: string; onClick: () => void };
}) {
  const color = tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'bad' ? 'text-destructive' : 'text-foreground';
  return (
    <Card className={onClick ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''} onClick={onClick}>
      <CardContent className="p-4 text-center">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1.5 font-mono ${color}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
        {secondary && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); secondary.onClick(); }}
            className="text-[11px] text-destructive underline underline-offset-2 mt-0.5"
          >
            View {secondary.label}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, hidden }: { status: string; hidden?: boolean }) {
  const variant = status === 'On Time' ? 'default' : status === 'Late' ? 'destructive' : status === 'Excluded' ? 'outline' : 'secondary';
  return <Badge variant={variant} className="text-xs whitespace-nowrap">{hidden ? 'Late (hidden)' : status}</Badge>;
}

const REASON_LABEL: Record<string, string> = { customer: 'Customer', shipper_delay: 'Shipper delay', carrier: 'Carrier' };

function MovedCell({ load }: { load: ComputedLoad }) {
  if (!load.deliveryRescheduled || !load.rescheduleReason) return <span className="text-muted-foreground">—</span>;
  const h = load.appointmentShiftHours;
  const shift = h == null ? '' : ` ${h > 0 ? '+' : ''}${Math.abs(h) >= 24 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(0)}h`}`;
  return <span>{REASON_LABEL[load.rescheduleReason]}{shift}</span>;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${(minutes / 60 / 24).toFixed(1)}d`;
}
