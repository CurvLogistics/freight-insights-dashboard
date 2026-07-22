import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { Load, ComputedLoad, DataQuality, ViewType } from '@/types/loads';
import { computeLoad, computeDataQuality, parseCSV } from '@/lib/computeLoads';
import { sampleLoads } from '@/data/sampleData';
import { fetchLoadsFromSupabase, upsertLoadsToSupabase } from '@/lib/loadsRepository';

export type ComparisonMode = 'prior' | 'yoy';
export type TimeframePreset = 'rolling7' | 'rolling30' | 'mtd' | 'qtd' | 'ytd' | 'custom';
export type ViewMode = 'booked' | 'locked';
export type DataSource = 'supabase' | 'sample' | 'csv';

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
  refreshFromSupabase: () => Promise<void>;
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

const defaultEnd = '2026-04-01';
const defaultStart = '2026-01-01';

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [rawLoads, setRawLoads] = useState<Load[]>(sampleLoads);
  const [dataSource, setDataSource] = useState<DataSource>('sample');
  const [dataLoading, setDataLoading] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
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

  const refreshFromSupabase = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const rows = await fetchLoadsFromSupabase();
      if (rows.length > 0) {
        setRawLoads(rows);
        setDataSource('supabase');
      } else {
        setRawLoads(sampleLoads);
        setDataSource('sample');
        setDataError('Supabase loads table is empty — showing embedded Turvo export. Run npm run seed:loads after applying the migration.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load from Supabase';
      setRawLoads(sampleLoads);
      setDataSource('sample');
      setDataError(message);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFromSupabase();
  }, [refreshFromSupabase]);

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
      setDataError('CSV parsed to 0 loads — check headers match Turvo export columns.');
      return;
    }

    setImportBusy(true);
    setDataError(null);
    // Show data immediately while we persist to Supabase
    setRawLoads(parsed);
    setDataSource('csv');

    try {
      await upsertLoadsToSupabase(parsed, 'turvo_export');
      setDataSource('supabase');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Turvo export to Supabase';
      setDataError(`${message} — showing imported CSV in memory only.`);
    } finally {
      setImportBusy(false);
    }
  }, []);

  return (
    <DataContext.Provider value={{
      rawLoads, loads, dataQuality, filters, setFilters,
      currentView, setCurrentView, importCSV, teams, equipmentTypes,
      comparisonMode, setComparisonMode,
      timeframePreset, setTimeframePreset,
      viewMode, setViewMode,
      dataSource, dataLoading, dataError, refreshFromSupabase, importBusy,
    }}>
      {children}
    </DataContext.Provider>
  );
}
