import { useData } from '@/context/DataContext';
import { ViewType } from '@/types/loads';
import { LayoutDashboard, Truck, MapPin, Users, AlertTriangle, Upload, Search, UserCheck, Building2, Lightbulb, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRef } from 'react';

const navItems: { id: ViewType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Executive Overview', icon: LayoutDashboard },
  { id: 'productivity', label: 'Productivity', icon: Users },
  { id: 'service', label: 'Service Performance', icon: Truck },
  { id: 'lanes', label: 'Lane Intelligence', icon: MapPin },
  { id: 'customer-scorecard', label: 'Customer Scorecard', icon: Building2 },
  { id: 'carrier-scorecard', label: 'Carrier Scorecard', icon: UserCheck },
  { id: 'exceptions', label: 'Exception Center', icon: AlertTriangle },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const {
    currentView, setCurrentView, filters, setFilters, importCSV,
    teams, equipmentTypes, comparisonMode, setComparisonMode,
    timeframePreset, setTimeframePreset, viewMode, setViewMode,
  } = useData();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCSV(reader.result as string);
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
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm bg-sidebar-primary/20 text-sidebar-primary hover:bg-sidebar-primary/30 transition-colors font-medium"
          >
            <Upload className="w-4 h-4" />
            Import CSV
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
            <Input
              type="date"
              value={filters.dateRange.start}
              onChange={e => {
                setTimeframePreset('custom' as any);
                setFilters(f => ({ ...f, dateRange: { ...f.dateRange, start: e.target.value } }));
              }}
              className="h-9 w-36 text-xs"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={filters.dateRange.end}
              onChange={e => {
                setTimeframePreset('custom' as any);
                setFilters(f => ({ ...f, dateRange: { ...f.dateRange, end: e.target.value } }));
              }}
              className="h-9 w-36 text-xs"
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
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
