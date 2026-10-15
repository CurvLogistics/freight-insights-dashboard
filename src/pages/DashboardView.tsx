import { useState, useCallback, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Package, BarChart3, AlertCircle, X } from 'lucide-react';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge, DataWarnings } from '@/components/DataTrust';
import type { TrustLevel } from '@/components/DataTrust';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import InteractiveRankTable from '@/components/InteractiveRankTable';
import ComparisonRankTable, { ComparisonRow } from '@/components/ComparisonRankTable';
import BusinessIntelligence from '@/components/BusinessIntelligence';
import { computeLoad, isActiveLoad, DATA_QUALITY_CHECKS, getDataQualityLoads, type DataQualityIssue } from '@/lib/computeLoads';
import LoadListDrawer from '@/components/LoadListDrawer';
import { getComparisonWindow, inRange } from '@/lib/comparison';
import { formatUSShortDate } from '@/lib/dates';

const fmt = (n?: number) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const pct = (n?: number) => n != null ? `${n.toFixed(1)}%` : '—';
const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const SHOW_BROKER_COMPARISON = false;

export default function DashboardView() {
  const { loads, rawLoads, dataQuality, filters, comparisonMode, viewMode } = useData();
  const [dashFilter, setDashFilter] = useState<{ type: 'customer' | 'broker' | 'lane'; value: string } | null>(null);

  const filteredLoads = dashFilter
    ? loads.filter(l => {
        if (dashFilter.type === 'customer') return (l.customerName || 'Unknown') === dashFilter.value;
        if (dashFilter.type === 'broker') return (l.broker || 'Unassigned') === dashFilter.value;
        if (dashFilter.type === 'lane') return l.lane === dashFilter.value;
        return true;
      })
    : loads;

  const totalLoads = filteredLoads.length;
  const totalRevenue = filteredLoads.reduce((s, l) => s + (l.revenue || 0), 0);
  const totalCost = filteredLoads.reduce((s, l) => s + (l.carrierCost || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Dataset date boundaries
  // Comparison window (prior period or same period last year) + whether we have data for it
  const compWindow = useMemo(
    () => getComparisonWindow(filters.dateRange, comparisonMode, rawLoads),
    [filters.dateRange, comparisonMode, rawLoads],
  );

  // Prev period loads (computed, filtered same as current). Empty when the window isn't fully synced.
  const prevLoads = useMemo(() => {
    if (!compWindow.covered || !compWindow.range) return [];
    const range = compWindow.range;
    return rawLoads.filter(l => {
      if (!isActiveLoad(l)) return false;
      if (filters.team !== 'all' && l.team !== filters.team) return false;
      if (filters.equipmentType !== 'all' && l.equipmentType !== filters.equipmentType) return false;
      return inRange(l, range);
    }).map(computeLoad).filter(l => viewMode === 'booked' || l.simpleStatus === 'Locked');
  }, [rawLoads, compWindow, filters.team, filters.equipmentType, viewMode]);

  // Comparison period KPI metrics
  const prevPeriodMetrics = useMemo(() => {
    if (prevLoads.length === 0) return null;
    let prev = prevLoads;
    if (dashFilter) {
      prev = prev.filter(l => {
        if (dashFilter.type === 'customer') return (l.customerName || 'Unknown') === dashFilter.value;
        if (dashFilter.type === 'broker') return (l.broker || 'Unassigned') === dashFilter.value;
        if (dashFilter.type === 'lane') return l.lane === dashFilter.value;
        return true;
      });
    }
    if (prev.length === 0) return null;
    const revenue = prev.reduce((s, l) => s + (l.revenue || 0), 0);
    const cost = prev.reduce((s, l) => s + (l.carrierCost || 0), 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const modeLabel = comparisonMode === 'yoy' ? 'YoY' : 'vs prior';
    return { revenue, profit, margin, loads: prev.length, modeLabel };
  }, [prevLoads, dashFilter, comparisonMode]);

  // Build comparison rows for entities
  const buildComparisonRows = useCallback((
    keyFnCur: (l: typeof loads[0]) => string,
    keyFnPrev: (l: typeof prevLoads[0]) => string,
    curData: typeof loads,
    prevData: typeof prevLoads,
  ): ComparisonRow[] => {
    const curMap = new Map<string, { loads: number; revenue: number; cost: number }>();
    curData.forEach(l => {
      const k = keyFnCur(l);
      const e = curMap.get(k) || { loads: 0, revenue: 0, cost: 0 };
      e.loads++; e.revenue += l.revenue || 0; e.cost += l.carrierCost || 0;
      curMap.set(k, e);
    });
    const prevMap = new Map<string, { loads: number; revenue: number; cost: number }>();
    prevData.forEach(l => {
      const k = keyFnPrev(l);
      const e = prevMap.get(k) || { loads: 0, revenue: 0, cost: 0 };
      e.loads++; e.revenue += l.revenue || 0; e.cost += l.carrierCost || 0;
      prevMap.set(k, e);
    });

    const allKeys = new Set([...curMap.keys(), ...prevMap.keys()]);
    const rows: ComparisonRow[] = [];
    allKeys.forEach(name => {
      const c = curMap.get(name) || { loads: 0, revenue: 0, cost: 0 };
      const p = prevMap.get(name) || { loads: 0, revenue: 0, cost: 0 };
      const profitCur = c.revenue - c.cost;
      const profitPrev = p.revenue - p.cost;
      const marginCur = c.revenue > 0 ? (profitCur / c.revenue) * 100 : 0;
      const marginPrev = p.revenue > 0 ? (profitPrev / p.revenue) * 100 : 0;
      rows.push({
        name,
        loadsCur: c.loads, loadsPrev: p.loads,
        revenueCur: c.revenue, revenuePrev: p.revenue,
        profitCur, profitPrev,
        marginCur, marginPrev,
      });
    });
    return rows;
  }, []);

  const hasPrev = prevLoads.length > 0;

  const compBrokers = useMemo(() =>
    SHOW_BROKER_COMPARISON && hasPrev ? buildComparisonRows(l => l.broker || 'Unassigned', l => l.broker || 'Unassigned', loads, prevLoads) : [],
    [hasPrev, loads, prevLoads, buildComparisonRows]);

  const compLanes = useMemo(() =>
    hasPrev ? buildComparisonRows(l => l.lane, l => l.lane, loads, prevLoads) : [],
  [hasPrev, loads, prevLoads, buildComparisonRows]);

  // Revenue trend
  const trendMap = new Map<string, { revenue: number; profit: number }>();
  filteredLoads.forEach(l => {
    const d = (l.pickupDate || l.deliveryDate || '')?.slice(0, 10);
    if (!d) return;
    const entry = trendMap.get(d) || { revenue: 0, profit: 0 };
    entry.revenue += l.revenue || 0;
    entry.profit += (l.grossProfit || 0);
    trendMap.set(d, entry);
  });
  const trendData = [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date: formatUSShortDate(date), ...v }));

  // Team breakdown
  const teamMap = new Map<string, { loads: number; revenue: number; profit: number }>();
  filteredLoads.forEach(l => {
    const t = l.team || l.broker || 'Unassigned';
    const e = teamMap.get(t) || { loads: 0, revenue: 0, profit: 0 };
    e.loads++;
    e.revenue += l.revenue || 0;
    e.profit += (l.revenue || 0) - (l.carrierCost || 0);
    teamMap.set(t, e);
  });
  const teamData = [...teamMap.entries()].map(([name, v]) => ({ name, ...v }));
  // Start the axis at $0 unless a team has a meaningfully negative profit; a tiny loss
  // (e.g. -$169) made Recharts pick a "nice" floor of about -$1M.
  const teamMaxRevenue = Math.max(0, ...teamData.map(t => t.revenue));
  const teamMinProfit = Math.min(0, ...teamData.map(t => t.profit));
  const teamAxisMin = teamMinProfit < -0.05 * teamMaxRevenue ? 'auto' : 0;

  const hasCompleteFinancials = (l: { revenue: number; hasAnyCost: boolean }) =>
    l.revenue > 0 && l.hasAnyCost;

  const aggregate = (keyFn: (l: typeof loads[0]) => string) => {
    const map = new Map<string, { loads: number; revenue: number; cost: number; hasAnyCost: boolean }>();
    loads.forEach(l => {
      const k = keyFn(l);
      const e = map.get(k) || { loads: 0, revenue: 0, cost: 0, hasAnyCost: false };
      e.loads++;
      e.revenue += l.revenue || 0;
      if (l.carrierCost != null) { e.cost += l.carrierCost; e.hasAnyCost = true; }
      map.set(k, e);
    });
    return [...map.entries()].map(([name, v]) => {
      const profit = v.revenue - v.cost;
      const margin = v.revenue > 0 ? (profit / v.revenue) * 100 : 0;
      return { name, loads: v.loads, revenue: v.revenue, cost: v.cost, profit, margin, hasAnyCost: v.hasAnyCost };
    }).filter(r => r.loads >= 10 && hasCompleteFinancials(r));
  };

  const qualifiedCust = aggregate(l => l.customerName || 'Unknown');
  const qualifiedBrokers = aggregate(l => l.broker || 'Unassigned');
  const qualifiedLanes = aggregate(l => l.lane);

  const handleRowClick = useCallback((type: 'customer' | 'broker' | 'lane') => (name: string) => {
    setDashFilter(prev => prev?.type === type && prev.value === name ? null : { type, value: name });
  }, []);

  const dq = dataQuality;
   const qualityItems = (Object.keys(DATA_QUALITY_CHECKS) as DataQualityIssue[]).map(key => {
    const value = dq[key];
    return { key, label: DATA_QUALITY_CHECKS[key].label, value, pct: dq.totalLoads ? (value / dq.totalLoads) * 100 : 0 };
  });
  const [dqIssue, setDqIssue] = useState<DataQualityIssue | null>(null);
  const dqLoads = useMemo(() => (dqIssue ? getDataQualityLoads(rawLoads, dqIssue) : []), [rawLoads, dqIssue]);

  const compLabel = comparisonMode === 'yoy' ? 'YoY' : 'Prior Period';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Executive Overview</h2>
            <DataTrustBadge
              level={(() => {
                const missPct = dq.totalLoads > 0 ? ((dq.missingRevenue + dq.missingCarrierCost) / (dq.totalLoads * 2)) * 100 : 0;
                if (missPct === 0) return 'verified' as TrustLevel;
                if (missPct < 10) return 'partial' as TrustLevel;
                return 'incomplete' as TrustLevel;
              })()}
              tooltip={dq.missingRevenue + dq.missingCarrierCost === 0
                ? 'All loads have revenue and cost data'
                : `${dq.missingRevenue} loads missing revenue, ${dq.missingCarrierCost} missing cost`}
            />
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {totalLoads} loads · {viewMode === 'locked' ? 'Locked only' : 'All booked'}
          </p>
        </div>
        {dashFilter && (
          <button
            onClick={() => setDashFilter(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Filtered by {dashFilter.type}: {dashFilter.value}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {!compWindow.covered && compWindow.reason && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 border rounded-md px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" />
          <span>No {compLabel} comparison: {compWindow.reason}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Total Loads in Dataset"
          value={dq.totalLoads.toLocaleString('en-US')}
          icon={Package}
          color="primary"
          tip={`Active loads, all dates. Excludes ${(rawLoads.length - dq.totalLoads).toLocaleString('en-US')} canceled/draft loads (${rawLoads.length.toLocaleString('en-US')} synced in total) — same base as Data Quality.`}
        />
        <KPICard title="Filtered Loads" value={totalLoads.toString()} icon={Package} color="primary"
          comparison={prevPeriodMetrics ? { current: totalLoads, previous: prevPeriodMetrics.loads } : undefined} isCount compLabel={prevPeriodMetrics?.modeLabel} />
        <KPICard title="Total Revenue" value={fmt(totalRevenue)} icon={DollarSign} color="primary"
          comparison={prevPeriodMetrics ? { current: totalRevenue, previous: prevPeriodMetrics.revenue } : undefined} compLabel={prevPeriodMetrics?.modeLabel} />
        <KPICard title="Gross Profit" value={fmt(totalProfit)} icon={totalProfit >= 0 ? TrendingUp : TrendingDown} color="accent"
          comparison={prevPeriodMetrics ? { current: totalProfit, previous: prevPeriodMetrics.profit } : undefined} compLabel={prevPeriodMetrics?.modeLabel}
          tip="Revenue minus carrier cost" />
        <KPICard title="Margin %" value={pct(avgMargin)} icon={BarChart3} color="accent"
          comparison={prevPeriodMetrics ? { current: avgMargin, previous: prevPeriodMetrics.margin } : undefined} isMargin compLabel={prevPeriodMetrics?.modeLabel}
          tip="Gross profit as a percentage of revenue" />
      </div>

      {/* Data Quality */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-warning" />
                   Data Quality
            <InfoTip text="Canceled and draft loads are excluded. Click a number to see the loads and fix them in Turvo." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {qualityItems.map(q => (
              <button
                key={q.key}
                type="button"
                onClick={() => setDqIssue(q.key)}
                title={q.value > 0 ? `Show the ${q.value} loads` : 'All loads complete'}
                className="text-center rounded-lg p-2 hover:bg-muted/60 transition-colors"
              >
                <div className={`text-2xl font-bold font-mono ${q.pct > 20 ? 'text-destructive' : q.value > 0 ? 'text-warning' : 'text-success'}`}>
                  {q.value > 0 && q.pct < 1 ? '<1' : q.pct.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">{q.label}</div>
                <div className={`text-xs ${q.value > 0 ? 'text-primary underline underline-offset-2' : 'text-muted-foreground'}`}>{q.value} of {dq.totalLoads}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Revenue & Profit Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(220,70%,45%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit" stroke="hsl(170,60%,42%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Revenue by Team</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={teamData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,90%)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} domain={[teamAxisMin, 'auto']} allowDataOverflow={teamAxisMin === 0} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="revenue" fill="hsl(220,70%,45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="hsl(170,60%,42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Tables (when prior period data exists) */}
      {hasPrev && (
        <>
          <h3 className="text-lg font-bold mt-2">Period Comparison — {compLabel}</h3>
            {SHOW_BROKER_COMPARISON && <ComparisonRankTable title={`Broker Comparison (${compLabel})`} data={compBrokers} onRowClick={handleRowClick('broker')} selectedRow={dashFilter?.type === 'broker' ? dashFilter.value : null} />}
          <ComparisonRankTable title={`Lane Comparison (${compLabel})`} data={compLanes} onRowClick={handleRowClick('lane')} selectedRow={dashFilter?.type === 'lane' ? dashFilter.value : null} />
        </>
      )}

      {/* Current-period rank tables (always shown) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InteractiveRankTable title="Top Lanes by Profit" data={qualifiedLanes} defaultSort="profit" defaultDir="desc" onRowClick={handleRowClick('lane')} selectedRow={dashFilter?.type === 'lane' ? dashFilter.value : null} />
        <InteractiveRankTable title="Bottom Lanes by Margin %" data={qualifiedLanes} defaultSort="margin" defaultDir="asc" highlight="margin" onRowClick={handleRowClick('lane')} selectedRow={dashFilter?.type === 'lane' ? dashFilter.value : null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InteractiveRankTable title="Top Brokers by Profit" data={qualifiedBrokers} defaultSort="profit" defaultDir="desc" onRowClick={handleRowClick('broker')} selectedRow={dashFilter?.type === 'broker' ? dashFilter.value : null} />
        <InteractiveRankTable title="Bottom Brokers by Margin %" data={qualifiedBrokers} defaultSort="margin" defaultDir="asc" highlight="margin" onRowClick={handleRowClick('broker')} selectedRow={dashFilter?.type === 'broker' ? dashFilter.value : null} />
      </div>

      <InteractiveRankTable title="Top Customers by Profit" data={qualifiedCust} defaultSort="profit" defaultDir="desc" onRowClick={handleRowClick('customer')} selectedRow={dashFilter?.type === 'customer' ? dashFilter.value : null} />

      <LoadListDrawer
        open={dqIssue != null}
        onOpenChange={o => { if (!o) setDqIssue(null); }}
        title={dqIssue ? DATA_QUALITY_CHECKS[dqIssue].label : ''}
        description={dqIssue ? `${DATA_QUALITY_CHECKS[dqIssue].fix} Fixed loads drop off after the next Turvo sync.` : undefined}
        loads={dqLoads}
        highlightMissingFinancials
      />

      {/* Business Intelligence Layer */}

      <BusinessIntelligence />
    </div>
  );
}

interface KPICardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  comparison?: { current: number; previous: number };
  isMargin?: boolean;
  isCount?: boolean;
  compLabel?: string;
  tip?: string;
}

function KPICard({ title, value, icon: Icon, color, comparison, isMargin, isCount, compLabel = 'vs prior', tip }: KPICardProps) {
  let changeEl: React.ReactNode = null;
  if (comparison && comparison.previous > 0) {
    const diff = comparison.current - comparison.previous;
    const pctChange = (diff / comparison.previous) * 100;
    const isPositive = diff > 0;
    const isNeutral = diff === 0;
    const colorClass = isNeutral ? 'text-muted-foreground' : isPositive ? 'text-success' : 'text-destructive';
    const arrow = isPositive ? '↑' : isNeutral ? '–' : '↓';
    const absFmt = isMargin ? `${Math.abs(diff).toFixed(1)}pp` : isCount ? Math.abs(diff).toString() : fmtCompact(Math.abs(diff));
    changeEl = (
      <p className={`text-xs font-medium mt-1 ${colorClass}`}>
        {arrow} {isPositive ? '+' : diff < 0 ? '-' : ''}{absFmt} / {isPositive ? '+' : ''}{pctChange.toFixed(0)}% {compLabel}
      </p>
    );
  } else if (comparison && comparison.previous === 0 && comparison.current > 0) {
    changeEl = <p className="text-xs font-medium mt-1 text-muted-foreground">No prior period data</p>;
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">{title}{tip && <InfoTip text={tip} />}</p>
            <p className="text-2xl font-bold mt-1 font-mono">{value}</p>
            {changeEl}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color === 'accent' ? 'bg-accent/10' : 'bg-primary/10'}`}>
            <Icon className={`w-5 h-5 ${color === 'accent' ? 'text-accent' : 'text-primary'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
