import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X, AlertTriangle, TrendingDown, UserMinus } from 'lucide-react';

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export interface ComparisonRow {
  name: string;
  loadsCur: number;
  loadsPrev: number;
  revenueCur: number;
  revenuePrev: number;
  profitCur: number;
  profitPrev: number;
  marginCur: number;
  marginPrev: number;
}

interface EnrichedRow extends ComparisonRow {
  loadsDelta: number;
  revenueDelta: number;
  profitDelta: number;
  marginDelta: number;
  section: 'lost' | 'declining' | 'growing';
  flags: string[];
}

type SortKey = 'name' | 'loadsCur' | 'loadsPrev' | 'loadsDelta' | 'revenueCur' | 'revenuePrev' | 'revenueDelta' | 'profitCur' | 'profitPrev' | 'profitDelta' | 'marginCur' | 'marginPrev' | 'marginDelta';

interface Props {
  title: string;
  data: ComparisonRow[];
  maxRows?: number;
  onRowClick?: (name: string) => void;
  selectedRow?: string | null;
}

function deltaColor(v: number) {
  if (Math.abs(v) < 0.01) return 'text-muted-foreground';
  return v > 0 ? 'text-success' : 'text-destructive';
}

function classifyRow(r: { loadsCur: number; loadsPrev: number; loadsDelta: number; profitDelta: number }): 'lost' | 'declining' | 'growing' {
  if (r.loadsPrev > 0 && r.loadsCur === 0) return 'lost';
  if (r.loadsDelta < 0 || r.profitDelta < 0) return 'declining';
  return 'growing';
}

function getFlags(r: EnrichedRow): string[] {
  const flags: string[] = [];
  if (r.loadsPrev > 0 && r.loadsCur === 0) flags.push('Lost Volume');
  if (r.marginDelta < -2) flags.push('Margin Compression');
  if (r.profitDelta < 0 && r.loadsCur > 0) flags.push('Profit Down');
  return flags;
}

const sectionOrder = { lost: 0, declining: 1, growing: 2 };
const sectionLabels = { lost: 'Lost', declining: 'Declining', growing: 'Growing' };
const sectionColors = {
  lost: 'bg-destructive/10 text-destructive',
  declining: 'bg-warning/10 text-warning-foreground',
  growing: 'bg-success/10 text-success',
};
const sectionIcons = { lost: UserMinus, declining: TrendingDown, growing: ArrowUp };

export default function ComparisonRankTable({ title, data, maxRows = 50, onRowClick, selectedRow }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('profitDelta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [nameFilter, setNameFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const enriched = useMemo(() =>
    data.map(r => {
      const loadsDelta = r.loadsCur - r.loadsPrev;
      const revenueDelta = r.revenueCur - r.revenuePrev;
      const profitDelta = r.profitCur - r.profitPrev;
      const marginDelta = r.marginCur - r.marginPrev;
      const base: EnrichedRow = { ...r, loadsDelta, revenueDelta, profitDelta, marginDelta, section: 'growing', flags: [] };
      base.section = classifyRow(base);
      base.flags = getFlags(base);
      return base;
    }),
  [data]);

  const filtered = useMemo(() => {
    if (!nameFilter) return enriched;
    const s = nameFilter.toLowerCase();
    return enriched.filter(r => r.name.toLowerCase().includes(s));
  }, [enriched, nameFilter]);

  // Summary totals
  const summary = useMemo(() => ({
    loadsDelta: filtered.reduce((s, r) => s + (r.loadsCur - r.loadsPrev), 0),
    revenueDelta: filtered.reduce((s, r) => s + (r.revenueCur - r.revenuePrev), 0),
    profitDelta: filtered.reduce((s, r) => s + (r.profitCur - r.profitPrev), 0),
    lostCount: filtered.filter(r => r.section === 'lost').length,
    decliningCount: filtered.filter(r => r.section === 'declining').length,
    growingCount: filtered.filter(r => r.section === 'growing').length,
  }), [filtered]);

  const sorted = useMemo(() => {
    const mult = sortKey === 'profitDelta' && sortDir === 'asc' ? 1 : (sortDir === 'asc' ? 1 : -1);
    return [...filtered].sort((a, b) => {
      // Primary: section order
      const secDiff = sectionOrder[a.section] - sectionOrder[b.section];
      if (secDiff !== 0) return secDiff;
      // Secondary: user-selected sort
      if (sortKey === 'name') return mult * a.name.localeCompare(b.name);
      return mult * ((a[sortKey] as number || 0) - (b[sortKey] as number || 0));
    }).slice(0, maxRows);
  }, [filtered, sortKey, sortDir, maxRows]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const cols: { key: SortKey; label: string; group: string }[] = [
    { key: 'loadsCur', label: 'Cur', group: 'Loads' },
    { key: 'loadsPrev', label: 'Prev', group: 'Loads' },
    { key: 'loadsDelta', label: 'Δ', group: 'Loads' },
    { key: 'revenueCur', label: 'Cur', group: 'Revenue' },
    { key: 'revenuePrev', label: 'Prev', group: 'Revenue' },
    { key: 'revenueDelta', label: 'Δ', group: 'Revenue' },
    { key: 'profitCur', label: 'Cur', group: 'Profit' },
    { key: 'profitPrev', label: 'Prev', group: 'Profit' },
    { key: 'profitDelta', label: 'Δ', group: 'Profit' },
    { key: 'marginCur', label: 'Cur', group: 'Margin' },
    { key: 'marginPrev', label: 'Prev', group: 'Margin' },
    { key: 'marginDelta', label: 'Δ pp', group: 'Margin' },
  ];

  const groups = [
    { label: 'Loads', span: 3 },
    { label: 'Revenue', span: 3 },
    { label: 'Profit', span: 3 },
    { label: 'Margin', span: 3 },
  ];

  // Render section headers inline
  let lastSection: string | null = null;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-1">
            {nameFilter && (
              <button onClick={() => setNameFilter('')} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <button onClick={() => setShowFilters(f => !f)} className={`p-1 rounded hover:bg-muted/50 ${showFilters ? 'bg-muted' : ''}`}>
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
        {showFilters && (
          <div className="mt-2">
            <Input placeholder="Search name..." value={nameFilter} onChange={e => setNameFilter(e.target.value)} className="h-7 text-xs" />
          </div>
        )}
        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          <span className={deltaColor(summary.loadsDelta)}>
            Loads Δ: {summary.loadsDelta > 0 ? '+' : ''}{summary.loadsDelta}
          </span>
          <span className={deltaColor(summary.revenueDelta)}>
            Revenue Δ: {summary.revenueDelta >= 0 ? '+' : ''}{fmt(summary.revenueDelta)}
          </span>
          <span className={deltaColor(summary.profitDelta)}>
            Profit Δ: {summary.profitDelta >= 0 ? '+' : ''}{fmt(summary.profitDelta)}
          </span>
          <span className="text-muted-foreground">
            Lost: {summary.lostCount} · Declining: {summary.decliningCount} · Growing: {summary.growingCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-3 py-1.5 text-muted-foreground" rowSpan={2}
                  onClick={() => handleSort('name')}
                  style={{ cursor: 'pointer', minWidth: 160 }}>
                  <span className="inline-flex items-center gap-1">Name <SortIcon col="name" /></span>
                </th>
                <th rowSpan={2} className="text-center px-1 py-1 text-muted-foreground font-semibold border-l border-border/50" style={{ minWidth: 60 }}>Flags</th>
                {groups.map(g => (
                  <th key={g.label} colSpan={g.span} className="text-center px-1 py-1 text-muted-foreground border-l border-border/50 font-semibold">{g.label}</th>
                ))}
              </tr>
              <tr className="bg-muted/30 border-b">
                {cols.map(col => (
                  <th
                    key={col.key}
                    className="text-right px-2 py-1.5 whitespace-nowrap cursor-pointer select-none hover:text-foreground text-muted-foreground border-l border-border/30"
                    onClick={() => handleSort(col.key)}
                    style={{ minWidth: col.key.includes('Delta') ? 65 : 65 }}
                  >
                    <span className="inline-flex items-center gap-0.5 justify-end">
                      <SortIcon col={col.key} />
                      {col.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const rows: React.ReactNode[] = [];
                // Section header
                if (r.section !== lastSection) {
                  lastSection = r.section;
                  const Icon = sectionIcons[r.section];
                  rows.push(
                    <tr key={`section-${r.section}`} className={`${sectionColors[r.section]} border-y border-border/50`}>
                      <td colSpan={14} className="px-3 py-1.5 font-semibold text-xs flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        {sectionLabels[r.section]}
                      </td>
                    </tr>
                  );
                }
                rows.push(
                  <tr
                    key={r.name}
                    className={`border-b border-border/50 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-primary/5' : ''} ${selectedRow === r.name ? 'bg-primary/10 ring-1 ring-primary/20' : ''}`}
                    onClick={() => onRowClick?.(r.name)}
                  >
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate" title={r.name}>{r.name}</td>
                    <td className="px-1 py-1 border-l border-border/30">
                      <div className="flex flex-wrap gap-0.5">
                        {r.flags.map(f => (
                          <Badge key={f} variant="outline" className={`text-[10px] px-1 py-0 leading-tight ${f === 'Lost Volume' ? 'border-destructive/40 text-destructive' : f === 'Margin Compression' ? 'border-warning/40 text-warning-foreground' : 'border-destructive/30 text-destructive'}`}>
                            {f === 'Lost Volume' && <UserMinus className="w-2.5 h-2.5 mr-0.5" />}
                            {f === 'Margin Compression' && <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />}
                            {f === 'Profit Down' && <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    {/* Loads */}
                    <td className="px-2 py-2 text-right font-mono border-l border-border/30">{r.loadsCur}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{r.loadsPrev}</td>
                    <td className={`px-2 py-2 text-right font-mono font-semibold ${deltaColor(r.loadsDelta)}`}>
                      {r.loadsDelta > 0 ? '+' : ''}{r.loadsDelta}
                    </td>
                    {/* Revenue */}
                    <td className="px-2 py-2 text-right font-mono border-l border-border/30">{fmt(r.revenueCur)}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmt(r.revenuePrev)}</td>
                    <td className={`px-2 py-2 text-right font-mono font-semibold ${deltaColor(r.revenueDelta)}`}>
                      {r.revenueDelta >= 0 ? '+' : ''}{fmt(r.revenueDelta)}
                    </td>
                    {/* Profit */}
                    <td className="px-2 py-2 text-right font-mono border-l border-border/30">{fmt(r.profitCur)}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmt(r.profitPrev)}</td>
                    <td className={`px-2 py-2 text-right font-mono font-semibold ${deltaColor(r.profitDelta)}`}>
                      {r.profitDelta >= 0 ? '+' : ''}{fmt(r.profitDelta)}
                    </td>
                    {/* Margin */}
                    <td className="px-2 py-2 text-right font-mono border-l border-border/30">{pct(r.marginCur)}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{pct(r.marginPrev)}</td>
                    <td className={`px-2 py-2 text-right font-mono font-semibold ${deltaColor(r.marginDelta)}`}>
                      {r.marginDelta >= 0 ? '+' : ''}{r.marginDelta.toFixed(1)}
                    </td>
                  </tr>
                );
                return rows;
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={14} className="px-4 py-6 text-center text-muted-foreground">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-1.5 text-xs text-muted-foreground border-t">
          Showing {sorted.length} of {filtered.length} rows
        </div>
      </CardContent>
    </Card>
  );
}
