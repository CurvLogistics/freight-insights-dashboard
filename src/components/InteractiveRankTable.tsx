import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { FLOOR_TARGET, STRETCH_TARGET } from '@/lib/laneVolatility';

const fmt = (n?: number) => n != null ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
const pct = (n?: number) => n != null ? `${n.toFixed(1)}%` : '—';

export interface RankRow {
  name: string;
  loads: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

type SortKey = 'name' | 'loads' | 'revenue' | 'cost' | 'profit' | 'margin' | 'share';

/** One-click sorts shown above the table, e.g. "Top by profit" / "Worst margin" (RPT-12/13). */
export interface QuickSort { label: string; key: SortKey; dir: 'asc' | 'desc' }
export const DEFAULT_QUICK_SORTS: QuickSort[] = [
  { label: 'Top by profit', key: 'profit', dir: 'desc' },
  { label: 'Best margin', key: 'margin', dir: 'desc' },
  { label: 'Worst margin', key: 'margin', dir: 'asc' },
];

/** Same targets as Lane Volatility: red under the floor, amber up to the stretch, green above. */
export const marginClass = (m: number) =>
  m < FLOOR_TARGET ? 'text-destructive' : m < STRETCH_TARGET ? 'text-warning' : 'text-success';

interface Props {
  title: string;
  data: RankRow[];
  defaultSort: SortKey;
  defaultDir: 'asc' | 'desc';
  /** @deprecated margins are always colored now */
  highlight?: 'margin';
  /** Cap on rows; by default every row is listed and the table scrolls. */
  maxRows?: number;
  /** Profit of ALL loads in the current filters; adds a "% of Profit" column (share of what we make). */
  totalProfit?: number;
  quickSorts?: QuickSort[];
  onRowClick?: (name: string) => void;
  selectedRow?: string | null;
  /** Shown when the table has no rows before the table's own search/min-loads filters. */
  emptyMessage?: string;
  /** Explains what the table includes, e.g. how many loads are hidden by the minimum. */
  footnote?: string;
}

const columns: { key: SortKey; label: string; align: 'left' | 'right'; width?: string }[] = [
  { key: 'name', label: 'Name', align: 'left' },
  { key: 'loads', label: 'Loads', align: 'right', width: 'w-[60px]' },
  { key: 'revenue', label: 'Revenue', align: 'right', width: 'w-[100px]' },
  { key: 'cost', label: 'Cost', align: 'right', width: 'w-[100px]' },
  { key: 'profit', label: 'Profit', align: 'right', width: 'w-[100px]' },
  { key: 'margin', label: 'Margin %', align: 'right', width: 'w-[80px]' },
  { key: 'share', label: '% of Profit', align: 'right', width: 'w-[90px]' },
];

export default function InteractiveRankTable({ title, data, defaultSort, defaultDir, maxRows = Infinity, onRowClick, selectedRow, emptyMessage, footnote, totalProfit, quickSorts }: Props) {
  const showShare = totalProfit != null;
  const cols = showShare ? columns : columns.filter(c => c.key !== 'share');
  const withShare = useMemo(
    () => data.map(r => ({ ...r, share: showShare && totalProfit! > 0 ? (r.profit / totalProfit!) * 100 : 0 })),
    [data, showShare, totalProfit]);
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);
  const [nameFilter, setNameFilter] = useState('');
  const [minLoads, setMinLoads] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const filtered = useMemo(() => {
    let rows = withShare;
    if (nameFilter) {
      const s = nameFilter.toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(s));
    }
    if (minLoads && !isNaN(Number(minLoads))) {
      rows = rows.filter(r => r.loads >= Number(minLoads));
    }
    return rows;
  }, [withShare, nameFilter, minLoads]);

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return mult * a.name.localeCompare(b.name);
      return mult * ((a[sortKey] || 0) - (b[sortKey] || 0));
    }).slice(0, maxRows);
  }, [filtered, sortKey, sortDir, maxRows]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const hasActiveFilters = nameFilter || minLoads;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {quickSorts?.map(q => {
              const active = sortKey === q.key && sortDir === q.dir;
              return (
                <button key={q.label} type="button" onClick={() => { setSortKey(q.key); setSortDir(q.dir); }}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                  {q.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            {hasActiveFilters && (
              <button onClick={() => { setNameFilter(''); setMinLoads(''); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <button onClick={() => setShowFilters(f => !f)} className={`p-1 rounded hover:bg-muted/50 ${showFilters ? 'bg-muted' : ''}`}>
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
        {showFilters && (
          <div className="flex gap-2 mt-2">
            <Input placeholder="Search name..." value={nameFilter} onChange={e => setNameFilter(e.target.value)} className="h-7 text-xs flex-1" />
            <Input placeholder="Min loads" type="number" value={minLoads} onChange={e => setMinLoads(e.target.value)} className="h-7 text-xs w-20" />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="overflow-auto max-h-[440px]">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-muted-foreground text-xs border-b bg-muted/30">
                {cols.map(col => (
                  <th
                    key={col.key}
                    className={`${col.align === 'left' ? 'text-left' : 'text-right'} px-4 py-2.5 whitespace-nowrap ${col.width || ''} cursor-pointer select-none hover:text-foreground transition-colors`}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.align === 'right' && <SortIcon col={col.key} />}
                      {col.label}
                      {col.align === 'left' && <SortIcon col={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.name}
                  className={`border-b border-border/50 transition-colors ${i % 2 === 1 ? 'bg-muted/15' : ''} ${onRowClick ? 'cursor-pointer hover:bg-primary/5' : ''} ${selectedRow === r.name ? 'bg-primary/10 ring-1 ring-primary/20' : ''}`}
                  onClick={() => onRowClick?.(r.name)}
                >
                  <td className="px-4 py-2.5 font-medium text-xs max-w-[200px] truncate" title={r.name}>{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">{r.loads}</td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">{fmt(r.revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">{fmt(r.cost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">{fmt(r.profit)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono whitespace-nowrap font-medium ${marginClass(r.margin)}`}>{pct(r.margin)}</td>
                  {showShare && <td className={`px-4 py-2.5 text-right font-mono whitespace-nowrap ${r.share < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{pct(r.share)}</td>}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-muted-foreground text-xs">{data.length === 0 && emptyMessage ? emptyMessage : 'No results match filters'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-1.5 text-xs text-muted-foreground border-t">
          Showing {sorted.length} of {filtered.length} rows
          {footnote && <span className="block mt-0.5">{footnote}</span>}
        </div>
      </CardContent>
    </Card>
  );
}