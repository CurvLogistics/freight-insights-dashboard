import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, FileText, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { ComputedLoad } from '@/types/loads';
import { DataTrustBadge, DataWarnings } from '@/components/DataTrust';

/* ── Weekly trend helpers ── */
const REF_DATE = new Date('2026-04-02');

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const mon = new Date(d);
  mon.setUTCDate(mon.getUTCDate() - ((day + 6) % 7)); // Monday
  return mon.toISOString().slice(0, 10);
}

function buildWeekBuckets(numWeeks: number): string[] {
  const buckets: string[] = [];
  const cur = new Date(REF_DATE);
  const day = cur.getUTCDay();
  const mon = new Date(cur);
  mon.setUTCDate(mon.getUTCDate() - ((day + 6) % 7));
  for (let i = 0; i < numWeeks; i++) {
    const w = new Date(mon);
    w.setUTCDate(w.getUTCDate() - i * 7);
    buckets.unshift(w.toISOString().slice(0, 10));
  }
  return buckets;
}

const WEEK_BUCKETS = buildWeekBuckets(8);

interface WeeklyTrend {
  weeks: { weekStart: string; loads: number }[];
  consistency: 'High' | 'Medium' | 'Low';
  dropOff: boolean;
}

function computeWeeklyTrend(shipDates: string[]): WeeklyTrend {
  const counts = new Map<string, number>();
  WEEK_BUCKETS.forEach(w => counts.set(w, 0));
  shipDates.forEach(d => {
    const wk = getWeekKey(d);
    if (counts.has(wk)) counts.set(wk, (counts.get(wk) || 0) + 1);
  });
  const weeks = WEEK_BUCKETS.map(w => ({ weekStart: w, loads: counts.get(w) || 0 }));

  const vals = weeks.map(w => w.loads);
  const nonZero = vals.filter(v => v > 0);
  const zeroWeeks = vals.filter(v => v === 0).length;
  const avg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / vals.length : 0;
  const variance = vals.length > 0 ? vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length : 0;
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 999;

  let consistency: 'High' | 'Medium' | 'Low';
  if (zeroWeeks <= 1 && cv < 0.5) consistency = 'High';
  else if (zeroWeeks <= 3 && cv < 1) consistency = 'Medium';
  else consistency = 'Low';

  // Drop-off: had volume in earlier half, little/none in recent 2 weeks
  const recentLoads = vals.slice(-2).reduce((a, b) => a + b, 0);
  const earlierLoads = vals.slice(0, -2).reduce((a, b) => a + b, 0);
  const dropOff = earlierLoads >= 4 && recentLoads <= 1;

  return { weeks, consistency, dropOff };
}

const fmt = (n?: number | null) => n != null ? `$${Math.round(n).toLocaleString()}` : '—';
const pct = (n?: number | null) => n != null ? `${n.toFixed(1)}%` : '—';
const fmtDelta = (n?: number | null) => {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
};
const fmtDeltaPct = (n?: number | null) => {
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};

const STATE_REGIONS: Record<string, string> = {
  CT: 'Northeast', ME: 'Northeast', MA: 'Northeast', NH: 'Northeast', RI: 'Northeast', VT: 'Northeast',
  NJ: 'Northeast', NY: 'Northeast', PA: 'Northeast',
  IL: 'Midwest', IN: 'Midwest', MI: 'Midwest', OH: 'Midwest', WI: 'Midwest',
  IA: 'Midwest', KS: 'Midwest', MN: 'Midwest', MO: 'Midwest', NE: 'Midwest', ND: 'Midwest', SD: 'Midwest',
  DE: 'Southeast', FL: 'Southeast', GA: 'Southeast', MD: 'Southeast', NC: 'Southeast', SC: 'Southeast', VA: 'Southeast', WV: 'Southeast',
  AL: 'Southeast', KY: 'Southeast', MS: 'Southeast', TN: 'Southeast', AR: 'Southeast', LA: 'Southeast', DC: 'Southeast',
  AZ: 'West', CO: 'West', ID: 'West', MT: 'West', NV: 'West', NM: 'West', UT: 'West', WY: 'West',
  AK: 'West', CA: 'West', HI: 'West', OR: 'West', WA: 'West',
  TX: 'South Central', OK: 'South Central',
};

function getRegion(state?: string): string {
  if (!state) return 'Unknown';
  return STATE_REGIONS[state.toUpperCase().trim()] || 'Other';
}

type SortKey = 'name' | 'loads' | 'revenue' | 'cost' | 'avgCost' | 'margin' | 'otp' | 'otd' | 'grade' | 'late' | 'activeLanes';
type SortDir = 'asc' | 'desc';
type LaneSortKey = 'lane' | 'loads' | 'avgCost' | 'otd';

interface CarrierRow {
  name: string;
  loads: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  avgCost: number;
  otpPct: number | null;
  otdPct: number | null;
  latePickup: number;
  lateDelivery: number;
  activeLanes: number;
  grade: 'A' | 'B' | 'C';
  flags: string[];
  lanes: { lane: string; loads: number; avgCost: number; otdPct: number | null; lastShipDate: string }[];
  lastShipDate: string;
  costDelta: number | null;
  costDeltaPct: number | null;
  regions: string[];
  unpaidAmount: number;
  avgDaysToPay: number | null;
  weeklyTrend: WeeklyTrend;
}

function getGrade(otpPct: number | null): 'A' | 'B' | 'C' {
  if (otpPct == null || otpPct < 90) return 'C';
  if (otpPct >= 95) return 'A';
  return 'B';
}

function gradeBg(g: 'A' | 'B' | 'C') {
  if (g === 'A') return 'bg-success/10 text-success border-success/20';
  if (g === 'B') return 'bg-warning/10 text-warning border-warning/20';
  return 'bg-destructive/10 text-destructive border-destructive/20';
}

function buildLaneAvgCosts(loads: ComputedLoad[]) {
  const map = new Map<string, { cost: number; count: number }>();
  loads.forEach(l => {
    if (l.carrierCost == null) return;
    const e = map.get(l.lane) || { cost: 0, count: 0 };
    e.cost += l.carrierCost;
    e.count++;
    map.set(l.lane, e);
  });
  const result = new Map<string, number>();
  map.forEach((v, k) => { if (v.count > 0) result.set(k, v.cost / v.count); });
  return result;
}

export default function CarrierScorecardView() {
  const { loads } = useData();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('loads');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [minLoads, setMinLoads] = useState(3);
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null);
  const [laneSortKey, setLaneSortKey] = useState<LaneSortKey>('loads');
  const [laneSortDir, setLaneSortDir] = useState<SortDir>('desc');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [shareView, setShareView] = useState(false);

  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    loads.forEach(l => {
      const or = getRegion(l.originState);
      const dr = getRegion(l.destinationState);
      if (or !== 'Unknown' && or !== 'Other') regions.add(or);
      if (dr !== 'Unknown' && dr !== 'Other') regions.add(dr);
    });
    return [...regions].sort();
  }, [loads]);

  const regionLoads = useMemo(() => {
    if (regionFilter === 'all') return loads;
    return loads.filter(l => {
      const or = getRegion(l.originState);
      const dr = getRegion(l.destinationState);
      return or === regionFilter || dr === regionFilter;
    });
  }, [loads, regionFilter]);

  const regionLaneAvgCosts = useMemo(() => buildLaneAvgCosts(regionLoads), [regionLoads]);

  const carriers = useMemo(() => {
    const carrierMap = new Map<string, {
      name: string; loads: number; revenue: number; cost: number;
      onTimePickup: number; knownPickup: number; onTimeDelivery: number; knownDelivery: number;
      latePickup: number; lateDelivery: number;
      activeLanes: Set<string>;
      laneLoads: Map<string, { loads: number; cost: number; revenue: number; otd: number; knownOtd: number; lastShipDate: string }>;
      lastShipDate: string; regions: Set<string>;
      unpaidAmount: number; payDays: number[];
      shipDates: string[];
    }>();

    regionLoads.forEach(l => {
      const key = (l.carrierName || 'Unknown').trim().toUpperCase();
      let e = carrierMap.get(key);
      if (!e) {
        e = {
          name: l.carrierName || 'Unknown',
          loads: 0, revenue: 0, cost: 0,
          onTimePickup: 0, knownPickup: 0, onTimeDelivery: 0, knownDelivery: 0,
          latePickup: 0, lateDelivery: 0,
          activeLanes: new Set(), laneLoads: new Map(),
          lastShipDate: '', regions: new Set(),
          unpaidAmount: 0, payDays: [], shipDates: [],
        };
        carrierMap.set(key, e);
      }
      e.loads++;
      if (l.revenue != null) e.revenue += l.revenue;
      if (l.carrierCost != null) e.cost += l.carrierCost;

      if (l.onTimePickup === 'On Time') { e.onTimePickup++; e.knownPickup++; }
      else if (l.onTimePickup === 'Late') { e.latePickup++; e.knownPickup++; }
      if (l.onTimeDelivery === 'On Time') { e.onTimeDelivery++; e.knownDelivery++; }
      else if (l.onTimeDelivery === 'Late') { e.lateDelivery++; e.knownDelivery++; }

      if (l.lane && l.lane !== 'Unknown') {
        e.activeLanes.add(l.lane);
        const le = e.laneLoads.get(l.lane) || { loads: 0, cost: 0, revenue: 0, otd: 0, knownOtd: 0, lastShipDate: '' };
        le.loads++;
        if (l.carrierCost != null) le.cost += l.carrierCost;
        if (l.revenue != null) le.revenue += l.revenue;
        if (l.onTimeDelivery === 'On Time') { le.otd++; le.knownOtd++; }
        else if (l.onTimeDelivery === 'Late') { le.knownOtd++; }
        const ld = l.pickupDate || l.deliveryDate || '';
        if (ld > le.lastShipDate) le.lastShipDate = ld;
        e.laneLoads.set(l.lane, le);
      }

      const or = getRegion(l.originState);
      const dr = getRegion(l.destinationState);
      if (or !== 'Unknown' && or !== 'Other') e.regions.add(or);
      if (dr !== 'Unknown' && dr !== 'Other') e.regions.add(dr);

      const shipDate = l.pickupDate || l.deliveryDate || '';
      if (shipDate) e.shipDates.push(shipDate);
      if (shipDate > e.lastShipDate) e.lastShipDate = shipDate;

      // Unpaid: has cost but no invoiceSentDate
      if (l.carrierCost != null && !l.readyToBillDate) {
        e.unpaidAmount += l.carrierCost;
      }
      // Payment days: readyToBillDate to invoiceSentDate
      if (l.readyToBillDate && l.invoiceSentDate) {
        const d1 = new Date(l.readyToBillDate);
        const d2 = new Date(l.invoiceSentDate);
        const days = Math.round((d2.getTime() - d1.getTime()) / 86400000);
        if (days >= 0) e.payDays.push(days);
      }
    });

    const rows: CarrierRow[] = [];
    carrierMap.forEach(e => {
      const profit = e.revenue - e.cost;
      const margin = e.revenue > 0 ? (profit / e.revenue) * 100 : 0;
      const avgCost = e.loads > 0 ? e.cost / e.loads : 0;
      const otpPct = e.knownPickup > 0 ? (e.onTimePickup / e.knownPickup) * 100 : null;
      const otdPct = e.knownDelivery > 0 ? (e.onTimeDelivery / e.knownDelivery) * 100 : null;
      const grade = getGrade(otpPct);

      let totalCostDelta = 0, totalLaneLoads = 0;
      e.laneLoads.forEach((lv, laneName) => {
        const laneAvg = regionLaneAvgCosts.get(laneName);
        if (laneAvg != null && lv.loads > 0) {
          totalCostDelta += ((lv.cost / lv.loads) - laneAvg) * lv.loads;
          totalLaneLoads += lv.loads;
        }
      });
      const costDelta = totalLaneLoads > 0 ? totalCostDelta / totalLaneLoads : null;
      const costDeltaPct = costDelta != null && avgCost > 0 ? (costDelta / avgCost) * 100 : null;

      const flags: string[] = [];
      const wt = computeWeeklyTrend(e.shipDates);
      if (otpPct != null && otpPct < 90) flags.push('Low Reliability');
      if (costDelta != null && costDelta > 0 && costDeltaPct != null && costDeltaPct > 5) flags.push('Cost Above Market');
      if (margin < 10) flags.push('Low Margin');
      if (wt.dropOff) flags.push('Volume Drop-off');

      const lanes: CarrierRow['lanes'] = [];
      e.laneLoads.forEach((lv, laneName) => {
        lanes.push({ lane: laneName, loads: lv.loads, avgCost: lv.loads > 0 ? lv.cost / lv.loads : 0, otdPct: lv.knownOtd > 0 ? (lv.otd / lv.knownOtd) * 100 : null, lastShipDate: lv.lastShipDate });
      });
      lanes.sort((a, b) => b.loads - a.loads);

      const avgDaysToPay = e.payDays.length > 0 ? e.payDays.reduce((a, b) => a + b, 0) / e.payDays.length : null;

      rows.push({
        name: e.name, loads: e.loads, revenue: e.revenue, cost: e.cost,
        profit, margin, avgCost, otpPct, otdPct,
        latePickup: e.latePickup, lateDelivery: e.lateDelivery,
        activeLanes: e.activeLanes.size, grade, flags, lanes,
        lastShipDate: e.lastShipDate, costDelta, costDeltaPct,
        regions: [...e.regions],
        unpaidAmount: e.unpaidAmount, avgDaysToPay,
        weeklyTrend: wt,
      });
    });
    return rows;
  }, [regionLoads, regionLaneAvgCosts]);

  const filtered = useMemo(() => {
    let result = carriers.filter(c => c.loads >= minLoads);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(s));
    }
    if (flagFilter !== 'all') result = result.filter(c => c.flags.includes(flagFilter));
    return result;
  }, [carriers, search, minLoads, flagFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: number | string, bv: number | string;
      switch (sortKey) {
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'loads': av = a.loads; bv = b.loads; break;
        case 'revenue': av = a.revenue; bv = b.revenue; break;
        case 'cost': av = a.cost; bv = b.cost; break;
        case 'avgCost': av = a.avgCost; bv = b.avgCost; break;
        case 'margin': av = a.margin; bv = b.margin; break;
        case 'otp': av = a.otpPct ?? -1; bv = b.otpPct ?? -1; break;
        case 'otd': av = a.otdPct ?? -1; bv = b.otdPct ?? -1; break;
        case 'grade': av = a.grade; bv = b.grade; break;
        case 'late': av = a.lateDelivery; bv = b.lateDelivery; break;
        case 'activeLanes': av = a.activeLanes; bv = b.activeLanes; break;
        default: av = a.loads; bv = b.loads;
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { loads: 0, revenue: 0, cost: 0, carriers: 0, lanes: new Set<string>() };
    carriers.forEach(c => {
      t.loads += c.loads; t.revenue += c.revenue; t.cost += c.cost; t.carriers++;
      c.lanes.forEach(l => t.lanes.add(l.lane));
    });
    const avgCost = t.loads > 0 ? t.cost / t.loads : 0;
    const margin = t.revenue > 0 ? ((t.revenue - t.cost) / t.revenue) * 100 : 0;
    return { ...t, avgCost, margin, activeLanes: t.lanes.size };
  }, [carriers]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };
  const handleLaneSort = (key: LaneSortKey) => {
    if (laneSortKey === key) setLaneSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setLaneSortKey(key); setLaneSortDir(key === 'lane' ? 'asc' : 'desc'); }
  };

  const allFlags = ['Low Reliability', 'Cost Above Market', 'Low Margin', 'Volume Drop-off'];

  // Columns visible per view mode
  const internalCols = !shareView;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Carrier Scorecard</h2>
          <DataTrustBadge level="partial" tooltip="OTP/OTD requires timestamp data. Cost vs Market compares against historical loads on similar lanes." />
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          {totals.carriers} carriers · {totals.loads.toLocaleString()} loads
          {regionFilter !== 'all' && <span className="ml-1 text-primary">· {regionFilter} region</span>}
        </p>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShareView(false)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!shareView ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
        >
          <Eye className="w-3.5 h-3.5" /> Internal View
        </button>
        <button
          onClick={() => setShareView(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${shareView ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
        >
          <EyeOff className="w-3.5 h-3.5" /> Carrier View
        </button>
      </div>

      {shareView && (
        <div className="bg-primary/5 border border-primary/20 rounded-md px-4 py-2 text-xs text-primary">
          Carrier view active — revenue, profit, and margin are hidden. Safe to screenshot and share.
        </div>
      )}

      {/* KPI Bar */}
      <div className={`grid grid-cols-2 gap-3 ${shareView ? 'md:grid-cols-4' : 'md:grid-cols-6'}`}>
        <KPICard label="Total Loads" value={totals.loads.toLocaleString()} />
        <KPICard label="Total Spend" value={fmt(totals.cost)} emphasis />
        {!shareView && <KPICard label="Total Revenue" value={fmt(totals.revenue)} />}
        <KPICard label="Avg Cost / Load" value={fmt(totals.avgCost)} />
        {!shareView && <KPICard label="Avg Margin" value={pct(totals.margin)} good={totals.margin >= 15} />}
        <KPICard label="Active Lanes" value={totals.activeLanes.toString()} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search carriers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              <span>Min loads:</span>
              <Input type="number" min={1} value={minLoads} onChange={e => setMinLoads(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 h-8 text-sm font-mono" />
            </div>
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Region" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {availableRegions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {!shareView && (
              <Select value={flagFilter} onValueChange={setFlagFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Filter by flag" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Carriers</SelectItem>
                  {allFlags.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{sorted.length} of {carriers.length} carriers</span>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className={`w-full text-sm ${shareView ? 'min-w-[700px]' : 'min-w-[1200px]'}`}>
              <thead className="sticky top-0 z-10">
                <tr className="text-muted-foreground text-xs border-b bg-muted/30">
                  <SortTh k="name" label="Carrier" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  {!shareView && <SortTh k="grade" label="Grade" align="center" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="55px" />}
                  <SortTh k="loads" label="Loads" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="70px" />
                  <SortTh k="cost" label="Total Spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="110px" />
                  {!shareView && <SortTh k="activeLanes" label="Lanes" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="60px" />}
                  {!shareView && <SortTh k="avgCost" label="Avg Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="95px" />}
                  {!shareView && <SortTh k="margin" label="Margin" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="75px" />}
                  <SortTh k="otp" label="OTP %" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="70px" />
                  <SortTh k="otd" label="OTD %" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="70px" />
                  <SortTh k="late" label="Late" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="55px" />
                  {!shareView && <th className="px-4 py-3 text-right w-[95px]">Cost vs Mkt</th>}
                  {!shareView && <th className="px-4 py-3 text-left w-[160px]">Flags</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => {
                  const colSpan = shareView ? 7 : 12;
                  return (
                    <>
                      <tr
                        key={c.name}
                        className={`border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-muted/15' : ''} ${expandedCarrier === c.name ? 'bg-primary/5' : ''}`}
                        onClick={() => setExpandedCarrier(expandedCarrier === c.name ? null : c.name)}
                      >
                        <td className="px-4 py-3 font-medium text-xs">{c.name}</td>
                        {!shareView && (
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold border opacity-60 ${gradeBg(c.grade)}`}>{c.grade}</span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-mono">{c.loads}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(c.cost)}</td>
                        {!shareView && <td className="px-4 py-3 text-right font-mono">{c.activeLanes}</td>}
                        {!shareView && <td className="px-4 py-3 text-right font-mono">{fmt(c.avgCost)}</td>}
                        {!shareView && (
                          <td className={`px-4 py-3 text-right font-mono font-medium ${c.margin >= 15 ? 'text-success' : c.margin >= 10 ? 'text-warning' : 'text-destructive'}`}>{pct(c.margin)}</td>
                        )}
                        <td className={`px-4 py-3 text-right font-mono font-medium ${c.otpPct == null ? 'text-muted-foreground' : c.otpPct >= 95 ? 'text-success' : c.otpPct >= 90 ? 'text-warning' : 'text-destructive'}`}>
                          {c.otpPct != null ? `${c.otpPct.toFixed(0)}%` : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-medium ${c.otdPct == null ? 'text-muted-foreground' : c.otdPct >= 95 ? 'text-success' : c.otdPct >= 90 ? 'text-warning' : 'text-destructive'}`}>
                          {c.otdPct != null ? `${c.otdPct.toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-destructive">{c.lateDelivery}</td>
                        {!shareView && (
                          <td className={`px-4 py-3 text-right font-mono text-xs ${c.costDelta == null ? 'text-muted-foreground' : c.costDelta > 0 ? 'text-destructive' : 'text-success'}`}>
                            {c.costDelta != null ? <span>{fmtDelta(c.costDelta)} <span className="text-muted-foreground">({fmtDeltaPct(c.costDeltaPct)})</span></span> : '—'}
                          </td>
                        )}
                        {!shareView && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {c.flags.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                              {c.flags.map(f => (
                                <Badge key={f} variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                  f === 'Low Reliability' ? 'border-destructive/40 text-destructive' :
                                  f === 'Cost Above Market' ? 'border-warning/40 text-warning' :
                                  'border-muted-foreground/40 text-muted-foreground'
                                }`}>{f}</Badge>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                      {/* Expanded detail */}
                      {expandedCarrier === c.name && (
                        <tr key={`${c.name}-detail`} className="bg-muted/10">
                          <td colSpan={colSpan} className="px-6 py-4">
                            {shareView ? (
                              <ShareableDetail c={c} />
                            ) : (
                              <InternalDetail c={c} handleLaneSort={handleLaneSort} laneSortKey={laneSortKey} laneSortDir={laneSortDir} regionLaneAvgCosts={regionLaneAvgCosts} />
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Shareable (carrier-facing) expanded detail ── */
const TODAY_CARRIER = new Date('2026-04-02');

function ShareableDetail({ c }: { c: CarrierRow }) {
  const lastShipFmt = c.lastShipDate ? new Date(c.lastShipDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
  const daysSinceLast = c.lastShipDate ? Math.floor((TODAY_CARRIER.getTime() - new Date(c.lastShipDate + 'T00:00:00Z').getTime()) / 86400000) : null;

  const otpColor = (v: number | null) => v == null ? '' : v >= 95 ? 'text-green-600' : v >= 90 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="border border-border rounded-lg p-5 bg-card space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Carrier Performance Summary</span>
      </div>
      <div className="text-base font-bold">{c.name}</div>

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniCard label="Total Loads" value={c.loads.toLocaleString()} />
        <MiniCard label="Total Spend" value={fmt(c.cost)} emphasis />
        <MiniCard label="Avg Cost / Load" value={fmt(c.avgCost)} />
        <MiniCard label="Active Lanes" value={c.activeLanes.toString()} />
        <MiniCard label="Last Shipment" value={lastShipFmt} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <MiniCard label="Days Since Last Load" value={daysSinceLast != null ? `${daysSinceLast}d` : '—'} />
      </div>

      {/* Service Performance */}
      <div className="text-xs font-semibold text-muted-foreground">Service Performance</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-md px-3 py-2">
          <div className="text-[10px] text-muted-foreground">On-Time Pickup</div>
          <div className={`text-sm font-bold font-mono ${otpColor(c.otpPct)}`}>{c.otpPct != null ? `${c.otpPct.toFixed(1)}%` : 'N/A'}</div>
        </div>
        <div className="bg-card border border-border rounded-md px-3 py-2">
          <div className="text-[10px] text-muted-foreground">On-Time Delivery</div>
          <div className={`text-sm font-bold font-mono ${otpColor(c.otdPct)}`}>{c.otdPct != null ? `${c.otdPct.toFixed(1)}%` : 'N/A'}</div>
        </div>
        <MiniCard label="Claims" value="N/A" />
        <MiniCard label="Pickup Changes" value={c.loads > 0 ? `${((c.latePickup / c.loads) * 100).toFixed(1)}%` : '0%'} />
      </div>

      {/* Issue Breakdown */}
      <div className="text-xs font-semibold text-muted-foreground">Issue Breakdown</div>
      <div className="text-xs text-muted-foreground italic">No classified issues available for this carrier</div>

      {/* Top Lanes with activity status */}
      {c.lanes.length > 0 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground">Top Lanes ({Math.min(c.lanes.length, 5)})</div>
          <div className="space-y-2">
            {[...c.lanes].sort((a, b) => b.loads - a.loads).slice(0, 5).map(l => {
              const laneLastDate = l.lastShipDate ? new Date(l.lastShipDate + 'T00:00:00Z') : null;
              const laneDaysAgo = laneLastDate ? Math.floor((TODAY_CARRIER.getTime() - laneLastDate.getTime()) / 86400000) : null;
              const laneLastFmt = laneLastDate ? laneLastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
              const activityStatus = laneDaysAgo == null ? 'Unknown' : laneDaysAgo <= 7 ? 'Active' : laneDaysAgo <= 21 ? 'Cooling' : 'At Risk';
              const statusColor = activityStatus === 'Active' ? 'text-green-600 bg-green-500/10' : activityStatus === 'Cooling' ? 'text-yellow-600 bg-yellow-500/10' : activityStatus === 'At Risk' ? 'text-red-600 bg-red-500/10' : 'text-muted-foreground bg-muted/20';
              return (
                <div key={l.lane} className="rounded-md border border-border/40 px-3 py-2">
                  <div className="font-medium text-xs">{l.lane}</div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <span className="font-mono">{l.loads} loads</span>
                    <span>•</span>
                    <span>Last: {laneLastFmt}</span>
                    {laneDaysAgo != null && <><span>•</span><span>{laneDaysAgo}d ago</span></>}
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded-full font-semibold ${statusColor}`}>{activityStatus}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Internal expanded detail ── */
function InternalDetail({ c, handleLaneSort, laneSortKey, laneSortDir, regionLaneAvgCosts }: {
  c: CarrierRow; handleLaneSort: (k: LaneSortKey) => void; laneSortKey: LaneSortKey; laneSortDir: SortDir;
  regionLaneAvgCosts: Map<string, number>;
}) {
  const pickupChangePct = c.loads > 0 ? ((c.latePickup / c.loads) * 100).toFixed(1) : '0.0';
  const wt = c.weeklyTrend;
  const maxWeekLoads = Math.max(...wt.weeks.map(w => w.loads), 1);
  const consistencyColor = wt.consistency === 'High' ? 'text-success bg-success/10' : wt.consistency === 'Medium' ? 'text-warning bg-warning/10' : 'text-destructive bg-destructive/10';

  return (
    <div className="space-y-4">
      {/* Weekly Volume Trend + Consistency */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-muted-foreground">Weekly Volume (8 weeks)</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 font-semibold ${consistencyColor}`}>
              {wt.consistency} Consistency
            </Badge>
            {wt.dropOff && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-semibold text-destructive bg-destructive/10 border-destructive/30 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Drop-off
              </Badge>
            )}
          </div>
        </div>
        {wt.weeks.every(w => w.loads === 0) ? (
          <div className="text-xs text-muted-foreground italic py-2">Not enough data</div>
        ) : (
          <div className="flex items-end gap-1 h-16">
            {wt.weeks.map((w, i) => {
              const h = maxWeekLoads > 0 ? (w.loads / maxWeekLoads) * 100 : 0;
              const isRecent = i >= wt.weeks.length - 2;
              return (
                <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1" title={`Week of ${w.weekStart}: ${w.loads} loads`}>
                  <span className="text-[9px] font-mono text-muted-foreground">{w.loads || ''}</span>
                  <div
                    className={`w-full rounded-sm transition-all ${w.loads === 0 ? 'bg-muted/30' : isRecent && wt.dropOff ? 'bg-destructive/60' : 'bg-primary/60'}`}
                    style={{ height: `${Math.max(h, 4)}%`, minHeight: '2px' }}
                  />
                  <span className="text-[8px] text-muted-foreground">{new Date(w.weekStart + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Financial + operational cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <MiniCard label="Revenue" value={fmt(c.revenue)} />
        <MiniCard label="Total Spend" value={fmt(c.cost)} emphasis />
        <MiniCard label="Profit" value={fmt(c.profit)} good={c.profit > 0} />
        <MiniCard label="Cost vs Market" value={c.costDelta != null ? fmtDelta(c.costDelta) : '—'} />
        <MiniCard label="Cash Outstanding" value={c.unpaidAmount > 0 ? fmt(c.unpaidAmount) : '—'} />
        <MiniCard label="Last Shipment" value={c.lastShipDate ? new Date(c.lastShipDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—'} />
      </div>

      {/* Claims + Payment row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniCard label="Pickup Changes" value={`${c.latePickup} (${pickupChangePct}%)`} />
        <MiniCard label="Late Deliveries" value={`${c.lateDelivery}`} />
        <MiniCard label="Payment Terms" value={c.avgDaysToPay != null ? `~Net ${Math.round(c.avgDaysToPay)}` : '—'} />
        <MiniCard label="Margin" value={pct(c.margin)} />
      </div>

      {/* Lane table */}
      <div className="text-xs font-semibold text-muted-foreground mb-1">All Lanes ({c.lanes.length})</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b bg-muted/20">
              <th className="text-left px-3 py-2 cursor-pointer select-none" onClick={() => handleLaneSort('lane')}>
                <span className="inline-flex items-center">Lane <LaneSortIcon k="lane" laneSortKey={laneSortKey} laneSortDir={laneSortDir} /></span>
              </th>
              <th className="text-right px-3 py-2 w-[60px] cursor-pointer select-none" onClick={() => handleLaneSort('loads')}>
                <span className="inline-flex items-center justify-end">Loads <LaneSortIcon k="loads" laneSortKey={laneSortKey} laneSortDir={laneSortDir} /></span>
              </th>
              <th className="text-right px-3 py-2 w-[90px] cursor-pointer select-none" onClick={() => handleLaneSort('avgCost')}>
                <span className="inline-flex items-center justify-end">Avg Cost <LaneSortIcon k="avgCost" laneSortKey={laneSortKey} laneSortDir={laneSortDir} /></span>
              </th>
              <th className="text-right px-3 py-2 w-[90px]">Lane Avg</th>
              <th className="text-right px-3 py-2 w-[90px]">Delta</th>
              <th className="text-right px-3 py-2 w-[70px] cursor-pointer select-none" onClick={() => handleLaneSort('otd')}>
                <span className="inline-flex items-center justify-end">OTD % <LaneSortIcon k="otd" laneSortKey={laneSortKey} laneSortDir={laneSortDir} /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...c.lanes].sort((a, b) => {
              const dir = laneSortDir === 'asc' ? 1 : -1;
              switch (laneSortKey) {
                case 'lane': return a.lane.localeCompare(b.lane) * dir;
                case 'loads': return (a.loads - b.loads) * dir;
                case 'avgCost': return (a.avgCost - b.avgCost) * dir;
                case 'otd': return ((a.otdPct ?? -1) - (b.otdPct ?? -1)) * dir;
                default: return 0;
              }
            }).slice(0, 15).map((lane, j) => {
              const laneAvg = regionLaneAvgCosts.get(lane.lane);
              const delta = laneAvg != null ? lane.avgCost - laneAvg : null;
              return (
                <tr key={lane.lane} className={`border-b border-border/30 ${j % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-3 py-2 font-medium">{lane.lane}</td>
                  <td className="px-3 py-2 text-right font-mono">{lane.loads}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(lane.avgCost)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted-foreground">{laneAvg != null ? fmt(laneAvg) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-mono ${delta == null ? 'text-muted-foreground' : delta > 0 ? 'text-destructive' : 'text-success'}`}>
                    {delta != null ? fmtDelta(delta) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${lane.otdPct == null ? 'text-muted-foreground' : lane.otdPct >= 95 ? 'text-success' : lane.otdPct >= 90 ? 'text-warning' : 'text-destructive'}`}>
                    {lane.otdPct != null ? `${lane.otdPct.toFixed(0)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Small components ── */
function KPICard({ label, value, good, emphasis }: { label: string; value: string; good?: boolean; emphasis?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold font-mono mt-1 ${good === true ? 'text-success' : good === false ? 'text-destructive' : ''} ${emphasis ? 'text-primary' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniCard({ label, value, good, emphasis }: { label: string; value: string; good?: boolean; emphasis?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold font-mono ${good === true ? 'text-success' : good === false ? 'text-destructive' : ''} ${emphasis ? 'text-primary' : ''}`}>{value}</div>
    </div>
  );
}

function SummaryField({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-mono ${bold ? 'font-bold text-primary' : 'font-semibold'}`}>{value}</div>
    </div>
  );
}

function SortTh({ k, label, align, sortKey, sortDir, onSort, w }: {
  k: SortKey; label: string; align: 'left' | 'right' | 'center';
  sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; w?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors text-${align}`} style={w ? { width: w } : undefined} onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </span>
    </th>
  );
}

function LaneSortIcon({ k, laneSortKey, laneSortDir }: { k: LaneSortKey; laneSortKey: LaneSortKey; laneSortDir: SortDir }) {
  if (laneSortKey !== k) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return laneSortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
}
