import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, AlertTriangle, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, MapPin, Filter, ChevronDown, ChevronRight, Truck, Info } from 'lucide-react';
import { computeLoad, isActiveLoad } from '@/lib/computeLoads';
import { getComparisonWindow } from '@/lib/comparison';
import InfoTip from '@/components/InfoTip';
import { DataTrustBadge } from '@/components/DataTrust';
import { ComputedLoad, Load } from '@/types/loads';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const DAY_MS = 24 * 60 * 60 * 1000;
const fmt = (n?: number | null) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const pct = (n?: number | null) => n != null ? `${n.toFixed(1)}%` : '—';
const fmtDeltaCurrency = (n?: number | null) => n != null ? `${n > 0 ? '+' : n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}` : '—';
const fmtDeltaNumber = (n?: number | null) => n != null ? `${n > 0 ? '+' : ''}${Math.round(n)}` : '—';
const fmtDeltaPct = (n?: number | null, suffix = '%') => n != null ? `${n > 0 ? '+' : ''}${n.toFixed(1)}${suffix}` : '—';
const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

type LaneLevel = 'city' | 'state';
type LookupMode = 'exact' | 'originComps' | 'destComps' | 'eitherSide' | 'closestMatch';
type SortKey =
  | 'lane'
  | 'loadsCur'
  | 'loadsPrev'
  | 'loadsDelta'
  | 'avgCostCur'
  | 'avgCostPrev'
  | 'costDelta'
  | 'avgRevenueCur'
  | 'avgRevenuePrev'
  | 'revenueDelta'
  | 'marginCur'
  | 'marginPrev'
  | 'marginDelta'
  | 'lastShipDate'
  | 'lastCost'
  | 'lastSell'
  | 'daysAgo'
  | 'equipment';
type SortDir = 'asc' | 'desc';

interface LanePeriodStats {
  loads: number;
  revenue: number;
  cost: number;
  lastShipDate: string;
  lastCost: number | null;
  lastSell: number | null;
}

interface LaneAgg {
  lane: string;
  equipment: string;
  current: LanePeriodStats;
  prior: LanePeriodStats;
}

interface LaneRow {
  lane: string;
  equipment: string;
  loadsCur: number;
  loadsPrev: number;
  hasPriorData: boolean;
  loadsDelta: number | null;
  avgCostCur: number | null;
  avgCostPrev: number | null;
  costDelta: number | null;
  costDeltaPct: number | null;
  avgRevenueCur: number | null;
  avgRevenuePrev: number | null;
  revenueDelta: number | null;
  marginCur: number | null;
  marginPrev: number | null;
  marginDelta: number | null;
  avgRevenue: number | null;
  margin: number | null;
  lastShipDate: string;
  lastShipDateCur: string;
  lastShipDatePrev: string;
  lastCost: number | null;
  lastSell: number | null;
  daysAgo: number | null;
  daysAgoCur: number | null;
}

interface HistoricalShipment {
  loadId: string;
  date: string;
  origin: string;
  destination: string;
  carrier: string;
  revenue: number;
  cost: number;
  hasCost: boolean;
  margin: number;
  equipment: string;
}

interface CarrierOnLane {
  carrier: string; loads: number; lastDate: string;
  lastCost: number | null; avgCost: number | null; minCost: number | null; maxCost: number | null;
}

/** Who ran this lane and what we paid them — most recent carrier first. */
function summarizeCarriers(shipments: HistoricalShipment[]): CarrierOnLane[] {
  const m = new Map<string, HistoricalShipment[]>();
  shipments.forEach(s => m.set(s.carrier, [...(m.get(s.carrier) ?? []), s]));
  return [...m.entries()].map(([carrier, list]) => {
    const byDate = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const costs = list.filter(s => s.hasCost).map(s => s.cost);
    const lastWithCost = byDate.find(s => s.hasCost);
    return {
      carrier, loads: list.length, lastDate: byDate[0]?.date ?? '',
      lastCost: lastWithCost ? lastWithCost.cost : null,
      avgCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
      minCost: costs.length ? Math.min(...costs) : null,
      maxCost: costs.length ? Math.max(...costs) : null,
    };
  }).sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.loads - a.loads);
}

interface CompResult {
  lane: string;
  matchType: 'exact' | 'originComp' | 'destComp' | 'nearOrigin' | 'nearDest' | 'regional';
  equipment: string;
  totalLoads: number;
  avgCost: number;
  avgRevenue: number;
  avgMargin: number;
  lastShipped: string;
  lastCost: number | null;
  lastSell: number | null;
  daysAgo: number | null;
  shipments: HistoricalShipment[];
  hasMissingFinancials: boolean;
}

function parseDateOnly(value?: string): number | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function formatShortDate(value?: string | null): string {
  const parsed = parseDateOnly(value);
  return parsed != null ? shortDateFormatter.format(parsed) : '—';
}

function normalizeWhitespace(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeToken(value?: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeState(value?: string): string {
  return normalizeWhitespace(value).toUpperCase();
}

function toTitleCase(value?: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getShipmentDate(load: Pick<Load, 'pickupDate' | 'deliveryDate'>): string {
  return (load.pickupDate || load.deliveryDate || '').slice(0, 10);
}

function matchesGlobalSearch(load: Load, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [load.loadId, load.customerName, load.carrierName, load.broker, load.originCity, load.originState, load.destinationCity, load.destinationState]
    .some((value) => value?.toLowerCase().includes(term));
}

function matchesPriorFilters(load: Load, filters: { team: string; equipmentType: string; search: string }, range: { start: string; end: string }): boolean {
  if (filters.team !== 'all' && load.team !== filters.team) return false;
  if (filters.equipmentType !== 'all' && load.equipmentType !== filters.equipmentType) return false;
  if (!matchesGlobalSearch(load, filters.search)) return false;
  const shipmentDate = getShipmentDate(load);
  if (!shipmentDate) return false;
  if (range.start && shipmentDate < range.start) return false;
  if (range.end && shipmentDate > range.end) return false;
  return true;
}

function getLaneIdentity(
  load: Pick<ComputedLoad, 'lane' | 'stateLane' | 'originCity' | 'originState' | 'destinationCity' | 'destinationState'>,
  level: LaneLevel
): { key: string; label: string } {
  if (level === 'state') {
    const originState = normalizeState(load.originState) || '?';
    const destinationState = normalizeState(load.destinationState) || '?';
    return {
      key: `state:${originState}->${destinationState}`,
      label: originState !== '?' && destinationState !== '?' ? `${originState} → ${destinationState}` : load.stateLane,
    };
  }
  const originCity = normalizeToken(load.originCity);
  const destinationCity = normalizeToken(load.destinationCity);
  const originState = normalizeState(load.originState) || '?';
  const destinationState = normalizeState(load.destinationState) || '?';
  const originLabel = [toTitleCase(load.originCity), originState !== '?' ? originState : ''].filter(Boolean).join(', ');
  const destinationLabel = [toTitleCase(load.destinationCity), destinationState !== '?' ? destinationState : ''].filter(Boolean).join(', ');
  return {
    key: `city:${originCity || '?'}|${originState}->${destinationCity || '?'}|${destinationState}`,
    label: originLabel && destinationLabel ? `${originLabel} → ${destinationLabel}` : load.lane,
  };
}

function createEmptyPeriodStats(): LanePeriodStats {
  return { loads: 0, revenue: 0, cost: 0, lastShipDate: '', lastCost: null, lastSell: null };
}

function updatePeriodStats(stats: LanePeriodStats, load: Pick<ComputedLoad, 'pickupDate' | 'deliveryDate' | 'revenue' | 'carrierCost'>): void {
  stats.loads += 1;
  stats.revenue += load.revenue ?? 0;
  stats.cost += load.carrierCost ?? 0;
  const shipmentDate = getShipmentDate(load);
  if (shipmentDate && shipmentDate > stats.lastShipDate) {
    stats.lastShipDate = shipmentDate;
    stats.lastCost = load.carrierCost ?? null;
    stats.lastSell = load.revenue ?? null;
  }
}

function getAverage(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

function getMargin(revenue: number, cost: number, loads: number): number | null {
  if (loads === 0) return null;
  return revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
}

function compareNullable(a: string | number | null | undefined, b: string | number | null | undefined, dir: SortDir): number {
  const aMissing = a == null || a === '';
  const bMissing = b == null || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === 'string' && typeof b === 'string') return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  return dir === 'asc' ? Number(a) - Number(b) : Number(b) - Number(a);
}

const STATE_CLUSTERS: Record<string, string[]> = {
  'TX': ['TX', 'OK', 'AR', 'LA', 'NM'],
  'OK': ['OK', 'TX', 'AR', 'KS', 'MO'],
  'CA': ['CA', 'AZ', 'NV', 'OR'],
  'AZ': ['AZ', 'CA', 'NV', 'NM', 'UT'],
  'NY': ['NY', 'NJ', 'CT', 'PA'],
  'NJ': ['NJ', 'NY', 'PA', 'CT', 'DE'],
  'PA': ['PA', 'NJ', 'NY', 'DE', 'MD', 'OH', 'WV'],
  'FL': ['FL', 'GA', 'AL'],
  'GA': ['GA', 'FL', 'AL', 'SC', 'TN', 'NC'],
  'IL': ['IL', 'IN', 'WI', 'MO', 'IA'],
  'IN': ['IN', 'IL', 'OH', 'MI', 'KY'],
  'OH': ['OH', 'PA', 'WV', 'KY', 'IN', 'MI'],
  'MI': ['MI', 'OH', 'IN', 'WI'],
  'WA': ['WA', 'OR', 'ID'],
  'OR': ['OR', 'WA', 'CA', 'ID', 'NV'],
  'NC': ['NC', 'SC', 'VA', 'TN', 'GA'],
  'SC': ['SC', 'NC', 'GA'],
  'VA': ['VA', 'MD', 'WV', 'NC', 'DC', 'KY'],
  'TN': ['TN', 'KY', 'VA', 'NC', 'GA', 'AL', 'MS', 'AR', 'MO'],
  'MO': ['MO', 'IL', 'KS', 'OK', 'AR', 'TN', 'KY', 'IA', 'NE'],
  'CO': ['CO', 'NM', 'KS', 'NE', 'WY', 'UT'],
  'WI': ['WI', 'IL', 'MN', 'MI', 'IA'],
  'MN': ['MN', 'WI', 'IA', 'ND', 'SD'],
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

const ALL_STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

function resolveStateCode(input: string): string | null {
  const upper = input.trim().toUpperCase();
  if (ALL_STATE_CODES.has(upper)) return upper;
  const lower = input.trim().toLowerCase();
  return STATE_NAME_TO_CODE[lower] || null;
}

interface ParsedLocation {
  city: string;       // normalized lowercase
  state: string;      // normalized uppercase
  isStateOnly: boolean;
  raw: string;
}

function parseLocationInput(val: string): ParsedLocation {
  const raw = val.trim();
  if (!raw) return { city: '', state: '', isStateOnly: false, raw };

  // Check if entire input is a state name or 2-letter code
  const stateCode = resolveStateCode(raw);
  if (stateCode) return { city: '', state: stateCode, isStateOnly: true, raw };

  // Try "City, ST" format
  const parts = raw.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const maybeState = resolveStateCode(parts[parts.length - 1]);
    const cityPart = parts.slice(0, -1).join(', ');
    return {
      city: normalizeToken(cityPart),
      state: maybeState || normalizeState(parts[parts.length - 1]),
      isStateOnly: false,
      raw,
    };
  }

  // Single word — treat as city (no state)
  return { city: normalizeToken(raw), state: '', isStateOnly: false, raw };
}

function getCluster(state?: string): string[] {
  const s = normalizeState(state);
  return STATE_CLUSTERS[s] || [s];
}

function statesNearby(state1?: string, state2?: string): boolean {
  if (!state1 || !state2) return false;
  const s1 = normalizeState(state1);
  const s2 = normalizeState(state2);
  if (s1 === s2) return true;
  return getCluster(s1).includes(s2);
}

function getEquipmentLabel(load: Pick<Load, 'equipmentType'>): string {
  return load.equipmentType?.trim() || 'Unknown Equipment';
}

function buildLaneLabel(load: ComputedLoad): string {
  const o = [toTitleCase(load.originCity), normalizeState(load.originState)].filter(Boolean).join(', ');
  const d = [toTitleCase(load.destinationCity), normalizeState(load.destinationState)].filter(Boolean).join(', ');
  return o && d ? `${o} → ${d}` : o || d || 'Unknown';
}

type ShipmentSortKey = 'date' | 'revenue' | 'cost' | 'margin';

// ─── Component ───────────────────────────────────────────────────────────────

export default function LanesView() {
  const { loads, rawLoads, filters, comparisonMode, viewMode } = useData();
  const [level, setLevel] = useState<LaneLevel>('city');
  const [datRates, setDatRates] = useState<Record<string, number>>({});
  const setDatRate = (lane: string, value: string) => {
    const num = parseFloat(value.replace(/[$,]/g, ''));
    if (value.trim() === '') {
      setDatRates(prev => { const next = { ...prev }; delete next[lane]; return next; });
    } else if (!isNaN(num)) {
      setDatRates(prev => ({ ...prev, [lane]: num }));
    }
  };

  // Lookup state
  const [originInput, setOriginInput] = useState('');
  const [destInput, setDestInput] = useState('');
  const [lookupMode, setLookupMode] = useState<LookupMode>('closestMatch');
  const [lookupEquipFilter, setLookupEquipFilter] = useState('all');
  const [expandedComps, setExpandedComps] = useState<Set<string>>(new Set());
  const [shipmentSort, setShipmentSort] = useState<ShipmentSortKey>('date');

  // Table state
  const [tableSortKey, setTableSortKey] = useState<SortKey>('loadsCur');
  const [tableSortDir, setTableSortDir] = useState<SortDir>('desc');
  const [tableFilter, setTableFilter] = useState('');

  // Problem lanes
  const [plSearch, setPlSearch] = useState('');
  const [plMinLoads, setPlMinLoads] = useState(5);
  const [plMarginThreshold, setPlMarginThreshold] = useState(5);
  const [plCostThreshold, setPlCostThreshold] = useState(10);
  type PlSortKey = 'margin' | 'costDeltaPct' | 'loadsCur';
  const [plSortKey, setPlSortKey] = useState<PlSortKey>('margin');

  // Cost trend
  type CtSortKey = 'costDeltaPct' | 'loadsCur' | 'costDelta' | 'lane';
  const [ctSortKey, setCtSortKey] = useState<CtSortKey>('costDeltaPct');
  const [ctSortDir, setCtSortDir] = useState<SortDir>('desc');

  const compWindow = useMemo(() => getComparisonWindow(filters.dateRange, comparisonMode, rawLoads), [filters.dateRange, comparisonMode, rawLoads]);
  // Only compare against a window we actually have data for (see lib/comparison.ts)
  const priorRange = compWindow.covered ? compWindow.range : null;

  const prevLoads = useMemo(() => {
    if (!priorRange) return [];
    return rawLoads
      .filter((load) => isActiveLoad(load) && matchesPriorFilters(load, filters, priorRange))
      .map(computeLoad)
      .filter((load) => viewMode === 'booked' || load.simpleStatus === 'Locked');
  }, [rawLoads, filters, priorRange, viewMode]);

    // Lane Lookup is for quoting, so it searches all stored history, not just the date range at the top
    const lookupLoads = useMemo(() => rawLoads
      .filter(isActiveLoad)
      .filter(l => filters.team === 'all' || l.team === filters.team)
      .filter(l => filters.equipmentType === 'all' || l.equipmentType === filters.equipmentType)
      .map(computeLoad)
      .filter(l => viewMode === 'booked' || l.simpleStatus === 'Locked'),
    [rawLoads, filters.team, filters.equipmentType, viewMode]);

    // Available equipment types for the lookup
    const lookupEquipOptions = useMemo(() => {
      const set = new Set<string>();
      lookupLoads.forEach(l => set.add(getEquipmentLabel(l)));
      return [...set].sort();
    }, [lookupLoads]);


  // ─── Lane Rows (for Perf Table / Problem Lanes / Cost Trend) ───
  const laneRows = useMemo((): LaneRow[] => {
    const map = new Map<string, LaneAgg>();

    const ensureLane = (load: ComputedLoad) => {
      const { key, label } = getLaneIdentity(load, level);
      const equip = getEquipmentLabel(load);
      const mapKey = `${key}||${equip}`;
      const existing = map.get(mapKey);
      if (existing) return existing;
      const next: LaneAgg = { lane: label, equipment: equip, current: createEmptyPeriodStats(), prior: createEmptyPeriodStats() };
      map.set(mapKey, next);
      return next;
    };

    loads.forEach((load) => updatePeriodStats(ensureLane(load).current, load));
    prevLoads.forEach((load) => updatePeriodStats(ensureLane(load).prior, load));

    const todayMs = parseDateOnly(new Date().toISOString().slice(0, 10)) ?? Date.now();

    return [...map.values()].map((la) => {
      const avgCostCur = getAverage(la.current.cost, la.current.loads);
      const avgCostPrev = getAverage(la.prior.cost, la.prior.loads);
      const avgRevenueCur = getAverage(la.current.revenue, la.current.loads);
      const avgRevenuePrev = getAverage(la.prior.revenue, la.prior.loads);
      const marginCur = getMargin(la.current.revenue, la.current.cost, la.current.loads);
      const marginPrev = getMargin(la.prior.revenue, la.prior.cost, la.prior.loads);
      const hasPriorData = la.prior.loads > 0;
      const currentShipMs = parseDateOnly(la.current.lastShipDate);
      const costDelta = hasPriorData && avgCostCur != null && avgCostPrev != null ? avgCostCur - avgCostPrev : null;
      const costDeltaPct = hasPriorData && avgCostCur != null && avgCostPrev != null
        ? avgCostPrev !== 0 ? ((avgCostCur - avgCostPrev) / avgCostPrev) * 100 : avgCostCur === 0 ? 0 : null
        : null;
      const revenueDelta = hasPriorData && avgRevenueCur != null && avgRevenuePrev != null ? avgRevenueCur - avgRevenuePrev : null;
      const marginDelta = hasPriorData && marginCur != null && marginPrev != null ? marginCur - marginPrev : null;

      return {
        lane: la.lane,
        equipment: la.equipment,
        loadsCur: la.current.loads,
        loadsPrev: la.prior.loads,
        hasPriorData,
        loadsDelta: hasPriorData ? la.current.loads - la.prior.loads : null,
        avgCostCur, avgCostPrev, costDelta, costDeltaPct,
        avgRevenueCur, avgRevenuePrev, revenueDelta,
        marginCur, marginPrev, marginDelta,
        avgRevenue: avgRevenueCur,
        margin: marginCur,
        lastShipDate: la.current.lastShipDate,
        lastShipDateCur: la.current.lastShipDate,
        lastShipDatePrev: la.prior.lastShipDate,
        lastCost: la.current.lastCost,
        lastSell: la.current.lastSell,
        daysAgo: currentShipMs != null ? Math.max(0, Math.round((todayMs - currentShipMs) / DAY_MS)) : null,
        daysAgoCur: currentShipMs != null ? Math.max(0, Math.round((todayMs - currentShipMs) / DAY_MS)) : null,
      };
    });
  }, [loads, prevLoads, level]);

  // ─── Typeahead suggestions ───
  // Built from BOTH ends of every lane in the current filters (same loads the lookup searches).
  // Before, the origin box only knew origin cities, so typing "Bronx" (a destination-only
  // city) in Origin showed nothing while it worked in Destination.
  type Suggestion = { label: string; key: string; asOrigin: number; asDest: number };
  const locationIndex = useMemo(() => {
    const m = new Map<string, Suggestion>();
    const add = (city: string | undefined, st: string | undefined, side: 'asOrigin' | 'asDest') => {
      const c = toTitleCase(city);
      const state = normalizeState(st);
      if (!c || !state) return;
      const key = `${normalizeToken(city)}|${state}`;
      const e = m.get(key) ?? { label: `${c}, ${state}`, key, asOrigin: 0, asDest: 0 };
      e[side]++;
      m.set(key, e);
    };
    lookupLoads.forEach(l => {
      add(l.originCity, l.originState, 'asOrigin');
      add(l.destinationCity, l.destinationState, 'asDest');
    });
    return [...m.values()];
  }, [lookupLoads]);

  const [openSuggest, setOpenSuggest] = useState<'origin' | 'dest' | null>(null);

  const suggestFor = (input: string, side: 'origin' | 'dest') => {
    const term = input.trim().toLowerCase();
    if (!term) return [];
    const own = side === 'origin' ? 'asOrigin' : 'asDest';
    return locationIndex
      .filter(s => s.label.toLowerCase().includes(term) && s.label.toLowerCase() !== term)
      // starts-with first, then cities that actually appear on this side, then by volume
      .sort((a, b) =>
        Number(b.label.toLowerCase().startsWith(term)) - Number(a.label.toLowerCase().startsWith(term)) ||
        Number(b[own] > 0) - Number(a[own] > 0) ||
        (b.asOrigin + b.asDest) - (a.asOrigin + a.asDest))
      .slice(0, 8);
  };
  const filteredOriginSuggestions = useMemo(() => suggestFor(originInput, 'origin'), [originInput, locationIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredDestSuggestions = useMemo(() => suggestFor(destInput, 'dest'), [destInput, locationIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  /** "Bronx, NY only appears as a destination" style hint when the typed place never ships from/to that side. */
  const wrongSideHint = (input: string, side: 'origin' | 'dest') => {
    const loc = parseLocationInput(input);
    if (!loc.city) return null;
    const matches = locationIndex.filter(s => {
      const [city, st] = s.key.split('|');
      return city === loc.city && (!loc.state || st === loc.state);
    });
    if (matches.length === 0) return null;
    const own = matches.reduce((n, s) => n + (side === 'origin' ? s.asOrigin : s.asDest), 0);
    const other = matches.reduce((n, s) => n + (side === 'origin' ? s.asDest : s.asOrigin), 0);
    return own === 0 && other > 0 ? { label: matches[0].label, other } : null;
  };
  const originHint = useMemo(() => wrongSideHint(originInput, 'origin'), [originInput, locationIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const destHint = useMemo(() => wrongSideHint(destInput, 'dest'), [destInput, locationIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Lookup results (the core comp engine) ───
  const lookupResults = useMemo((): { sections: { label: string; color: string; items: CompResult[] }[]; hasExact: boolean; message: string | null; warnings: string[] } | null => {
    if (!originInput.trim() && !destInput.trim()) return null;

    const origin = parseLocationInput(originInput);
    const dest = parseLocationInput(destInput);
    const hasOrigin = !!(origin.city || origin.state);
    const hasDest = !!(dest.city || dest.state);
    if (!hasOrigin && !hasDest) return null;

    const todayMs = parseDateOnly(new Date().toISOString().slice(0, 10)) ?? Date.now();

    // Group loads by lane+equipment
    type LaneEntry = { lane: string; equipment: string; loads: ComputedLoad[]; originCity: string; originState: string; destCity: string; destState: string };
    const laneMap = new Map<string, LaneEntry>();
    lookupLoads.forEach(load => {
      const { key, label } = getLaneIdentity(load, level);
      const equip = getEquipmentLabel(load);
      const mapKey = `${key}||${equip}`;
      if (!laneMap.has(mapKey)) {
        laneMap.set(mapKey, {
          lane: label, equipment: equip, loads: [],
          originCity: normalizeToken(load.originCity), originState: normalizeState(load.originState),
          destCity: normalizeToken(load.destinationCity), destState: normalizeState(load.destinationState),
        });
      }
      laneMap.get(mapKey)!.loads.push(load);
    });

    const buildComp = (entry: LaneEntry, matchType: CompResult['matchType']): CompResult => {
      const sorted = [...entry.loads].sort((a, b) => getShipmentDate(b).localeCompare(getShipmentDate(a)));
      const totalRev = entry.loads.reduce((s, l) => s + (l.revenue ?? 0), 0);
      const totalCost = entry.loads.reduce((s, l) => s + (l.carrierCost ?? 0), 0);
      const mostRecent = sorted[0];
      const lastShipDate = mostRecent ? getShipmentDate(mostRecent) : '';
      const lastShipMs = parseDateOnly(lastShipDate);
      const hasMissing = entry.loads.some(l => l.revenue == null || l.carrierCost == null);

      return {
        lane: entry.lane,
        matchType,
        equipment: entry.equipment,
        totalLoads: entry.loads.length,
        avgCost: entry.loads.length > 0 ? totalCost / entry.loads.length : 0,
        avgRevenue: entry.loads.length > 0 ? totalRev / entry.loads.length : 0,
        avgMargin: totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0,
        lastShipped: lastShipDate,
        lastCost: mostRecent?.carrierCost ?? null,
        lastSell: mostRecent?.revenue ?? null,
        daysAgo: lastShipMs != null ? Math.max(0, Math.round((todayMs - lastShipMs) / DAY_MS)) : null,
        shipments: sorted.map(l => ({
          loadId: l.loadId,
          date: getShipmentDate(l),
          origin: buildLaneLabel({ ...l, destinationCity: undefined, destinationState: undefined } as any).split(' → ')[0] || '',
          destination: buildLaneLabel({ ...l, originCity: undefined, originState: undefined } as any) || '',
          carrier: l.carrierName || 'Unknown',
          revenue: l.revenue ?? 0,
          cost: l.carrierCost ?? 0,
          hasCost: l.carrierCost != null,
          margin: l.revenue && l.revenue > 0 ? ((l.revenue - (l.carrierCost ?? 0)) / l.revenue) * 100 : 0,
          equipment: getEquipmentLabel(l),
        })),
        hasMissingFinancials: hasMissing,
      };
    };

    // ── Flexible matching predicates ──
    // City match: fuzzy substring
    const cityMatch = (entryCity: string, searchCity: string) =>
      searchCity && entryCity && (entryCity.includes(searchCity) || searchCity.includes(entryCity));

    // Origin matches: city+state, state-only, or city-only
    const originMatchesFull = (e: LaneEntry): boolean => {
      if (origin.isStateOnly) return origin.state ? e.originState === origin.state : false;
      if (origin.city && origin.state) return cityMatch(e.originCity, origin.city) && e.originState === origin.state;
      if (origin.city) return cityMatch(e.originCity, origin.city);
      if (origin.state) return e.originState === origin.state;
      return false;
    };
    const destMatchesFull = (e: LaneEntry): boolean => {
      if (dest.isStateOnly) return dest.state ? e.destState === dest.state : false;
      if (dest.city && dest.state) return cityMatch(e.destCity, dest.city) && e.destState === dest.state;
      if (dest.city) return cityMatch(e.destCity, dest.city);
      if (dest.state) return e.destState === dest.state;
      return false;
    };
    // State-level match for broadening
    const originStateMatches = (e: LaneEntry): boolean => origin.state ? e.originState === origin.state : false;
    const destStateMatches = (e: LaneEntry): boolean => dest.state ? e.destState === dest.state : false;

    const exact: CompResult[] = [];
    const stateLevel: CompResult[] = [];
    const originComps: CompResult[] = [];
    const destComps: CompResult[] = [];
    const nearOrigin: CompResult[] = [];
    const nearDest: CompResult[] = [];
    const regional: CompResult[] = [];
    const usedKeys = new Set<string>();

    // Pass 1: Exact matches (both sides match fully)
    if (hasOrigin && hasDest) {
      laneMap.forEach((entry, key) => {
        if (originMatchesFull(entry) && destMatchesFull(entry)) {
          exact.push(buildComp(entry, 'exact'));
          usedKeys.add(key);
        }
      });
    }

    // Pass 2: State-level broadening for City→State or State→State searches
    // If origin or dest is state-only, find city-level shipments within that state pair
    if (hasOrigin && hasDest && (origin.isStateOnly || dest.isStateOnly)) {
      laneMap.forEach((entry, key) => {
        if (usedKeys.has(key)) return;
        const oMatch = origin.isStateOnly ? originStateMatches(entry) : originMatchesFull(entry);
        const dMatch = dest.isStateOnly ? destStateMatches(entry) : destMatchesFull(entry);
        if (oMatch && dMatch) {
          stateLevel.push(buildComp(entry, 'exact'));
          usedKeys.add(key);
        }
      });
    }

    // Pass 3: Origin comps — all loads OUT of origin
    if (hasOrigin) {
      laneMap.forEach((entry, key) => {
        if (usedKeys.has(key)) return;
        if (originMatchesFull(entry)) {
          originComps.push(buildComp(entry, 'originComp'));
          usedKeys.add(key);
        }
      });
    }

    // Pass 4: Dest comps — all loads INTO destination
    if (hasDest) {
      laneMap.forEach((entry, key) => {
        if (usedKeys.has(key)) return;
        if (destMatchesFull(entry)) {
          destComps.push(buildComp(entry, 'destComp'));
          usedKeys.add(key);
        }
      });
    }

    // Pass 5: Nearby comps via state clusters
    if (origin.state) {
      laneMap.forEach((entry, key) => {
        if (usedKeys.has(key)) return;
        if (statesNearby(entry.originState, origin.state) && entry.originState !== origin.state) {
          if (hasDest ? destMatchesFull(entry) || destStateMatches(entry) : true) {
            nearOrigin.push(buildComp(entry, 'nearOrigin'));
            usedKeys.add(key);
          }
        }
      });
    }

    if (dest.state) {
      laneMap.forEach((entry, key) => {
        if (usedKeys.has(key)) return;
        if (statesNearby(entry.destState, dest.state) && entry.destState !== dest.state) {
          if (hasOrigin ? originMatchesFull(entry) || originStateMatches(entry) : true) {
            nearDest.push(buildComp(entry, 'nearDest'));
            usedKeys.add(key);
          }
        }
      });
    }

    // Pass 6: Regional state-to-state
    if (origin.state && dest.state) {
      laneMap.forEach((entry, key) => {
        if (usedKeys.has(key)) return;
        if (statesNearby(entry.originState, origin.state) && statesNearby(entry.destState, dest.state)) {
          regional.push(buildComp(entry, 'regional'));
          usedKeys.add(key);
        }
      });
    }

    // Sort each group by volume desc
    const sortGroup = (arr: CompResult[]) => arr.sort((a, b) => b.totalLoads - a.totalLoads);
    [exact, stateLevel, originComps, destComps, nearOrigin, nearDest, regional].forEach(sortGroup);

    // Build section labels
    const originLabel = origin.isStateOnly ? origin.state : (origin.raw || 'Origin');
    const destLabel = dest.isStateOnly ? dest.state : (dest.raw || 'Destination');

    // Build sections based on lookup mode
    let sections: { label: string; color: string; items: CompResult[] }[] = [];
    const hasExact = exact.length > 0 || stateLevel.length > 0;
    let message: string | null = null;

    const exactItems = [...exact, ...stateLevel];

    switch (lookupMode) {
      case 'exact':
        sections = [{ label: 'Exact Matches', color: 'text-success', items: exactItems }];
        if (!hasExact) message = 'No exact lane found. Try "Closest Match" or "Either Side" for related comps.';
        break;
      case 'originComps':
        sections = [
          { label: 'Exact Matches', color: 'text-success', items: exactItems },
          { label: `Outbound from ${originLabel}`, color: 'text-primary', items: originComps },
        ];
        break;
      case 'destComps':
        sections = [
          { label: 'Exact Matches', color: 'text-success', items: exactItems },
          { label: `Inbound to ${destLabel}`, color: 'text-primary', items: destComps },
        ];
        break;
      case 'eitherSide':
        sections = [
          { label: 'Exact Matches', color: 'text-success', items: exactItems },
          { label: `Outbound from ${originLabel}`, color: 'text-primary', items: originComps },
          { label: `Inbound to ${destLabel}`, color: 'text-primary', items: destComps },
        ];
        if (!hasExact && originComps.length === 0 && destComps.length === 0) {
          message = 'No matching comps found for either side.';
        }
        break;
      case 'closestMatch':
      default:
        sections = [
          { label: 'Exact Matches', color: 'text-success', items: exactItems },
          { label: `Outbound from ${originLabel}`, color: 'text-primary', items: originComps },
          { label: `Inbound to ${destLabel}`, color: 'text-primary', items: destComps },
          { label: 'Nearby Origin Comps', color: 'text-muted-foreground', items: nearOrigin },
          { label: 'Nearby Destination Comps', color: 'text-muted-foreground', items: nearDest },
          { label: 'Regional Benchmarks', color: 'text-muted-foreground', items: regional },
        ];
        if (!hasExact) {
          message = 'No exact lane found — showing outbound, inbound, and nearby comps.';
        }
        break;
    }

    // Filter by equipment
    if (lookupEquipFilter !== 'all') {
      sections = sections.map(s => ({ ...s, items: s.items.filter(i => i.equipment === lookupEquipFilter) }));
    }

    // Remove empty sections
    sections = sections.filter(s => s.items.length > 0);

    const totalResults = sections.reduce((s, sec) => s + sec.items.length, 0);
    if (totalResults === 0 && !message) message = 'No matching comps found. Try broadening your search or changing lookup mode.';

    // ── Validation warnings ──
    const warnings: string[] = [];
    const totalLoadsInResults = sections.reduce((s, sec) => s + sec.items.reduce((ss, i) => ss + i.totalLoads, 0), 0);
    const missingFinancials = sections.some(sec => sec.items.some(i => i.hasMissingFinancials));
    if (missingFinancials) warnings.push('Some results include loads with missing revenue or cost data — averages may be skewed.');
    if (origin.isStateOnly || dest.isStateOnly) warnings.push('State-level search active — results include all city pairs within the state(s).');
    if (totalResults > 0 && totalLoadsInResults < 3) warnings.push('Low sample size — use these comps as directional only.');

    return { sections, hasExact, message, warnings };
    }, [lookupLoads, originInput, destInput, lookupMode, lookupEquipFilter, level]);

  // ─── Performance Table ───
  const perfTable = useMemo(() => {
    let rows = laneRows;
    if (tableFilter) {
      const term = tableFilter.toLowerCase();
      rows = rows.filter((r) => r.lane.toLowerCase().includes(term) || r.equipment.toLowerCase().includes(term));
    }
    return [...rows].sort((a, b) => {
      const getVal = (r: LaneRow): string | number | null => {
        if (tableSortKey === 'equipment') return r.equipment;
        const v = r[tableSortKey as keyof LaneRow];
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v as string | number | null;
      };
      const primary = compareNullable(getVal(a), getVal(b), tableSortDir);
      return primary !== 0 ? primary : compareNullable(a.lane, b.lane, 'asc');
    });
  }, [laneRows, tableFilter, tableSortKey, tableSortDir]);

  // ─── Problem Lanes ───
  const problemLanes = useMemo(() => {
    let rows = laneRows.filter((row) => {
      if (row.loadsCur < plMinLoads) return false;
      const hasLowMargin = (row.margin ?? 0) < plMarginThreshold;
      const hasCostRising = row.costDeltaPct != null && row.costDeltaPct > plCostThreshold;
      const hasVolumeDrop = row.loadsDelta != null && row.loadsPrev > 0 && row.loadsDelta < 0 && Math.abs(row.loadsDelta) / row.loadsPrev > 0.1;
      const hasMarginCompression = row.marginDelta != null && row.marginDelta < -2;
      return hasLowMargin || hasCostRising || hasVolumeDrop || hasMarginCompression;
    });
    if (plSearch) {
      const term = plSearch.toLowerCase();
      rows = rows.filter((r) => r.lane.toLowerCase().includes(term));
    }
    if (plSortKey === 'margin') rows.sort((a, b) => (a.margin ?? Infinity) - (b.margin ?? Infinity));
    else if (plSortKey === 'costDeltaPct') rows.sort((a, b) => (b.costDeltaPct ?? -Infinity) - (a.costDeltaPct ?? -Infinity));
    else rows.sort((a, b) => b.loadsCur - a.loadsCur);
    return rows;
  }, [laneRows, plSearch, plMinLoads, plMarginThreshold, plCostThreshold, plSortKey]);

  // ─── Cost Trend ───
  const costTrend = useMemo(() => {
    const rows = laneRows.filter((r) => r.loadsCur > 0);
    rows.sort((a, b) => {
      const primary = compareNullable(a[ctSortKey], b[ctSortKey], ctSortDir);
      if (primary !== 0) return primary;
      const byVolume = compareNullable(a.loadsCur, b.loadsCur, 'desc');
      return byVolume !== 0 ? byVolume : compareNullable(a.lane, b.lane, 'asc');
    });
    return rows.slice(0, 10);
  }, [laneRows, ctSortKey, ctSortDir]);

  const handleSort = (key: SortKey) => {
    if (tableSortKey === key) setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setTableSortKey(key); setTableSortDir(key === 'lane' || key === 'equipment' ? 'asc' : 'desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (tableSortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return tableSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const toggleExpanded = (key: string) => {
    setExpandedComps(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const sortShipments = (shipments: HistoricalShipment[]): HistoricalShipment[] => {
    const copy = [...shipments];
    switch (shipmentSort) {
      case 'revenue': return copy.sort((a, b) => b.revenue - a.revenue);
      case 'cost': return copy.sort((a, b) => b.cost - a.cost);
      case 'margin': return copy.sort((a, b) => b.margin - a.margin);
      default: return copy.sort((a, b) => b.date.localeCompare(a.date));
    }
  };

  const deltaColor = (v?: number | null) => v == null ? 'text-muted-foreground' : v > 0 ? 'text-success' : v < 0 ? 'text-destructive' : 'text-muted-foreground';
  const inverseDeltaColor = (v?: number | null) => v == null ? 'text-muted-foreground' : v > 0 ? 'text-destructive' : v < 0 ? 'text-success' : 'text-muted-foreground';
  const marginColor = (m?: number | null) => m == null ? 'text-muted-foreground' : m >= 15 ? 'text-success' : m >= 10 ? 'text-warning' : 'text-destructive';

  // ─── Comp Card Component ───
  const CompCard = ({ r }: { r: CompResult }) => {
    const compKey = `${r.lane}||${r.equipment}`;
    const isExpanded = expandedComps.has(compKey);
    const sorted = sortShipments(r.shipments);
    const displayed = isExpanded ? sorted : sorted.slice(0, 5);

    return (
      <div className="border rounded-lg bg-muted/10 overflow-hidden">
        <button
          onClick={() => toggleExpanded(compKey)}
          className="w-full text-left p-4 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span className="font-semibold text-sm">{r.lane}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                <Truck className="h-3 w-3 mr-1" />
                {r.equipment}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">{r.totalLoads} loads</span>
          </div>

          <div className="grid grid-cols-5 gap-3 ml-6">
            <div>
              <p className="text-xs text-muted-foreground">Avg Revenue</p>
              <p className="font-mono text-sm font-medium">{fmt(r.avgRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Cost</p>
              <p className="font-mono text-sm font-medium">{fmt(r.avgCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Margin</p>
              <p className={`font-mono text-sm font-medium ${marginColor(r.avgMargin)}`}>{pct(r.avgMargin)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Shipment</p>
              <p className="text-sm font-medium">
                {r.lastShipped ? formatShortDate(r.lastShipped) : '—'}
                {r.daysAgo != null && <span className="text-muted-foreground text-xs ml-1">({r.daysAgo}d ago)</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Cost / Price</p>
              <p className="font-mono text-sm">
                <span className="font-medium">{fmt(r.lastCost)}</span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="font-medium">{fmt(r.lastSell)}</span>
              </p>
            </div>
          </div>

         {(() => {
            const carriers = summarizeCarriers(r.shipments);
            if (carriers.length === 0) return null;
            const recent = carriers[0];
            return (
              <p className="text-xs text-muted-foreground mt-2 ml-6">
                <Truck className="inline h-3 w-3 mr-1 -mt-0.5" />
                {carriers.length} carrier{carriers.length > 1 ? 's' : ''} ran this lane · most recent:{' '}
                <span className="text-foreground font-medium">{recent.carrier}</span>
                {recent.lastCost != null && <> at <span className="font-mono text-foreground">{fmt(recent.lastCost)}</span></>}
                {' '}({formatShortDate(recent.lastDate)})
              </p>
            );
          })()}

          {r.hasMissingFinancials && (

            <div className="flex items-center gap-1 mt-2 ml-6">
              <Info className="h-3 w-3 text-warning" />
              <span className="text-[10px] text-warning">Some historical loads have incomplete financial data</span>
            </div>
          )}
        </button>

        {isExpanded && (
                   <div className="border-t p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Carriers on this lane ({summarizeCarriers(r.shipments).length})
            </p>
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1.5 px-2">Carrier</th>
                    <th className="text-right py-1.5 px-2">Loads</th>
                    <th className="text-left py-1.5 px-2">Last ran</th>
                    <th className="text-right py-1.5 px-2">Last cost</th>
                    <th className="text-right py-1.5 px-2">Avg cost</th>
                    <th className="text-right py-1.5 px-2">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {summarizeCarriers(r.shipments).map(c => (
                    <tr key={c.carrier} className="border-b border-border/30">
                      <td className="py-1.5 px-2 font-medium">{c.carrier}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{c.loads}</td>
                      <td className="py-1.5 px-2">{formatShortDate(c.lastDate)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{fmt(c.lastCost)}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{fmt(c.avgCost)}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
                        {c.minCost != null && c.maxCost != null && c.minCost !== c.maxCost ? `${fmt(c.minCost)} – ${fmt(c.maxCost)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">
                Historical Shipments ({r.shipments.length})
              </p>
              <Select value={shipmentSort} onValueChange={v => setShipmentSort(v as ShipmentSortKey)}>
                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Most Recent</SelectItem>
                  <SelectItem value="revenue">Highest Revenue</SelectItem>
                  <SelectItem value="cost">Highest Cost</SelectItem>
                  <SelectItem value="margin">Highest Margin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1.5 px-2">Load ID</th>
                    <th className="text-left py-1.5 px-2">Date</th>
                    <th className="text-left py-1.5 px-2">Origin</th>
                    <th className="text-left py-1.5 px-2">Destination</th>
                    <th className="text-left py-1.5 px-2">Carrier</th>
                    <th className="text-left py-1.5 px-2">Equipment</th>
                    <th className="text-right py-1.5 px-2">Revenue</th>
                    <th className="text-right py-1.5 px-2">Cost</th>
                    <th className="text-right py-1.5 px-2">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(s => (
                    <tr key={s.loadId} className="border-b border-border/30">
                      <td className="py-1.5 px-2 font-mono">{s.loadId}</td>
                      <td className="py-1.5 px-2">{formatShortDate(s.date)}</td>
                      <td className="py-1.5 px-2">{s.origin}</td>
                      <td className="py-1.5 px-2">{s.destination}</td>
                      <td className="py-1.5 px-2">{s.carrier}</td>
                      <td className="py-1.5 px-2"><Badge variant="outline" className="text-[10px] px-1 py-0">{s.equipment}</Badge></td>
                      <td className="py-1.5 px-2 text-right font-mono">{fmt(Math.round(s.revenue))}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{fmt(Math.round(s.cost))}</td>
                      <td className={`py-1.5 px-2 text-right font-mono ${marginColor(s.margin)}`}>{pct(s.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isExpanded && r.shipments.length > 5 && (
              <p className="text-xs text-muted-foreground text-center mt-2">Showing 5 of {r.shipments.length} — click to expand</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Lane Intelligence</h2>
            <DataTrustBadge level="partial" tooltip="Lane data uses first pickup → final delivery. Multi-stop intermediate stops are not treated as separate lanes. State-level and flexible searches supported." />
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Quoting research tool · {laneRows.length} unique lane-equipment combos · Supports City, State, or mixed searches
          </p>
        </div>
        <Select value={level} onValueChange={v => setLevel(v as LaneLevel)}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="city">City → City</SelectItem>
            <SelectItem value="state">State → State</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!compWindow.covered && compWindow.reason && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 border rounded-md px-3 py-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Prior columns are empty: {compWindow.reason}</span>
        </div>
      )}

      {/* 1. Lane Lookup */}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Lane Lookup
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={lookupEquipFilter} onValueChange={setLookupEquipFilter}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All Equipment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {lookupEquipOptions.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Lookup Mode Selector */}
          <div className="mt-3">
            <ToggleGroup type="single" value={lookupMode} onValueChange={v => v && setLookupMode(v as LookupMode)} className="justify-start" size="sm">
              <ToggleGroupItem value="closestMatch" className="text-xs px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Closest Match</ToggleGroupItem>
              <ToggleGroupItem value="exact" className="text-xs px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Exact Lane</ToggleGroupItem>
              <ToggleGroupItem value="originComps" className="text-xs px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Origin Comps</ToggleGroupItem>
              <ToggleGroupItem value="destComps" className="text-xs px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Destination Comps</ToggleGroupItem>
              <ToggleGroupItem value="eitherSide" className="text-xs px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Either Side</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Origin input */}
           <LocationInput
              label="Origin"
              placeholder="City, ST or State (e.g. Nogales, AZ or Texas)"
              value={originInput}
              onChange={setOriginInput}
              open={openSuggest === 'origin'}
              onOpenChange={o => setOpenSuggest(o ? 'origin' : null)}
              suggestions={filteredOriginSuggestions}
              side="origin"
              hint={originHint && (
                <>
                  {originHint.label} only shows up as a <b>destination</b> ({originHint.other} loads).{' '}
                  <button className="underline" onClick={() => { setDestInput(originHint.label); setOriginInput(destInput); }}>
                    Search it as destination
                  </button>
                </>
              )}
            />
            {/* Destination input */}
            <LocationInput
              label="Destination"
              placeholder="City, ST or State (e.g. Bronx, NY or Florida)"
              value={destInput}
              onChange={setDestInput}
              open={openSuggest === 'dest'}
              onOpenChange={o => setOpenSuggest(o ? 'dest' : null)}
              suggestions={filteredDestSuggestions}
              side="dest"
              hint={destHint && (
                <>
                  {destHint.label} only shows up as an <b>origin</b> ({destHint.other} loads).{' '}
                  <button className="underline" onClick={() => { setOriginInput(destHint.label); setDestInput(originInput); }}>
                    Search it as origin
                  </button>
                </>
              )}
            />
          </div>

          {lookupResults ? (
            <div className="space-y-5">
              {lookupResults.message && (
                <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/20 rounded-md px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {lookupResults.message}
                </div>
              )}
              {lookupResults.warnings.length > 0 && (
                <div className="space-y-1">
                  {lookupResults.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5">
                      <Info className="h-3 w-3 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
              {lookupResults.sections.map(section => (
                <div key={section.label}>
                  <h4 className={`text-xs font-semibold mb-2 ${section.color}`}>{section.label} ({section.items.length})</h4>
                  <div className="space-y-3">
                    {section.items.map(r => <CompCard key={`${r.lane}||${r.equipment}`} r={r} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (originInput.trim() || destInput.trim()) ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">No comps found for this search</p>
              <p className="text-xs text-muted-foreground mt-1">Try entering just an origin or destination, or switch to "Either Side" mode</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Enter origin and/or destination to find historical comps</p>
          )}
        </CardContent>
      </Card>

      {/* 2. Lane Performance Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lane Performance</CardTitle>
            <Input
              placeholder="Filter lanes or equipment…"
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              className="h-8 w-56 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs min-w-[2100px]">
              <thead className="sticky top-0 z-10">
                <tr className="text-muted-foreground border-b bg-muted/30">
                  {([
                    ['lane', 'Lane', 'text-left'],
                    ['equipment', 'Equipment', 'text-left'],
                    ['loadsCur', 'Loads (Cur)', 'text-right'],
                    ['loadsPrev', 'Loads (Prior)', 'text-right'],
                    ['loadsDelta', 'Δ Loads', 'text-right'],
                    ['avgCostCur', 'Avg Cost (Cur)', 'text-right'],
                    ['avgCostPrev', 'Avg Cost (Prior)', 'text-right'],
                    ['costDelta', 'Δ Cost', 'text-right'],
                    ['avgRevenueCur', 'Avg Revenue (Cur)', 'text-right'],
                    ['avgRevenuePrev', 'Avg Revenue (Prior)', 'text-right'],
                    ['revenueDelta', 'Δ Revenue', 'text-right'],
                    ['marginCur', 'Margin % (Cur)', 'text-right'],
                    ['marginPrev', 'Margin % (Prior)', 'text-right'],
                    ['marginDelta', 'Δ Margin', 'text-right'],
                    ['lastShipDate', 'Last Ship', 'text-right'],
                    ['lastCost', 'Last Cost', 'text-right'],
                    ['lastSell', 'Last Price', 'text-right'],
                    ['daysAgo', 'Days Ago', 'text-right'],
                  ] as [SortKey, string, string][]).map(([key, label, align]) => (
                    <th
                      key={key}
                      className={`${align} px-3 py-2.5 whitespace-nowrap cursor-pointer hover:text-foreground transition-colors`}
                      onClick={() => handleSort(key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label} <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">DAT Rate</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">vs Last</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">vs Avg</th>
                </tr>
              </thead>
              <tbody>
                {perfTable.map((r, i) => (
                  <tr key={`${r.lane}||${r.equipment}||${i}`} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.lane}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.equipment}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{r.loadsCur}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{r.hasPriorData ? r.loadsPrev : 'No prior'}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${deltaColor(r.loadsDelta)}`}>{fmtDeltaNumber(r.loadsDelta)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(r.avgCostCur)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{r.hasPriorData ? fmt(r.avgCostPrev) : 'No prior'}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${inverseDeltaColor(r.costDelta)}`}>
                      {r.costDelta != null ? (
                        <span>{fmtDeltaCurrency(r.costDelta)} <span className="text-muted-foreground">({r.costDeltaPct != null ? fmtDeltaPct(r.costDeltaPct) : 'n/a'})</span></span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(r.avgRevenueCur)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{r.hasPriorData ? fmt(r.avgRevenuePrev) : 'No prior'}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${deltaColor(r.revenueDelta)}`}>{fmtDeltaCurrency(r.revenueDelta)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${marginColor(r.marginCur)}`}>{pct(r.marginCur)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap ${r.hasPriorData ? marginColor(r.marginPrev) : 'text-muted-foreground'}`}>{r.hasPriorData ? pct(r.marginPrev) : 'No prior'}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${deltaColor(r.marginDelta)}`}>{fmtDeltaPct(r.marginDelta, 'pp')}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{formatShortDate(r.lastShipDate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(r.lastCost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(r.lastSell)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{r.daysAgo != null ? r.daysAgo : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        placeholder="—"
                        className="h-6 w-20 text-xs font-mono text-right inline-block"
                        value={datRates[r.lane] != null ? `$${Math.round(datRates[r.lane]).toLocaleString('en-US')}` : ''}
                        onChange={e => setDatRate(r.lane, e.target.value)}
                      />
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap ${datRates[r.lane] != null && r.lastSell != null ? (datRates[r.lane] - r.lastSell > 0 ? 'text-success' : datRates[r.lane] - r.lastSell < 0 ? 'text-destructive' : 'text-muted-foreground') : 'text-muted-foreground'}`}>
                      {datRates[r.lane] != null && r.lastSell != null ? fmtDeltaCurrency(datRates[r.lane] - r.lastSell) : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap ${datRates[r.lane] != null && r.avgRevenueCur != null ? (datRates[r.lane] - r.avgRevenueCur > 0 ? 'text-success' : datRates[r.lane] - r.avgRevenueCur < 0 ? 'text-destructive' : 'text-muted-foreground') : 'text-muted-foreground'}`}>
                      {datRates[r.lane] != null && r.avgRevenueCur != null ? fmtDeltaCurrency(datRates[r.lane] - r.avgRevenueCur) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 3. Problem Lanes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Problem Lanes
              <InfoTip text="Lanes flagged for: Low Margin (below threshold), Cost Rising (carrier cost increasing vs prior period), Volume Drop (10%+ fewer loads), or Margin Compression (margin dropped 2+ percentage points)." />
              <Badge variant="destructive" className="ml-1 text-[10px]">{problemLanes.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Input placeholder="Filter lanes…" value={plSearch} onChange={e => setPlSearch(e.target.value)} className="h-7 w-36 text-xs" />
              <Select value={plSortKey} onValueChange={v => setPlSortKey(v as typeof plSortKey)}>
                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="margin">Lowest Margin</SelectItem>
                  <SelectItem value="costDeltaPct">Highest Cost Δ</SelectItem>
                  <SelectItem value="loadsCur">Highest Loads</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Min Loads:</span>
              <Input type="number" value={plMinLoads} onChange={e => setPlMinLoads(Number(e.target.value) || 0)} className="h-6 w-14 text-xs px-1.5" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Margin &lt;</span>
              <Input type="number" value={plMarginThreshold} onChange={e => setPlMarginThreshold(Number(e.target.value) || 0)} className="h-6 w-14 text-xs px-1.5" />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Cost Δ &gt;</span>
              <Input type="number" value={plCostThreshold} onChange={e => setPlCostThreshold(Number(e.target.value) || 0)} className="h-6 w-14 text-xs px-1.5" />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {problemLanes.length > 0 ? (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead className="sticky top-0 z-10">
                  <tr className="text-muted-foreground border-b bg-muted/30">
                    <th className="text-left px-3 py-2.5">Lane</th>
                    <th className="text-left px-3 py-2.5">Equipment</th>
                    <th className="text-right px-3 py-2.5">Loads</th>
                    <th className="text-right px-3 py-2.5">Margin %</th>
                    <th className="text-right px-3 py-2.5">Avg Cost</th>
                    <th className="text-right px-3 py-2.5">Cost Δ %</th>
                    <th className="text-right px-3 py-2.5">Loads Δ</th>
                    <th className="text-left px-3 py-2.5">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {problemLanes.map((r, i) => {
                    const flags: string[] = [];
                    if ((r.margin ?? 0) < plMarginThreshold) flags.push('Low Margin');
                    if (r.costDeltaPct != null && r.costDeltaPct > plCostThreshold) flags.push('Cost Rising');
                    if (r.loadsDelta != null && r.loadsPrev > 0 && r.loadsDelta < 0 && Math.abs(r.loadsDelta) / r.loadsPrev > 0.1) flags.push('Volume Drop');
                    if (r.marginDelta != null && r.marginDelta < -2) flags.push('Margin Compression');
                    return (
                      <tr key={`${r.lane}||${i}`} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.lane}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap"><Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.equipment}</Badge></td>
                        <td className="px-3 py-2.5 text-right font-mono">{r.loadsCur}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-medium ${marginColor(r.margin)}`}>{pct(r.margin)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmt(r.avgCostCur)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-medium ${inverseDeltaColor(r.costDeltaPct)}`}>{fmtDeltaPct(r.costDeltaPct)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-medium ${deltaColor(r.loadsDelta)}`}>{fmtDeltaNumber(r.loadsDelta)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 flex-wrap">
                            {flags.map(f => (
                              <Badge key={f} variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">{f}</Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">No problem lanes match current filters</div>
          )}
        </CardContent>
      </Card>

      {/* 4. Lane Cost Trend — Top 10 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-warning" />
              Lane Cost Trend — Top 10
            </CardTitle>
            <Select value={ctSortKey} onValueChange={v => { setCtSortKey(v as typeof ctSortKey); setCtSortDir(v === 'lane' ? 'asc' : 'desc'); }}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="costDeltaPct">Highest Cost Δ %</SelectItem>
                <SelectItem value="costDelta">Highest Cost Δ $</SelectItem>
                <SelectItem value="loadsCur">Highest Volume</SelectItem>
                <SelectItem value="lane">Lane A→Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {costTrend.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1150px]">
                <thead>
                  <tr className="text-muted-foreground border-b bg-muted/30">
                    <th className="text-left px-3 py-2.5">Lane</th>
                    <th className="text-left px-3 py-2.5">Equipment</th>
                    <th className="text-right px-3 py-2.5">Loads (Cur)</th>
                    <th className="text-right px-3 py-2.5">Loads (Prior)</th>
                    <th className="text-right px-3 py-2.5">Avg Cost (Cur)</th>
                    <th className="text-right px-3 py-2.5">Avg Cost (Prior)</th>
                    <th className="text-right px-3 py-2.5">Cost Δ $</th>
                    <th className="text-right px-3 py-2.5">Cost Δ %</th>
                    <th className="text-right px-3 py-2.5">Last Ship (Cur)</th>
                    <th className="text-right px-3 py-2.5">Last Ship (Prior)</th>
                    <th className="text-right px-3 py-2.5">Days Ago</th>
                  </tr>
                </thead>
                <tbody>
                  {costTrend.map((r, i) => (
                    <tr key={`${r.lane}||${r.equipment}||${i}`} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.lane}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.equipment}</Badge></td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.loadsCur}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{r.hasPriorData ? r.loadsPrev : 'No prior'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmt(r.avgCostCur)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{r.hasPriorData ? fmt(r.avgCostPrev) : 'No prior'}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-medium ${inverseDeltaColor(r.costDelta)}`}>{fmtDeltaCurrency(r.costDelta)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-medium ${inverseDeltaColor(r.costDeltaPct)}`}>{r.costDeltaPct != null ? fmtDeltaPct(r.costDeltaPct) : r.hasPriorData ? 'n/a' : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{formatShortDate(r.lastShipDateCur)}</td>
                      <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap text-muted-foreground">{r.hasPriorData ? formatShortDate(r.lastShipDatePrev) : 'No prior'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{r.daysAgoCur != null ? r.daysAgoCur : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">No lanes match current filters</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LocationInput({
  label, placeholder, value, onChange, open, onOpenChange, suggestions, side, hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: { label: string; asOrigin: number; asDest: number }[];
  side: 'origin' | 'dest';
  hint?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const pick = (v: string) => { onChange(v); onOpenChange(false); };
  return (
    <div className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); onOpenChange(true); setActive(0); }}
          onFocus={() => onOpenChange(true)}
          // delay so a click on a suggestion lands before the list closes
          onBlur={() => setTimeout(() => onOpenChange(false), 150)}
          onKeyDown={e => {
            if (!open || suggestions.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, suggestions.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[active].label); }
            if (e.key === 'Escape') onOpenChange(false);
          }}
          className="pl-8 h-9 text-sm"
          autoComplete="off"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
          {suggestions.map((s, i) => {
            const onThisSide = side === 'origin' ? s.asOrigin : s.asDest;
            return (
              <button
                key={s.label}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(s.label)}
                className={`w-full flex items-center justify-between gap-2 text-left text-xs px-3 py-1.5 hover:bg-muted ${i === active ? "bg-muted" : ""}`}
              >
                <span>{s.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {onThisSide > 0 ? `${onThisSide} loads` : side === 'origin' ? 'destination only' : 'origin only'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {hint && <p className="text-[11px] text-warning mt-1">{hint}</p>}
    </div>
  );
}
