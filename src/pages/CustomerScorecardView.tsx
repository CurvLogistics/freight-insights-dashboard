import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { ComputedLoad } from '@/types/loads';
import { isScored } from '@/lib/computeLoads';
import { DataTrustBadge, DataWarnings } from '@/components/DataTrust';

const fmt = (n?: number | null) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const pct = (n?: number | null) => n != null ? `${n.toFixed(1)}%` : '—';

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

type SortKey = 'name' | 'loads' | 'revenue' | 'cost' | 'profit' | 'margin' | 'activeLanes' | 'avgRevLoad';
type SortDir = 'asc' | 'desc';
type LaneSortKey = 'lane' | 'loads' | 'avgRevenue' | 'avgCost' | 'margin';

interface CustomerRow {
  name: string;
  loads: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  avgRevLoad: number;
  activeLanes: number;
  lastShipDate: string;
  daysSinceLast: number | null;
  lanes: { lane: string; loads: number; avgRevenue: number; avgCost: number; margin: number; lastShipDate: string }[];
  topLanePct: number;
  flags: string[];
  // Service metrics
  otpPct: number | null;
  otdPct: number | null;
  claimsPct: number | null;
  pickupChangesPct: number | null;
  carrierIssuesPct: number;
  customerIssuesPct: number;
  internalIssuesPct: number;
}

const STALE_DAYS = 30;
const TODAY = new Date('2026-04-02');

export default function CustomerScorecardView() {
  const { loads } = useData();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [minLoads, setMinLoads] = useState(3);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [laneSortKey, setLaneSortKey] = useState<LaneSortKey>('loads');
  const [laneSortDir, setLaneSortDir] = useState<SortDir>('desc');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [shareView, setShareView] = useState(false);

  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    loads.forEach(l => {
      [l.originState, l.destinationState].forEach(s => {
        const r = getRegion(s);
        if (r !== 'Unknown' && r !== 'Other') regions.add(r);
      });
    });
    return [...regions].sort();
  }, [loads]);

  const regionLoads = useMemo(() => {
    if (regionFilter === 'all') return loads;
    return loads.filter(l => getRegion(l.originState) === regionFilter || getRegion(l.destinationState) === regionFilter);
  }, [loads, regionFilter]);

  const customers = useMemo(() => {
    const map = new Map<string, {
      name: string; loads: number; revenue: number; cost: number;
      activeLanes: Set<string>; lastShipDate: string;
      laneLoads: Map<string, { loads: number; revenue: number; cost: number; lastShipDate: string }>;
      otpEligible: number; otpOnTime: number;
      otdEligible: number; otdOnTime: number;
      serviceReasons: { carrier: number; customer: number; internal: number };
    }>();

    regionLoads.forEach(l => {
      const key = (l.customerName || 'Unknown').trim().toUpperCase();
      let e = map.get(key);
      if (!e) {
        e = { name: l.customerName || 'Unknown', loads: 0, revenue: 0, cost: 0, activeLanes: new Set(), lastShipDate: '', laneLoads: new Map(), otpEligible: 0, otpOnTime: 0, otdEligible: 0, otdOnTime: 0, serviceReasons: { carrier: 0, customer: 0, internal: 0 } };
        map.set(key, e);
      }
      e.loads++;
      if (l.revenue != null) e.revenue += l.revenue;
      if (l.carrierCost != null) e.cost += l.carrierCost;

      // OTP — exclude unknown (missing timestamps)
     if (isScored(l.onTimePickup)) {
        e.otpEligible++;
        if (l.onTimePickup === 'On Time') e.otpOnTime++;
      }
      // OTD — exclude unknown
     if (isScored(l.onTimeDelivery)) {
        e.otdEligible++;
        if (l.onTimeDelivery === 'On Time') e.otdOnTime++;
      }

      // Issue classification from serviceReason
      if (l.serviceReason) {
        const reason = l.serviceReason.toLowerCase();
        if (reason.includes('carrier') || reason.includes('late') || reason.includes('missed')) {
          e.serviceReasons.carrier++;
        } else if (reason.includes('customer') || reason.includes('shipper') || reason.includes('receiver') || reason.includes('pickup change')) {
          e.serviceReasons.customer++;
        } else if (reason.includes('internal') || reason.includes('booking') || reason.includes('communication')) {
          e.serviceReasons.internal++;
        }
      }

      if (l.lane && l.lane !== 'Unknown') {
        e.activeLanes.add(l.lane);
        const le = e.laneLoads.get(l.lane) || { loads: 0, revenue: 0, cost: 0, lastShipDate: '' };
        le.loads++;
        if (l.revenue != null) le.revenue += l.revenue;
        if (l.carrierCost != null) le.cost += l.carrierCost;
        const ld = l.pickupDate || l.deliveryDate || '';
        if (ld > le.lastShipDate) le.lastShipDate = ld;
        e.laneLoads.set(l.lane, le);
      }

      const d = l.pickupDate || l.deliveryDate || '';
      if (d > e.lastShipDate) e.lastShipDate = d;
    });

    const rows: CustomerRow[] = [];
    map.forEach(e => {
      const profit = e.revenue - e.cost;
      const margin = e.revenue > 0 ? (profit / e.revenue) * 100 : 0;
      const avgRevLoad = e.loads > 0 ? e.revenue / e.loads : 0;

      const lanes: CustomerRow['lanes'] = [];
      e.laneLoads.forEach((lv, laneName) => {
        const lProfit = lv.revenue - lv.cost;
        const lMargin = lv.revenue > 0 ? (lProfit / lv.revenue) * 100 : 0;
        lanes.push({ lane: laneName, loads: lv.loads, avgRevenue: lv.loads > 0 ? lv.revenue / lv.loads : 0, avgCost: lv.loads > 0 ? lv.cost / lv.loads : 0, margin: lMargin, lastShipDate: lv.lastShipDate });
      });
      lanes.sort((a, b) => b.loads - a.loads);

      // Top 3 lane concentration
      const top3Loads = lanes.slice(0, 3).reduce((s, l) => s + l.loads, 0);
      const topLanePct = e.loads > 0 ? (top3Loads / e.loads) * 100 : 0;

      // Recency
      let daysSinceLast: number | null = null;
      if (e.lastShipDate) {
        const last = new Date(e.lastShipDate + 'T00:00:00Z');
        daysSinceLast = Math.round((TODAY.getTime() - last.getTime()) / 86400000);
      }

      // Flags
      const flags: string[] = [];
      if (margin < 5) flags.push('Low Margin');
      if (e.loads >= 10 && margin < 5) flags.push('High Vol + Low Margin');
      if (daysSinceLast != null && daysSinceLast > STALE_DAYS) flags.push('Stale Customer');

      // Service metrics
      const otpPct = e.otpEligible > 0 ? (e.otpOnTime / e.otpEligible) * 100 : null;
      const otdPct = e.otdEligible > 0 ? (e.otdOnTime / e.otdEligible) * 100 : null;
      const claimsPct = null; // No claims data yet
      const pickupChangesPct = null; // No pickup change data yet
      const carrierIssuesPct = e.loads > 0 ? (e.serviceReasons.carrier / e.loads) * 100 : 0;
      const customerIssuesPct = e.loads > 0 ? (e.serviceReasons.customer / e.loads) * 100 : 0;
      const internalIssuesPct = e.loads > 0 ? (e.serviceReasons.internal / e.loads) * 100 : 0;

      rows.push({
        name: e.name, loads: e.loads, revenue: e.revenue, cost: e.cost,
        profit, margin, avgRevLoad, activeLanes: e.activeLanes.size,
        lastShipDate: e.lastShipDate, daysSinceLast, lanes, topLanePct, flags,
        otpPct, otdPct, claimsPct, pickupChangesPct,
        carrierIssuesPct, customerIssuesPct, internalIssuesPct,
      });
    });
    return rows;
  }, [regionLoads]);

  const filtered = useMemo(() => {
    let result = customers.filter(c => c.loads >= minLoads);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(s));
    }
    if (flagFilter !== 'all') result = result.filter(c => c.flags.includes(flagFilter));
    return result;
  }, [customers, search, minLoads, flagFilter]);

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
        case 'profit': av = a.profit; bv = b.profit; break;
        case 'margin': av = a.margin; bv = b.margin; break;
        case 'activeLanes': av = a.activeLanes; bv = b.activeLanes; break;
        case 'avgRevLoad': av = a.avgRevLoad; bv = b.avgRevLoad; break;
        default: av = a.revenue; bv = b.revenue;
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { loads: 0, revenue: 0, cost: 0, customers: 0, lanes: new Set<string>() };
    customers.forEach(c => {
      t.loads += c.loads; t.revenue += c.revenue; t.cost += c.cost; t.customers++;
      c.lanes.forEach(l => t.lanes.add(l.lane));
    });
    const profit = t.revenue - t.cost;
    const margin = t.revenue > 0 ? (profit / t.revenue) * 100 : 0;
    return { ...t, profit, margin, activeLanes: t.lanes.size };
  }, [customers]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };
  const handleLaneSort = (key: LaneSortKey) => {
    if (laneSortKey === key) setLaneSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setLaneSortKey(key); setLaneSortDir(key === 'lane' ? 'asc' : 'desc'); }
  };

  const allFlags = ['Low Margin', 'High Vol + Low Margin', 'Stale Customer'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Customer Scorecard</h2>
          <DataTrustBadge level="partial" tooltip="Financials depend on complete revenue and cost data. Service metrics require timestamps." />
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          {totals.customers} customers · {totals.loads.toLocaleString('en-US')} loads
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
          <EyeOff className="w-3.5 h-3.5" /> Shareable View
        </button>
      </div>

      {/* KPI Bar */}
      <div className={`grid grid-cols-2 ${shareView ? 'md:grid-cols-4' : 'md:grid-cols-6'} gap-3`}>
        <KPICard label="Total Loads" value={totals.loads.toLocaleString('en-US')} />
        <KPICard label="Total Revenue" value={fmt(totals.revenue)} />
        {!shareView && <KPICard label="Total Spend" value={fmt(totals.cost)} />}
        {!shareView && <KPICard label="Total Profit" value={fmt(totals.profit)} good={totals.profit > 0} />}
        {!shareView && <KPICard label="Avg Margin" value={pct(totals.margin)} good={totals.margin >= 15} />}
        <KPICard label="Active Lanes" value={totals.activeLanes.toString()} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
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
            <Select value={flagFilter} onValueChange={setFlagFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Filter by flag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {allFlags.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">{sorted.length} of {customers.length} customers</span>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="sticky top-0 z-10">
                <tr className="text-muted-foreground text-xs border-b bg-muted/30">
                  <SortTh k="name" label="Customer" align="left" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh k="loads" label="Loads" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="70px" />
                  <SortTh k="revenue" label="Revenue" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="110px" />
                  {!shareView && <SortTh k="cost" label="Total Spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="110px" />}
                  {!shareView && <SortTh k="profit" label="Profit" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="100px" />}
                  {!shareView && <SortTh k="margin" label="Margin %" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="80px" />}
                  <SortTh k="activeLanes" label="Lanes" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="60px" />
                  <SortTh k="avgRevLoad" label="Avg Rev/Load" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="100px" />
                  {!shareView && <th className="px-4 py-3 text-left w-[160px]">Flags</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <>
                    <tr
                      key={c.name}
                      className={`border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-muted/15' : ''} ${expandedCustomer === c.name ? 'bg-primary/5' : ''}`}
                      onClick={() => setExpandedCustomer(expandedCustomer === c.name ? null : c.name)}
                    >
                      <td className="px-4 py-3 font-medium text-xs">{c.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.loads}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(c.revenue)}</td>
                      {!shareView && <td className="px-4 py-3 text-right font-mono">{fmt(c.cost)}</td>}
                      {!shareView && <td className={`px-4 py-3 text-right font-mono font-medium ${c.profit > 0 ? 'text-success' : 'text-destructive'}`}>{fmt(c.profit)}</td>}
                      {!shareView && <td className={`px-4 py-3 text-right font-mono font-medium ${c.margin >= 15 ? 'text-success' : c.margin >= 10 ? 'text-warning' : 'text-destructive'}`}>{pct(c.margin)}</td>}
                      <td className="px-4 py-3 text-right font-mono">{c.activeLanes}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(c.avgRevLoad)}</td>
                      {!shareView && <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.flags.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                          {c.flags.map(f => (
                            <Badge key={f} variant="outline" className={`text-[10px] px-1.5 py-0 ${
                              f === 'High Vol + Low Margin' ? 'border-destructive/40 text-destructive' :
                              f === 'Low Margin' ? 'border-warning/40 text-warning' :
                              f === 'Stale Customer' ? 'border-muted-foreground/40 text-muted-foreground' :
                              'border-muted-foreground/40 text-muted-foreground'
                            }`}>{f}</Badge>
                          ))}
                        </div>
                      </td>}
                    </tr>
                    {expandedCustomer === c.name && (
                      <tr key={`${c.name}-detail`} className="bg-muted/10">
                        <td colSpan={shareView ? 5 : 9} className="px-6 py-4">
                          {shareView ? (
                            <ShareableDetail c={c} handleLaneSort={handleLaneSort} laneSortKey={laneSortKey} laneSortDir={laneSortDir} />
                          ) : (
                            <ExpandedDetail c={c} handleLaneSort={handleLaneSort} laneSortKey={laneSortKey} laneSortDir={laneSortDir} />
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceMetricBadge({ label, value, thresholds }: { label: string; value: number | null; thresholds?: 'otp' | 'claims' }) {
  if (value == null) return <MiniCard label={label} value="N/A" />;
  let colorClass = '';
  if (thresholds === 'otp') {
    colorClass = value >= 95 ? 'text-green-600' : value >= 90 ? 'text-yellow-600' : 'text-red-600';
  } else if (thresholds === 'claims') {
    colorClass = value < 1 ? 'text-green-600' : value <= 3 ? 'text-yellow-600' : 'text-red-600';
  }
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold font-mono ${colorClass}`}>{value.toFixed(1)}%</div>
    </div>
  );
}

function ServicePerformanceSection({ c }: { c: CustomerRow }) {
  const hasIssues = c.carrierIssuesPct > 0 || c.customerIssuesPct > 0 || c.internalIssuesPct > 0;
  return (
    <>
      <div className="text-xs font-semibold text-muted-foreground">Service Performance</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ServiceMetricBadge label="On-Time Pickup" value={c.otpPct} thresholds="otp" />
        <ServiceMetricBadge label="On-Time Delivery" value={c.otdPct} thresholds="otp" />
        <ServiceMetricBadge label="Claims" value={c.claimsPct} thresholds="claims" />
        <MiniCard label="Pickup Changes" value={c.pickupChangesPct != null ? `${c.pickupChangesPct.toFixed(1)}%` : 'N/A'} />
      </div>

      <div className="text-xs font-semibold text-muted-foreground">Issue Breakdown</div>
      {hasIssues ? (
        <div className="grid grid-cols-3 gap-3">
          <MiniCard label="Carrier Issues" value={`${c.carrierIssuesPct.toFixed(1)}%`} />
          <MiniCard label="Customer Issues" value={`${c.customerIssuesPct.toFixed(1)}%`} />
          <MiniCard label="Internal Issues" value={`${c.internalIssuesPct.toFixed(1)}%`} />
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic">No classified issues for this customer</div>
      )}
    </>
  );
}

function ShareableDetail({ c, handleLaneSort, laneSortKey, laneSortDir }: {
  c: CustomerRow; handleLaneSort: (k: LaneSortKey) => void; laneSortKey: LaneSortKey; laneSortDir: SortDir;
}) {
  const lastDate = c.lastShipDate ? new Date(c.lastShipDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniCard label="Total Loads" value={c.loads.toLocaleString('en-US')} />
        <MiniCard label="Total Revenue" value={fmt(c.revenue)} emphasis />
        <MiniCard label="Avg Rev / Load" value={fmt(c.avgRevLoad)} />
        <MiniCard label="Active Lanes" value={c.activeLanes.toString()} />
        <MiniCard label="Last Shipment" value={lastDate} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniCard label="Days Since Last" value={c.daysSinceLast != null ? `${c.daysSinceLast}d` : '—'} />
        <MiniCard label="Lane Concentration" value={`${c.topLanePct.toFixed(0)}% in top 3`} />
      </div>

      <ServicePerformanceSection c={c} />

      {/* Top Lanes - activity view, no financials */}
      {c.lanes.length > 0 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground">Top Lanes ({Math.min(c.lanes.length, 5)})</div>
          <div className="space-y-2">
            {[...c.lanes].sort((a, b) => b.loads - a.loads).slice(0, 5).map((l) => {
              const laneLastDate = l.lastShipDate ? new Date(l.lastShipDate + 'T00:00:00Z') : null;
              const laneDaysAgo = laneLastDate ? Math.floor((TODAY.getTime() - laneLastDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
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

function ExpandedDetail({ c, handleLaneSort, laneSortKey, laneSortDir }: {
  c: CustomerRow; handleLaneSort: (k: LaneSortKey) => void; laneSortKey: LaneSortKey; laneSortDir: SortDir;
}) {
  const lastDate = c.lastShipDate ? new Date(c.lastShipDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';

  return (
    <div className="space-y-4">
      {/* Financial summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <MiniCard label="Total Loads" value={c.loads.toLocaleString('en-US')} />
        <MiniCard label="Revenue" value={fmt(c.revenue)} emphasis />
        <MiniCard label="Total Spend" value={fmt(c.cost)} />
        <MiniCard label="Profit" value={fmt(c.profit)} good={c.profit > 0} />
        <MiniCard label="Avg Margin" value={pct(c.margin)} />
        <MiniCard label="Avg Rev / Load" value={fmt(c.avgRevLoad)} />
      </div>

      {/* Recency + Lane Dependency */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniCard label="Last Shipment" value={lastDate} />
        <MiniCard label="Days Since Last" value={c.daysSinceLast != null ? `${c.daysSinceLast}d` : '—'} />
        <MiniCard label="Lane Concentration" value={`${c.topLanePct.toFixed(0)}% in top 3`} />
        <MiniCard label="Active Lanes" value={c.activeLanes.toString()} />
      </div>

      {c.topLanePct >= 70 && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-md px-3 py-2 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {c.topLanePct.toFixed(0)}% of volume concentrated in top 3 lanes — high dependency risk
        </div>
      )}

      <ServicePerformanceSection c={c} />

      {/* Top Lanes */}
      {c.lanes.length > 0 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground">Top Lanes ({c.lanes.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b bg-muted/20">
                  <th className="text-left px-3 py-2 cursor-pointer select-none" onClick={() => handleLaneSort('lane')}>
                    <span className="inline-flex items-center">Lane <LSI k="lane" ck={laneSortKey} cd={laneSortDir} /></span>
                  </th>
                  <th className="text-right px-3 py-2 w-[60px] cursor-pointer select-none" onClick={() => handleLaneSort('loads')}>
                    <span className="inline-flex items-center justify-end">Loads <LSI k="loads" ck={laneSortKey} cd={laneSortDir} /></span>
                  </th>
                  <th className="text-right px-3 py-2 w-[90px] cursor-pointer select-none" onClick={() => handleLaneSort('avgRevenue')}>
                    <span className="inline-flex items-center justify-end">Avg Rev <LSI k="avgRevenue" ck={laneSortKey} cd={laneSortDir} /></span>
                  </th>
                  <th className="text-right px-3 py-2 w-[90px] cursor-pointer select-none" onClick={() => handleLaneSort('avgCost')}>
                    <span className="inline-flex items-center justify-end">Avg Cost <LSI k="avgCost" ck={laneSortKey} cd={laneSortDir} /></span>
                  </th>
                  <th className="text-right px-3 py-2 w-[80px] cursor-pointer select-none" onClick={() => handleLaneSort('margin')}>
                    <span className="inline-flex items-center justify-end">Margin % <LSI k="margin" ck={laneSortKey} cd={laneSortDir} /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...c.lanes].sort((a, b) => {
                  const dir = laneSortDir === 'asc' ? 1 : -1;
                  switch (laneSortKey) {
                    case 'lane': return a.lane.localeCompare(b.lane) * dir;
                    case 'loads': return (a.loads - b.loads) * dir;
                    case 'avgRevenue': return (a.avgRevenue - b.avgRevenue) * dir;
                    case 'avgCost': return (a.avgCost - b.avgCost) * dir;
                    case 'margin': return (a.margin - b.margin) * dir;
                    default: return 0;
                  }
                }).slice(0, 10).map((l, j) => (
                  <tr key={l.lane} className={`border-b border-border/30 ${j % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="px-3 py-2 font-medium">{l.lane}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.loads}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(l.avgRevenue)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(l.avgCost)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-medium ${l.margin >= 15 ? 'text-success' : l.margin >= 10 ? 'text-warning' : 'text-destructive'}`}>
                      {pct(l.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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

function LSI({ k, ck, cd }: { k: LaneSortKey; ck: LaneSortKey; cd: SortDir }) {
  if (ck !== k) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return cd === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
}
