import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { Load, ComputedLoad, DataQuality, ViewType } from '@/types/loads';
import { computeDataQuality, parseCSV, isActiveLoad } from '@/lib/computeLoads';
import { useAuth } from '@clerk/react';
import { fetchLoadsFromApi } from '@/lib/loadsRepository';
import { normalizeCityNames } from '@/lib/cityNames';
import { getComparisonWindow, type ComparisonMode, type ComparisonWindow } from '@/lib/comparison';
import {
  type Filters, type TimeframePreset, type ViewMode,
  getPresetRange, selectLoads, teamOf, ownerOf, dedupeLoads,
} from '@/lib/filters';

export type { ComparisonMode, TimeframePreset, ViewMode, Filters };
export type DataSource = 'turvo' | 'csv' | 'none';

interface DataContextType {
  rawLoads: Load[];
  /** Current period, all filters applied. Every page uses this. */
  loads: ComputedLoad[];
  /** Comparison period, same filters. Empty when that window isn't fully synced. */
  prevLoads: ComputedLoad[];
  compWindow: ComparisonWindow;
  dataQuality: DataQuality;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  currentView: ViewType;
  setCurrentView: (v: ViewType) => void;
  importCSV: (text: string) => Promise<void>;
  importBusy: boolean;
  teams: string[];
  owners: string[];
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
  resetFilters: () => void;
  filtersActive: boolean;
}

const DataContext = createContext<DataContextType | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

const DEFAULT_PRESET: TimeframePreset = 'rolling30';
const makeDefaultFilters = (): Filters => ({
  dateRange: getPresetRange(DEFAULT_PRESET)!, // yesterday back 30 full days
  excludedTeams: [],
  owner: 'all',
  equipmentType: 'all',
  search: '',
});

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const [rawLoads, setRawLoads] = useState<Load[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>('none');
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('prior');
  const [timeframePreset, setTimeframePresetState] = useState<TimeframePreset>(DEFAULT_PRESET);
  const [viewMode, setViewMode] = useState<ViewMode>('booked');
  const [filters, setFilters] = useState<Filters>(makeDefaultFilters);
  const importBusy = false;

  const refreshLoads = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const { loads: apiLoads, lastSyncedAt: synced } = await fetchLoadsFromApi(getToken);
      // One spelling per city ("The Bronx" / "Bronx"), so a lane is never split in two (RPT-19).
      setRawLoads(normalizeCityNames(dedupeLoads(apiLoads)));
      setDataSource(apiLoads.length > 0 ? 'turvo' : 'none');
      setLastSyncedAt(synced);
      if (apiLoads.length === 0) setDataError('No Turvo loads synced yet. Run a sync from Settings.');
    } catch (err) {
      setRawLoads([]);
      setDataSource('none');
      setDataError(err instanceof Error ? err.message : 'Could not reach Turvo sync');
    } finally {
      setDataLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void refreshLoads(); }, [refreshLoads]);

  const setTimeframePreset = useCallback((preset: TimeframePreset) => {
    setTimeframePresetState(preset);
    const range = getPresetRange(preset);
    if (range) setFilters(f => ({ ...f, dateRange: range }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(makeDefaultFilters());
    setTimeframePresetState(DEFAULT_PRESET);
    setComparisonMode('prior');
    setViewMode('booked');
  }, []);

  const defaults = makeDefaultFilters();
  const filtersActive =
    filters.dateRange.start !== defaults.dateRange.start || filters.dateRange.end !== defaults.dateRange.end ||
    filters.excludedTeams.length > 0 || filters.owner !== 'all' ||
    filters.equipmentType !== 'all' || filters.search !== '' ||
    timeframePreset !== DEFAULT_PRESET || comparisonMode !== 'prior' || viewMode !== 'booked';

  const active = useMemo(() => rawLoads.filter(isActiveLoad), [rawLoads]);
  const teams = useMemo(() => [...new Set(active.map(teamOf))].sort(), [active]);
  const owners = useMemo(() => [...new Set(active.map(ownerOf))].sort((a, b) => a.localeCompare(b)), [active]);
  const equipmentTypes = useMemo(() => [...new Set(active.map(l => l.equipmentType).filter(Boolean) as string[])].sort(), [active]);

  const loads = useMemo(
    () => selectLoads(rawLoads, filters, filters.dateRange, viewMode),
    [rawLoads, filters, viewMode],
  );

  const compWindow = useMemo(
    () => getComparisonWindow(filters.dateRange, comparisonMode, rawLoads),
    [filters.dateRange, comparisonMode, rawLoads],
  );

  const prevLoads = useMemo(
    () => (compWindow.covered && compWindow.range ? selectLoads(rawLoads, filters, compWindow.range, viewMode) : []),
    [rawLoads, filters, compWindow, viewMode],
  );

  const dataQuality = useMemo(() => computeDataQuality(rawLoads), [rawLoads]);

  const importCSV = useCallback(async (text: string) => {
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      setDataError('CSV parsed to 0 loads. Check that the headers match the Turvo export columns.');
      return;
    }
    setDataError(null);
    setRawLoads(normalizeCityNames(parsed));
    setDataSource('csv');
  }, []);

  return (
    <DataContext.Provider value={{
      rawLoads, loads, prevLoads, compWindow, dataQuality, filters, setFilters,
      currentView, setCurrentView, importCSV, importBusy, teams, owners, equipmentTypes,
      comparisonMode, setComparisonMode, timeframePreset, setTimeframePreset,
      viewMode, setViewMode, dataSource, dataLoading, dataError, lastSyncedAt,
      refreshLoads, resetFilters, filtersActive,
    }}>
      {children}
    </DataContext.Provider>
  );
}
