import { useState, useCallback, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Package, BarChart3, AlertCircle, X } from 'lucide-react';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge, DataWarnings } from '@/components/DataTrust';
import type { TrustLevel } from '@/components/DataTrust';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import InteractiveRankTable from '@/components/InteractiveRankTable';
import ComparisonRankTable, { ComparisonRow } from '@/components/ComparisonRankTable';
import BusinessIntelligence from '@/components/BusinessIntelligence';
import { finRev, finCost, DATA_QUALITY_CHECKS, getDataQualityLoads, type DataQualityIssue } from '@/lib/computeLoads';
import LoadListDrawer from '@/components/LoadListDrawer';
import { aggregate, groupBy, shipDate, teamOf, ownerOf, customerOf, matchesFocus, minRankLoads, VIEW_MODE_HELP, type Focus } from '@/lib/filters';
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
  const { loads, prevLoads, compWindow, rawLoads, dataQuality, comparisonMode, viewMode, filters } = useData();
  const [dashFilter, setDashFilter] = useState<Focus>(null);

  // A row click (customer / broker / lane) filters EVERY section on this page, including
  // Business Intelligence below — before, only the KPIs and charts followed it.
  const filteredLoads = useMemo(() => (dashFilter ? loads.filter(l => matchesFocus(l, dashFilter)) : loads), [loads, dashFilter]);
  const filteredPrevLoads = useMemo(() => (dashFilter ? prevLoads.filter(l => matchesFocus(l, dashFilter)) : prevLoads), [prevLoads, dashFilter]);

  const cur = aggregate(filteredLoads);
  const totalLoads = cur.loads, totalRevenue = cur.revenue, totalProfit = cur.profit, avgMargin = cur.margin;

  // Comparison period KPI metrics
  const prevPeriodMetrics = useMemo(() => {
        if (filteredPrevLoads.length === 0) return null;
    const a = aggregate(filteredPrevLoads);
    const modeLabel = comparisonMode === 'yoy' ? 'YoY' : 'vs prior';
    return { revenue: a.revenue, profit: a.profit, margin: a.margin, loads: a.loads, modeLabel };
  }, [filteredPrevLoads, comparisonMode]);

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
      e.loads++; e.revenue += finRev(l); e.cost += finCost(l);
      curMap.set(k, e);
    });
    const prevMap = new Map<string, { loads: number; revenue: number; cost: number }>();
    prevData.forEach(l => {
      const k = keyFnPrev(l);
      const e = prevMap.get(k) || { loads: 0, revenue: 0, cost: 0 };
      e.loads++; e.revenue += finRev(l); e.cost += finCost(l);
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
    SHOW_BROKER_COMPARISON && hasPrev ? buildComparisonRows(ownerOf, ownerOf, loads, prevLoads) : [],
    [hasPrev, loads, prevLoads, buildComparisonRows]);

  const compLanes = useMemo(() =>
    hasPrev ? buildComparisonRows(l => l.lane, l => l.lane, loads, prevLoads) : [],
  [hasPrev, loads, prevLoads, buildComparisonRows]);

  // Revenue trend
  const trendData = [...groupBy(filteredLoads.filter(l => shipDate(l)), l => shipDate(l)).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, ls]) => {
      const a = aggregate(ls);
      return { date: formatUSShortDate(date), revenue: a.revenue, profit: a.profit, margin: a.finRevenue > 0 ? a.margin : null };
    });
  const trendMaxRevenue = Math.max(0, ...trendData.map(t => t.revenue));
  const trendMinProfit = Math.min(0, ...trendData.map(t => t.profit));
  const trendAxisMin = trendMinProfit < -0.05 * trendMaxRevenue ? 'auto' : 0;

  // Team breakdown (team only, no broker fallback)
  const teamData = [...groupBy(filteredLoads, l => teamOf(l)).entries()]
    .map(([name, ls]) => { const a = aggregate(ls); return { name, loads: a.loads, revenue: a.revenue, profit: a.profit, margin: a.margin }; })
    .sort((a, b) => b.revenue - a.revenue);
  // Start the axis at $0 unless a team has a meaningfully negative profit; a tiny loss
  // (e.g. -$169) made Recharts pick a "nice" floor of about -$1M.
  const teamMaxRevenue = Math.max(0, ...teamData.map(t => t.revenue));
  const teamMinProfit = Math.min(0, ...teamData.map(t => t.profit));
  const teamAxisMin = teamMinProfit < -0.05 * teamMaxRevenue ? 'auto' : 0;

   // Brokers: the broker on the load (ownerOf), loads with none go to "Unassigned" so the
  // table can always add up to the total. Same rule as the owner filter and Productivity.
  const minLoads = minRankLoads(filters.dateRange);
  const rankBy = (keyFn: (l: typeof loads[0]) => string) => {
    const all = [...groupBy(loads, keyFn).entries()]
      .map(([name, ls]) => { const a = aggregate(ls); return { name, loads: a.loads, revenue: a.finRevenue, cost: a.cost, profit: a.profit, margin: a.margin, hasAnyCost: a.finLoads > 0 }; });
    const rows = all.filter(r => r.loads >= minLoads && r.revenue > 0 && r.hasAnyCost);
    const shownLoads = rows.reduce((s, r) => s + r.loads, 0);
    const note = shownLoads === loads.length
      ? `All ${loads.length} loads included.`
      : `${shownLoads} of ${loads.length} loads included — ${all.length - rows.length} with fewer than ${minLoads} loads or no carrier cost are hidden.`;
    return { rows, note };
  };

  const qualifiedCust = rankBy(customerOf);
  const qualifiedBrokers = rankBy(ownerOf);
  const qualifiedLanes = rankBy(l => l.lane);
  const rankEmpty = (what: string) =>
    loads.length === 0 ? 'No loads in this period' : `No ${what} with ${minLoads}+ loads and carrier cost in this period`;

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
            <InfoTip text={VIEW_MODE_HELP} className="ml-1 align-text-bottom" />
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
                <YAxis yAxisId="usd" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} domain={[trendAxisMin, 'auto']} allowDataOverflow={trendAxisMin === 0} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} />
                <Tooltip formatter={(v: number, name: string) => [name === 'Margin %' ? `${v.toFixed(1)}%` : fmt(v), name]} />
                <Line yAxisId="usd" type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(220,70%,45%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="usd" type="monotone" dataKey="profit" name="Profit" stroke="hsl(170,60%,42%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="pct" type="monotone" dataKey="margin" name="Margin %" stroke="hsl(35,90%,50%)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
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
                <Tooltip formatter={(v: number, name: string, item) =>
                  name === 'Profit' ? [`${fmt(v)} (${item.payload.margin.toFixed(1)}% margin)`, name] : [fmt(v), name]} />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(220,70%,45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="hsl(170,60%,42%)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="margin" position="top" fontSize={10} formatter={(v: number) => `${v.toFixed(1)}%`} />
                </Bar>
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
        <InteractiveRankTable title="Top Lanes by Profit" data={qualifiedLanes.rows} footnote={qualifiedLanes.note} emptyMessage={rankEmpty('lanes')} defaultSort="profit" defaultDir="desc" onRowClick={handleRowClick('lane')} selectedRow={dashFilter?.type === 'lane' ? dashFilter.value : null} />
        <InteractiveRankTable title="Bottom Lanes by Margin %" data={qualifiedLanes.rows} footnote={qualifiedLanes.note} emptyMessage={rankEmpty('lanes')} defaultSort="margin" defaultDir="asc" highlight="margin" onRowClick={handleRowClick('lane')} selectedRow={dashFilter?.type === 'lane' ? dashFilter.value : null} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InteractiveRankTable title="Top Brokers by Profit" data={qualifiedBrokers.rows} footnote={qualifiedBrokers.note} emptyMessage={rankEmpty('brokers')} defaultSort="profit" defaultDir="desc" onRowClick={handleRowClick('broker')} selectedRow={dashFilter?.type === 'broker' ? dashFilter.value : null} />
        <InteractiveRankTable title="Bottom Brokers by Margin %" data={qualifiedBrokers.rows} footnote={qualifiedBrokers.note} emptyMessage={rankEmpty('brokers')} defaultSort="margin" defaultDir="asc" highlight="margin" onRowClick={handleRowClick('broker')} selectedRow={dashFilter?.type === 'broker' ? dashFilter.value : null} />
      </div>

      <InteractiveRankTable title="Top Customers by Profit" data={qualifiedCust.rows} footnote={qualifiedCust.note} emptyMessage={rankEmpty('customers')} defaultSort="profit" defaultDir="desc" onRowClick={handleRowClick('customer')} selectedRow={dashFilter?.type === 'customer' ? dashFilter.value : null} />

      <LoadListDrawer
        open={dqIssue != null}
        onOpenChange={o => { if (!o) setDqIssue(null); }}
        title={dqIssue ? DATA_QUALITY_CHECKS[dqIssue].label : ''}
        description={dqIssue ? `${DATA_QUALITY_CHECKS[dqIssue].fix} Fixed loads drop off after the next Turvo sync.` : undefined}
        loads={dqLoads}
        highlightMissingFinancials
      />

      {/* Business Intelligence Layer */}

        <BusinessIntelligence loads={filteredLoads} prevLoads={filteredPrevLoads} />
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
