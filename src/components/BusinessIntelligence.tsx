import { useMemo } from 'react';
import { useData } from '@/context/DataContext';
import type { ComputedLoad } from '@/types/loads';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingDown, Target, AlertTriangle } from 'lucide-react';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { laneOf } from '@/lib/computeLoads';
import { aggregate, groupBy, daysInRange, minRankLoads, businessToday } from '@/lib/filters';
import { formatUSDate } from '@/lib/dates';
import { buildLaneVolatility, FLOOR_TARGET, STRETCH_TARGET } from '@/lib/laneVolatility';

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};
const delta = (cur: number, prev: number) => {
  if (prev === 0) return { abs: cur, pct: 0, label: 'N/A' };
  const d = cur - prev;
  const p = (d / prev) * 100;
  return { abs: d, pct: p, label: `${d >= 0 ? '+' : ''}${p.toFixed(1)}%` };
};

interface LaneComparison {
  name: string;
  loads: number;
  loadsPrev: number;
  avgCostCur: number;
  avgCostPrev: number;
  /** null = no loads in the prior period, so there is nothing to compare (shown as "New"). */
  costDelta: number | null;
  costDeltaPct: number | null;
  revenueCur: number;
  costCur: number;
  marginCur: number;
  marginPrev: number;
  marginDelta: number;
  actions: string[];
  /** Carrier on this lane with the lowest margin this period (ties: more late deliveries). */
  worstCarrier: { name: string; loads: number; margin: number; late: number } | null;
}

/** Worst carrier on a lane: lowest margin among carriers with financials, then most late deliveries. */
export function worstCarrierOn(ls: ComputedLoad[]): LaneComparison['worstCarrier'] {
  const byCarrier = groupBy(ls.filter(l => l.carrierName?.trim()), l => l.carrierName!.trim());
  let worst: LaneComparison['worstCarrier'] = null;
  for (const [name, cl] of byCarrier) {
    const a = aggregate(cl);
    if (a.finLoads === 0) continue;
    const late = cl.filter(l => l.onTimeDelivery === 'Late').length;
    if (!worst || a.margin < worst.margin || (a.margin === worst.margin && late > worst.late)) {
      worst = { name, loads: cl.length, margin: a.margin, late };
    }
  }
  return worst;
}

interface BusinessIntelligenceProps {
  /** Loads for the current / comparison period. Defaults to the global filtered loads; the
   *  Executive Overview passes its row-click-filtered loads so this section follows them too. */
  loads?: ComputedLoad[];
  prevLoads?: ComputedLoad[];
}

export default function BusinessIntelligence(props: BusinessIntelligenceProps = {}) {
  const ctx = useData();
  const { compWindow, filters, comparisonMode } = ctx;
  const loads = props.loads ?? ctx.loads;
  const prevLoads = props.prevLoads ?? ctx.prevLoads;
  const data = useMemo(() => {
    const curLoads = loads;
    const cur = aggregate(curLoads);
    const prv = aggregate(prevLoads);

    const curByLane = groupBy(curLoads, l => laneOf(l));
    const prevByLane = groupBy(prevLoads, l => laneOf(l));

    const lanes: LaneComparison[] = [];
    const allLaneKeys = new Set([...curByLane.keys(), ...prevByLane.keys()]);
    allLaneKeys.forEach(name => {
      const cl = curByLane.get(name) || [];
      const pl = prevByLane.get(name) || [];
      // Include lane if it has at least 1 load in either period
      if (cl.length === 0 && pl.length === 0) return;

      const c = aggregate(cl), p = aggregate(pl);
      const marginCur = c.margin, marginPrev = p.margin, avgCostCur = c.avgCost, avgCostPrev = p.avgCost;
      const costD = delta(avgCostCur, avgCostPrev);
      const comparable = cl.length > 0 && pl.length > 0;

      // Only lanes moving freight now get actions — a lane with 0 current loads has no
      // current margin, so it used to read as 0.0% and falsely trigger every alert.
      const actions: string[] = [];
      if (comparable && costD.abs > 0) actions.push('Recruit carriers');
      if (comparable && marginCur < marginPrev) actions.push('Renegotiate buy rates');
      if (cl.length > 0 && marginCur < FLOOR_TARGET) actions.push('Raise quote target');

      lanes.push({
        name, loads: cl.length, loadsPrev: pl.length,
        avgCostCur, avgCostPrev,
        costDelta: comparable ? costD.abs : null, costDeltaPct: comparable ? costD.pct : null,
        revenueCur: c.revenue, costCur: c.cost, marginCur, marginPrev, marginDelta: marginCur - marginPrev,
        actions,
        worstCarrier: cl.length > 0 ? worstCarrierOn(cl) : null,
      });
    });

    const loadsDelta = delta(cur.loads, prv.loads);
    const revDelta = delta(cur.revenue, prv.revenue);
    const profitDelta = delta(cur.profit, prv.profit);
    const marginDelta = { abs: cur.margin - prv.margin, pct: 0, label: '' };
    const costDelta = delta(cur.avgCost, prv.avgCost);

    const interpretations: string[] = [];
    if (prv.loads > 0) {
      const volDir = Math.abs(loadsDelta.pct) < 2 ? 'flat' : loadsDelta.pct > 0 ? `up ${Math.abs(loadsDelta.pct).toFixed(0)}%` : `down ${Math.abs(loadsDelta.pct).toFixed(0)}%`;
      const marginDir = Math.abs(marginDelta.abs) < 0.5 ? 'stable' : marginDelta.abs > 0 ? `up ${marginDelta.abs.toFixed(1)} pts` : `down ${Math.abs(marginDelta.abs).toFixed(1)} pts`;
      interpretations.push(`Volume ${volDir}, margin ${marginDir}`);
      if (Math.abs(costDelta.pct) >= 2) {
        interpretations.push(`Carrier cost ${costDelta.pct > 0 ? 'up' : 'down'} ${Math.abs(costDelta.pct).toFixed(0)}%`);
      }
      if (Math.abs(revDelta.pct) < 2 && costDelta.pct > 3) {
        interpretations.push('Revenue flat, carrier cost rising — margin pressure');
      }
    }

    const modeLabel = comparisonMode === 'yoy' ? 'YoY' : 'vs prior';

    return {
      cur, prv, lanes, interpretations, modeLabel, curLoads,
      loadsDelta, revDelta, profitDelta, marginDelta, costDelta,
      hasPrev: prv.loads > 0,
    };
  }, [loads, prevLoads, comparisonMode]);
  const laneVolatility = useMemo(() => (data ? buildLaneVolatility(data.curLoads) : []), [data]);

  if (!data) return null;

  const { cur, prv, lanes, interpretations, modeLabel, hasPrev } = data;

  // Lanes with current loads only; lanes new this period (no prior loads) sort after real comparisons and show "New".
  const costMovement = [...lanes]
    .filter(l => l.loads > 0)
    .sort((a, b) => (b.costDelta ?? -Infinity) - (a.costDelta ?? -Infinity) || b.loads - a.loads);

  // Margin compression needs a margin in both periods.
  const MIN_COMPRESSION_LOADS = 3;
  // Only lanes whose margin actually went DOWN. Before, it took the 10 lowest changes, so on
  // short ranges lanes whose margin rose were listed as "compression" (and the rest were cut off).
  const marginCompression = [...lanes]
    .filter(l => l.loads >= MIN_COMPRESSION_LOADS && l.loadsPrev >= MIN_COMPRESSION_LOADS && l.marginDelta < 0)
    .sort((a, b) => a.marginDelta - b.marginDelta);
  // Same scaling as the rank tables: a fixed 10 left this empty on short ranges.
  const minActionLoads = filters.owner === 'all' ? minRankLoads(filters.dateRange) : Math.min(3, minRankLoads(filters.dateRange));
  const actionNeeded = lanes.filter(l => l.actions.length > 0 && l.loads >= minActionLoads).sort((a, b) => a.marginCur - b.marginCur).slice(0, 15);

  const colorCls = (v: number, invert = false) => {
    const positive = invert ? v < 0 : v > 0;
    return Math.abs(v) < 0.01 ? 'text-muted-foreground' : positive ? 'text-success' : 'text-destructive';
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Business Intelligence
        </h3>
        <p className="text-muted-foreground text-xs mt-1">Comparison mode: {modeLabel}</p>
      </div>

      {/* Business Health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Business Health</CardTitle>
          <p className="text-xs text-muted-foreground">
            {formatUSDate(filters.dateRange.start)} – {formatUSDate(filters.dateRange.end)} ({daysInRange(filters.dateRange)} days)
            {hasPrev && compWindow.range && <> · vs {formatUSDate(compWindow.range.start)} – {formatUSDate(compWindow.range.end)}</>}
          </p>
            {filters.dateRange.end >= businessToday() && (
            <p className="text-xs text-warning mt-1">
              This range includes today or later. Those loads usually have no carrier cost yet, so margin can read high — end the range yesterday for final numbers (RPT-08).
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
            <HealthMetric label="Loads" current={cur.loads.toString()} delta={hasPrev ? data.loadsDelta : null} isCount />
            <HealthMetric label="Revenue" current={fmtCompact(cur.revenue)} delta={hasPrev ? data.revDelta : null} />
            <HealthMetric label="Profit" current={fmtCompact(cur.profit)} delta={hasPrev ? data.profitDelta : null} />
            <HealthMetric label="Margin %" current={pct(cur.margin)} delta={hasPrev ? { abs: data.marginDelta.abs, pct: 0, label: '' } : null} isMargin />
            <HealthMetric label="Avg Carrier Cost" current={fmt(cur.avgCost)} delta={hasPrev ? data.costDelta : null} invertColor />
          </div>
          {interpretations.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              {interpretations.map((t, i) => (
                <p key={i} className="text-sm text-foreground font-medium">💡 {t}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Carrier Cost Movement */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-destructive" />
              Carrier Cost Movement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Lane</TableHead>
                    <TableHead className="text-xs text-right">Loads</TableHead>
                    <TableHead className="text-xs text-right">Avg Cost Cur</TableHead>
                    <TableHead className="text-xs text-right">Avg Cost Prev</TableHead>
                    <TableHead className="text-xs text-right">Δ $</TableHead>
                    <TableHead className="text-xs text-right">Δ %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costMovement.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">  {cur.loads === 0 ? 'No loads in this period' : 'No comparison data available'}</TableCell></TableRow>
                  )}
                  {costMovement.map(l => (
                    <TableRow key={l.name} className="even:bg-muted/30">
                      <TableCell className="text-xs font-medium max-w-[200px] truncate" title={l.name}>{l.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{l.loads}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(l.avgCostCur)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{l.loadsPrev > 0 ? fmt(l.avgCostPrev) : '—'}</TableCell>
                      {l.costDelta == null || l.costDeltaPct == null ? (
                        <TableCell colSpan={2} className="text-xs text-right text-muted-foreground" title="No loads on this lane in the comparison period">New</TableCell>
                      ) : (
                        <>
                          <TableCell className={`text-xs text-right font-mono ${colorCls(l.costDelta, true)}`}>
                            {l.costDelta >= 0 ? '+' : ''}{fmt(l.costDelta)}
                          </TableCell>
                          <TableCell className={`text-xs text-right font-mono ${colorCls(l.costDeltaPct, true)}`}>
                            {l.costDeltaPct >= 0 ? '+' : ''}{l.costDeltaPct.toFixed(1)}%
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Margin Compression */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-warning" />
              Margin Compression
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Lane</TableHead>
                    <TableHead className="text-xs text-right">Loads</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-xs text-right">Margin Cur</TableHead>
                    <TableHead className="text-xs text-right">Margin Prev</TableHead>
                    <TableHead className="text-xs text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginCompression.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">  {!hasPrev ? 'No comparison period data' : `No lane with ${MIN_COMPRESSION_LOADS}+ loads in both periods lost margin`}</TableCell></TableRow>
                  )}
                  {marginCompression.map(l => (
                    <TableRow key={l.name} className="even:bg-muted/30">
                      <TableCell className="text-xs font-medium max-w-[200px] truncate" title={l.name}>{l.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{l.loads}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(l.revenueCur)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{pct(l.marginCur)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{pct(l.marginPrev)}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${colorCls(l.marginDelta)}`}>
                        {l.marginDelta >= 0 ? '+' : ''}{l.marginDelta.toFixed(1)}pp
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

       {/* Lane Volatility (was "Quote Guidance") — scoped to one account owner's own customers/lanes */}
        <Card>
          <CardHeader className="pb-2 space-y-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Lane Volatility
              <span className="text-[10px] text-muted-foreground font-normal ml-1">Floor {FLOOR_TARGET}% · Stretch {STRETCH_TARGET}%</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Lane</TableHead>
                    <TableHead className="text-xs text-right">Loads</TableHead>
                    <TableHead className="text-xs text-right">Avg Rev</TableHead>
                    <TableHead className="text-xs text-right">Avg Cost</TableHead>
                    <TableHead className="text-xs text-right">Avg Margin</TableHead>
                    <TableHead className="text-xs text-right">Quote Floor</TableHead>
                    <TableHead className="text-xs text-right">Quote Stretch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {laneVolatility.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-8">
                      {'No loads in this period'}
                    </TableCell></TableRow>
                  )}
                  {laneVolatility.map(l => (
                    <TableRow key={l.name} className="even:bg-muted/30">
                      <TableCell className="text-xs font-medium max-w-[200px] truncate" title={l.name}>{l.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{l.loads}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(l.avgRevenue)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(l.avgCost)}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${l.avgMargin < FLOOR_TARGET ? 'text-destructive' : l.avgMargin < STRETCH_TARGET ? 'text-warning' : 'text-success'}`}>
                        {pct(l.avgMargin)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{fmt(l.quoteFloor)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-primary font-semibold">{fmt(l.quoteStretch)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Carrier Action Needed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Carrier Action Needed
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Lane</TableHead>
                    <TableHead className="text-xs text-right">Loads</TableHead>
                    <TableHead className="text-xs text-right">Margin %</TableHead>
                    <TableHead className="text-xs text-right">Margin Δ</TableHead>
                    <TableHead className="text-xs">Worst carrier</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionNeeded.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">  {`No actions flagged on lanes with ${minActionLoads}+ loads`}</TableCell></TableRow>
                  )}
                  {actionNeeded.map(l => (
                    <TableRow key={l.name} className="even:bg-muted/30">
                      <TableCell className="text-xs font-medium max-w-[200px] truncate" title={l.name}>{l.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{l.loads}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${l.marginCur < FLOOR_TARGET ? 'text-destructive' : 'text-warning'}`}>
                        {pct(l.marginCur)}
                      </TableCell>
                      <TableCell className={`text-xs text-right font-mono ${l.loadsPrev > 0 ? colorCls(l.marginDelta) : 'text-muted-foreground'}`}>
                        {l.loadsPrev > 0 ? `${l.marginDelta >= 0 ? '+' : ''}${l.marginDelta.toFixed(1)}pp` : 'New'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.worstCarrier ? (
                          <div className="max-w-[180px]">
                            <div className="font-medium truncate" title={l.worstCarrier.name}>{l.worstCarrier.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {l.worstCarrier.loads} load{l.worstCarrier.loads === 1 ? '' : 's'} · <span className={l.worstCarrier.margin < FLOOR_TARGET ? 'text-destructive' : ''}>{pct(l.worstCarrier.margin)}</span>
                              {l.worstCarrier.late > 0 && <> · <span className="text-destructive">{l.worstCarrier.late} late</span></>}
                            </div>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {l.actions.map(a => (
                            <span key={a} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive">
                              {a}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthMetric({ label, current, delta: d, isCount, isMargin, invertColor }: {
  label: string;
  current: string;
  delta: { abs: number; pct: number; label: string } | null;
  isCount?: boolean;
  isMargin?: boolean;
  invertColor?: boolean;
}) {
  let changeEl: React.ReactNode = null;
  if (d) {
    const positive = invertColor ? d.abs < 0 : d.abs > 0;
    const neutral = Math.abs(d.abs) < 0.01;
    const cls = neutral ? 'text-muted-foreground' : positive ? 'text-success' : 'text-destructive';
    const arrow = d.abs > 0 ? '↑' : d.abs < 0 ? '↓' : '–';
    const formatted = isMargin
      ? `${Math.abs(d.abs).toFixed(1)}pp`
      : isCount
      ? Math.abs(d.abs).toString()
      : fmtCompact(Math.abs(d.abs));
    changeEl = (
      <p className={`text-xs font-medium mt-0.5 ${cls}`}>
        {arrow} {d.abs >= 0 ? '+' : '-'}{formatted}
        {!isMargin && d.pct !== 0 ? ` / ${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(0)}%` : ''}
      </p>
    );
  }
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold font-mono mt-0.5">{current}</p>
      {changeEl}
    </div>
  );
}
