import { useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingDown, Target, AlertTriangle } from 'lucide-react';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Load } from '@/types/loads';

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};
const delta = (cur: number, prev: number) => {
  if (prev === 0) return { abs: cur, pct: 0, label: 'N/A' };
  const d = cur - prev;
  const p = (d / prev) * 100;
  return { abs: d, pct: p, label: `${d >= 0 ? '+' : ''}${p.toFixed(1)}%` };
};

const FLOOR_TARGET = 8;
const STRETCH_TARGET = 12;

interface PeriodAgg {
  loads: Load[];
  totalLoads: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  avgCost: number;
}

function aggregatePeriod(loads: Load[]): PeriodAgg {
  const revenue = loads.reduce((s, l) => s + (l.revenue || 0), 0);
  const cost = loads.reduce((s, l) => s + (l.carrierCost || 0), 0);
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const avgCost = loads.length > 0 ? cost / loads.length : 0;
  return { loads, totalLoads: loads.length, revenue, cost, profit, margin, avgCost };
}

function getPrevDateRange(
  start: string, end: string, mode: string, dataMin: string, dataMax: string
): { prevStart: string; prevEnd: string } | null {
  let prevStart: string, prevEnd: string;
  if (mode === 'yoy') {
    const s = new Date(start); const e = new Date(end);
    s.setFullYear(s.getFullYear() - 1); e.setFullYear(e.getFullYear() - 1);
    prevStart = s.toISOString().slice(0, 10); prevEnd = e.toISOString().slice(0, 10);
  } else {
    // Prior period: same-length window
    const dur = new Date(end).getTime() - new Date(start).getTime();
    if (dur <= 0) return null;
    prevStart = new Date(new Date(start).getTime() - dur).toISOString().slice(0, 10);
    prevEnd = start;
  }
  if (prevEnd <= dataMin || prevStart >= dataMax) return null;
  if (prevStart < dataMin) prevStart = dataMin;
  return { prevStart, prevEnd };
}

interface LaneComparison {
  name: string;
  loads: number;
  avgCostCur: number;
  avgCostPrev: number;
  costDelta: number;
  costDeltaPct: number;
  revenueCur: number;
  costCur: number;
  marginCur: number;
  marginPrev: number;
  marginDelta: number;
  avgRevenue: number;
  avgCost: number;
  avgProfit: number;
  avgMargin: number;
  quoteFloor: number;
  quoteStretch: number;
  actions: string[];
}

export default function BusinessIntelligence() {
  const { rawLoads, filters, comparisonMode } = useData();

  const data = useMemo(() => {
    const { start, end } = filters.dateRange;
    if (!start || !end) return null;

    let dataMin = 'zzzz', dataMax = '';
    rawLoads.forEach(l => {
      const d = (l.pickupDate || l.deliveryDate)?.slice(0, 10);
      if (!d) return;
      if (d < dataMin) dataMin = d;
      if (d > dataMax) dataMax = d;
    });

    const filterBase = (l: Load) => {
      if (filters.team !== 'all' && l.team !== filters.team) return false;
      if (filters.equipmentType !== 'all' && l.equipmentType !== filters.equipmentType) return false;
      return true;
    };
    const curLoads = rawLoads.filter(l => {
      if (!filterBase(l)) return false;
      const d = (l.pickupDate || l.deliveryDate)?.slice(0, 10);
      if (!d) return false;
      return d >= start && d <= end;
    });

    const prev = getPrevDateRange(start, end, comparisonMode, dataMin, dataMax);
    const prevLoads = prev ? rawLoads.filter(l => {
      if (!filterBase(l)) return false;
      const d = (l.pickupDate || l.deliveryDate)?.slice(0, 10);
      if (!d) return false;
      return d >= prev.prevStart && d < prev.prevEnd;
    }) : [];

    const cur = aggregatePeriod(curLoads);
    const prv = aggregatePeriod(prevLoads);

    const laneKey = (l: Load) =>
      `${l.originCity || '?'}, ${l.originState || '?'} → ${l.destinationCity || '?'}, ${l.destinationState || '?'}`;

    const curByLane = new Map<string, Load[]>();
    curLoads.forEach(l => {
      const k = laneKey(l);
      (curByLane.get(k) || (curByLane.set(k, []), curByLane.get(k)!)).push(l);
    });
    const prevByLane = new Map<string, Load[]>();
    prevLoads.forEach(l => {
      const k = laneKey(l);
      (prevByLane.get(k) || (prevByLane.set(k, []), prevByLane.get(k)!)).push(l);
    });

    const lanes: LaneComparison[] = [];
    const allLaneKeys = new Set([...curByLane.keys(), ...prevByLane.keys()]);
    allLaneKeys.forEach(name => {
      const cl = curByLane.get(name) || [];
      const pl = prevByLane.get(name) || [];
      // Include lane if it has at least 1 load in either period
      if (cl.length === 0 && pl.length === 0) return;

      const cRev = cl.reduce((s, l) => s + (l.revenue || 0), 0);
      const cCost = cl.reduce((s, l) => s + (l.carrierCost || 0), 0);
      const pRev = pl.reduce((s, l) => s + (l.revenue || 0), 0);
      const pCost = pl.reduce((s, l) => s + (l.carrierCost || 0), 0);

      const marginCur = cRev > 0 ? ((cRev - cCost) / cRev) * 100 : 0;
      const marginPrev = pRev > 0 ? ((pRev - pCost) / pRev) * 100 : 0;
      const avgCostCur = cl.length > 0 ? cCost / cl.length : 0;
      const avgCostPrev = pl.length > 0 ? pCost / pl.length : 0;
      const costD = delta(avgCostCur, avgCostPrev);

      const avgRevenue = cRev / cl.length;
      const avgCost = cCost / cl.length;
      const avgProfit = avgRevenue - avgCost;
      const avgMargin = avgRevenue > 0 ? (avgProfit / avgRevenue) * 100 : 0;
      const quoteFloor = avgCost / (1 - FLOOR_TARGET / 100);
      const quoteStretch = avgCost / (1 - STRETCH_TARGET / 100);

      const actions: string[] = [];
      if (costD.abs > 0 && pl.length > 0) actions.push('Recruit carriers');
      if (marginCur < marginPrev && pl.length > 0) actions.push('Renegotiate buy rates');
      if (marginCur < FLOOR_TARGET) actions.push('Raise quote target');

      lanes.push({
        name, loads: cl.length,
        avgCostCur, avgCostPrev, costDelta: costD.abs, costDeltaPct: costD.pct,
        revenueCur: cRev, costCur: cCost, marginCur, marginPrev, marginDelta: marginCur - marginPrev,
        avgRevenue, avgCost, avgProfit, avgMargin, quoteFloor, quoteStretch, actions,
      });
    });

    const loadsDelta = delta(cur.totalLoads, prv.totalLoads);
    const revDelta = delta(cur.revenue, prv.revenue);
    const profitDelta = delta(cur.profit, prv.profit);
    const marginDelta = { abs: cur.margin - prv.margin, pct: 0, label: '' };
    const costDelta = delta(cur.avgCost, prv.avgCost);

    const interpretations: string[] = [];
    if (prv.totalLoads > 0) {
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
      cur, prv, lanes, interpretations, modeLabel,
      loadsDelta, revDelta, profitDelta, marginDelta, costDelta,
      hasPrev: prv.totalLoads > 0,
    };
  }, [rawLoads, filters, comparisonMode]);

  if (!data) return null;

  const { cur, prv, lanes, interpretations, modeLabel, hasPrev } = data;

  const costMovement = [...lanes].filter(l => l.avgCostPrev > 0 || l.avgCostCur > 0).sort((a, b) => b.costDelta - a.costDelta).slice(0, 10);
  const marginCompression = [...lanes].filter(l => l.marginPrev !== 0 || l.marginCur !== 0).sort((a, b) => a.marginDelta - b.marginDelta).slice(0, 10);
  const quoteGuidance = [...lanes].filter(l => l.loads > 0).sort((a, b) => b.loads - a.loads).slice(0, 15);
  const actionNeeded = lanes.filter(l => l.actions.length > 0 && (l.loads >= 10 || (l.loads === 0 && (l.avgCostPrev > 0)))).sort((a, b) => a.marginCur - b.marginCur).slice(0, 15);

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
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
            <HealthMetric label="Loads" current={cur.totalLoads.toString()} delta={hasPrev ? data.loadsDelta : null} isCount />
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
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">No comparison data available</TableCell></TableRow>
                  )}
                  {costMovement.map(l => (
                    <TableRow key={l.name} className="even:bg-muted/30">
                      <TableCell className="text-xs font-medium max-w-[200px] truncate" title={l.name}>{l.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{l.loads}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(l.avgCostCur)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(l.avgCostPrev)}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${colorCls(l.costDelta, true)}`}>
                        {l.costDelta >= 0 ? '+' : ''}{fmt(l.costDelta)}
                      </TableCell>
                      <TableCell className={`text-xs text-right font-mono ${colorCls(l.costDeltaPct, true)}`}>
                        {l.costDeltaPct >= 0 ? '+' : ''}{l.costDeltaPct.toFixed(1)}%
                      </TableCell>
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
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">No comparison data available</TableCell></TableRow>
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

        {/* Quote Guidance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Quote Guidance
              <span className="text-[10px] text-muted-foreground font-normal ml-1">Floor {FLOOR_TARGET}% · Stretch {STRETCH_TARGET}%</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Lane</TableHead>
                    <TableHead className="text-xs text-right">Avg Rev</TableHead>
                    <TableHead className="text-xs text-right">Avg Cost</TableHead>
                    <TableHead className="text-xs text-right">Avg Margin</TableHead>
                    <TableHead className="text-xs text-right">Quote Floor</TableHead>
                    <TableHead className="text-xs text-right">Quote Stretch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteGuidance.map(l => (
                    <TableRow key={l.name} className="even:bg-muted/30">
                      <TableCell className="text-xs font-medium max-w-[200px] truncate" title={l.name}>{l.name}</TableCell>
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
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionNeeded.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-8">No actions flagged</TableCell></TableRow>
                  )}
                  {actionNeeded.map(l => (
                    <TableRow key={l.name} className="even:bg-muted/30">
                      <TableCell className="text-xs font-medium max-w-[200px] truncate" title={l.name}>{l.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{l.loads}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${l.marginCur < FLOOR_TARGET ? 'text-destructive' : 'text-warning'}`}>
                        {pct(l.marginCur)}
                      </TableCell>
                      <TableCell className={`text-xs text-right font-mono ${colorCls(l.marginDelta)}`}>
                        {l.marginDelta >= 0 ? '+' : ''}{l.marginDelta.toFixed(1)}pp
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
