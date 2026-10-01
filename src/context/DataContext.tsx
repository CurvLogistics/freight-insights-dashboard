import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { Load, ComputedLoad, DataQuality, ViewType } from '@/types/loads';
import { computeLoad, computeDataQuality, parseCSV } from '@/lib/computeLoads';
import { fetchLoadsFromApi } from '@/lib/loadsRepository';

export type ComparisonMode = 'prior' | 'yoy';
export type TimeframePreset = 'rolling7' | 'rolling30' | 'mtd' | 'qtd' | 'ytd' | 'custom';
export type ViewMode = 'booked' | 'locked';
export type DataSource = 'turvo' | 'csv' | 'none';

interface Filters {
  dateRange: { start: string; end: string };
  team: string;
  equipmentType: string;
  search: string;
}

interface DataContextType {
  rawLoads: Load[];
  loads: ComputedLoad[];
  dataQuality: DataQuality;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  currentView: ViewType;
  setCurrentView: (v: ViewType) => void;
  importCSV: (text: string) => Promise<void>;
  importBusy: boolean;
  teams: string[];
  equipmentTypes: string[];
  comparisonMode: ComparisonMode;
  setComparisonMode: (m: ComparisonMode) => void;
  timeframePreset: TimeframePreset;
  setTimeframePreset: (p: TimeframePreset) => void;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  dataSource: DataSource;
  dataLoading: boolean;
  dataError: string | null;
  lastSyncedAt: string | null;
  refreshLoads: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

function getPresetRange(preset: TimeframePreset, refDate: string): { start: string; end: string } | null {
  const ref = new Date(refDate);
  const end = refDate;
  switch (preset) {
    case 'rolling7': {
      const s = new Date(ref); s.setDate(s.getDate() - 6);
      return { start: s.toISOString().slice(0, 10), end };
    }
    case 'rolling30': {
      const s = new Date(ref); s.setDate(s.getDate() - 29);
      return { start: s.toISOString().slice(0, 10), end };
    }
    case 'mtd': {
      const s = new Date(ref.getFullYear(), ref.getMonth(), 1);
      return { start: s.toISOString().slice(0, 10), end };
    }
    case 'qtd': {
      const qMonth = Math.floor(ref.getMonth() / 3) * 3;
      const s = new Date(ref.getFullYear(), qMonth, 1);
      return { start: s.toISOString().slice(0, 10), end };
    }
    case 'ytd': {
      return { start: `${ref.getFullYear()}-01-01`, end };
    }
    default:
      return null;
  }
}

// End date = today, so newly synced loads are visible by default
const defaultEnd = new Date().toISOString().slice(0, 10);
const defaultStart = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [rawLoads, setRawLoads] = useState<Load[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>('none');  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('prior');
  const [timeframePreset, setTimeframePresetState] = useState<TimeframePreset>('custom');
  const [viewMode, setViewMode] = useState<ViewMode>('booked');
  const [filters, setFilters] = useState<Filters>({
    dateRange: { start: defaultStart, end: defaultEnd },
    team: 'all',
    equipmentType: 'all',
    search: '',
  });
  const importBusy = false; // CSV import is in-memory only now

const refreshLoads = useCallback(async () => {
  setDataLoading(true);
  setDataError(null);
  try {
    const { loads: apiLoads, lastSyncedAt: synced } = await fetchLoadsFromApi();
    setRawLoads(apiLoads);
    setDataSource(apiLoads.length > 0 ? 'turvo' : 'none');
    setLastSyncedAt(synced);
    if (apiLoads.length === 0) {
      setDataError('No Turvo loads synced yet. Run a sync from Settings.');
    }
  } catch (err) {
    setRawLoads([]);
    setDataSource('none');
    setDataError(err instanceof Error ? err.message : 'Could not reach Turvo sync');
  } finally {
    setDataLoading(false);
  }
}, []);

  useEffect(() => {
    void refreshLoads();
  }, [refreshLoads]);

  const setTimeframePreset = useCallback((preset: TimeframePreset) => {
    setTimeframePresetState(preset);
    if (preset !== 'custom') {
      const range = getPresetRange(preset, defaultEnd);
      if (range) setFilters(f => ({ ...f, dateRange: range }));
    }
  }, []);

  const teams = useMemo(() => [...new Set(rawLoads.map(l => l.team).filter(Boolean) as string[])], [rawLoads]);
  const equipmentTypes = useMemo(() => [...new Set(rawLoads.map(l => l.equipmentType).filter(Boolean) as string[])], [rawLoads]);

  const loads = useMemo(() => {
    let filtered = rawLoads;
    const { dateRange, team, equipmentType, search } = filters;

    if (team !== 'all') filtered = filtered.filter(l => l.team === team);
    if (equipmentType !== 'all') filtered = filtered.filter(l => l.equipmentType === equipmentType);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(l =>
        l.loadId?.toLowerCase().includes(s) ||
        l.customerName?.toLowerCase().includes(s) ||
        l.carrierName?.toLowerCase().includes(s) ||
        l.broker?.toLowerCase().includes(s) ||
        l.originCity?.toLowerCase().includes(s) ||
        l.originState?.toLowerCase().includes(s) ||
        l.destinationCity?.toLowerCase().includes(s) ||
        l.destinationState?.toLowerCase().includes(s)
      );
    }
    if (dateRange.start || dateRange.end) {
      filtered = filtered.filter(l => {
        const d = l.pickupDate || l.deliveryDate;
        if (!d) return true;
        const date = d.slice(0, 10);
        if (dateRange.start && date < dateRange.start) return false;
        if (dateRange.end && date > dateRange.end) return false;
        return true;
      });
    }

    let computed = filtered.map(computeLoad);

    if (viewMode === 'locked') {
      computed = computed.filter(l => l.simpleStatus === 'Locked');
    }

    return computed;
  }, [rawLoads, filters, viewMode]);

  const dataQuality = useMemo(() => computeDataQuality(rawLoads), [rawLoads]);

  const importCSV = useCallback(async (text: string) => {
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      setDataError('CSV parsed to 0 loads. Check that the headers match the Turvo export columns.');
      return;
    }
    setDataError(null);
    setRawLoads(parsed);
    setDataSource('csv');
  }, []);

  return (
    <DataContext.Provider value={{
      rawLoads, loads, dataQuality, filters, setFilters,
      currentView, setCurrentView, importCSV, teams, equipmentTypes,
      comparisonMode, setComparisonMode,
      timeframePreset, setTimeframePreset,
      viewMode, setViewMode,
      dataSource, dataLoading, dataError, lastSyncedAt, refreshLoads, importBusy,
    }}>
      {children}
    </DataContext.Provider>
  );
}