import { useData } from '@/context/DataContext';
import { ViewType } from '@/types/loads';
import { LayoutDashboard, Truck, MapPin, Users, AlertTriangle, Upload, Search, UserCheck, Building2, Lightbulb, Settings, X, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRef } from 'react';
import AskClaude from '@/components/AskClaude';
import DateInputUS from '@/components/DateInputUS';

const navItems: { id: ViewType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Executive Overview', icon: LayoutDashboard },
  { id: 'productivity', label: 'Productivity', icon: Users },
  { id: 'service', label: 'Service Performance', icon: Truck },
  { id: 'lanes', label: 'Lane Intelligence', icon: MapPin },
  { id: 'customer-scorecard', label: 'Customer Scorecard', icon: Building2 },
  { id: 'carrier-scorecard', label: 'Carrier Scorecard', icon: UserCheck },
  { id: 'cash-flow', label: 'Cash Flow', icon: Wallet },
  { id: 'exceptions', label: 'Exception Center', icon: AlertTriangle },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const {
    currentView, setCurrentView, filters, setFilters, importCSV,
    teams, equipmentTypes, comparisonMode, setComparisonMode,
    timeframePreset, setTimeframePreset, viewMode, setViewMode,
    dataSource, dataLoading, dataError, refreshLoads, rawLoads, importBusy,
    resetFilters, filtersActive,
  } = useData();

  const sourceLabel =
  dataLoading ? 'Loading…' :
  dataSource === 'turvo' ? `Turvo · ${rawLoads.length.toLocaleString('en-US')} loads` :
  dataSource === 'csv' ? `CSV import · ${rawLoads.length.toLocaleString('en-US')} loads` :
  'No data, open Settings';

  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void importCSV(reader.result as string);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar flex flex-col shrink-0">
        <div className="p-5 border-b border-sidebar-border">
          <h1 className="text-lg font-bold text-sidebar-primary-foreground flex items-center gap-2">
            <Truck className="w-5 h-5 text-sidebar-primary" />
            <span className="text-sidebar-foreground">FreightOps</span>
          </h1>
          <p className="text-xs text-sidebar-foreground/50 mt-1">Logistics Intelligence</p>
          <button
            type="button"
            title={dataError ?? 'Refresh data'}
           onClick={() => void refreshLoads()}
            className={`mt-2 w-full text-left text-[11px] leading-snug rounded px-2 py-1.5 transition-colors ${
              dataSource === 'turvo'
                ? 'bg-emerald-500/15 text-emerald-300'
                : dataError
                  ? 'bg-amber-500/15 text-amber-200'
                  : 'bg-sidebar-accent/40 text-sidebar-foreground/60'
            }`}
          >
            {sourceLabel}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setCurrentView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                currentView === id
                  ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importBusy || dataLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-sidebar-primary/20 text-sidebar-primary hover:bg-sidebar-primary/30 transition-colors font-medium disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importBusy ? 'Importing…' : 'Import Turvo CSV'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <header className="bg-card border-b px-6 py-3 flex items-center gap-3 shrink-0 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search loads, customers, carriers, cities..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="pl-9 h-9"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Timeframe Preset */}
            <Select value={timeframePreset} onValueChange={v => setTimeframePreset(v as any)}>
              <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rolling7">Rolling 7</SelectItem>
                <SelectItem value="rolling30">Rolling 30</SelectItem>
                <SelectItem value="mtd">MTD</SelectItem>
                <SelectItem value="qtd">QTD</SelectItem>
                <SelectItem value="ytd">YTD</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom date range (always visible for reference, editable when custom) */}
                    <DateInputUS
              value={filters.dateRange.start}
              onChange={iso => {
                setTimeframePreset('custom');
                setFilters(f => ({ ...f, dateRange: { ...f.dateRange, start: iso } }));
              }}
              className="w-36"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <DateInputUS
              value={filters.dateRange.end}
              onChange={iso => {
                setTimeframePreset('custom');
                setFilters(f => ({ ...f, dateRange: { ...f.dateRange, end: iso } }));
              }}
              className="w-36"
            />

            {/* Compare Mode */}
            <Select value={comparisonMode} onValueChange={v => setComparisonMode(v as any)}>
              <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prior">Prior Period</SelectItem>
                <SelectItem value="yoy">Same Period Last Year</SelectItem>
              </SelectContent>
            </Select>

            {/* View Mode: Booked vs Locked */}
            <Select value={viewMode} onValueChange={v => setViewMode(v as any)}>
              <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
              </SelectContent>
            </Select>

            {/* Team */}
            <Select value={filters.team} onValueChange={v => setFilters(f => ({ ...f, team: v }))}>
              <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Equipment */}
            <Select value={filters.equipmentType} onValueChange={v => setFilters(f => ({ ...f, equipmentType: v }))}>
              <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Equipment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Equipment</SelectItem>
                {equipmentTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            <button
              type="button"
              onClick={resetFilters}
              disabled={!filtersActive}
              className="h-9 flex items-center gap-1.5 px-3 rounded-md border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <X className="w-3.5 h-3.5" />
              Clear filters
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>

      <AskClaude />
    </div>
  );
}
