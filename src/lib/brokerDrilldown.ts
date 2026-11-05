import type { ComputedLoad } from '@/types/loads';
import { hasFinancials, finRev, finCost } from '@/lib/computeLoads';
import { ownerOf } from '@/lib/filters';

export interface DrillRow {
  name: string;
  loads: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  avgRevenue: number;
  avgCost: number;
}

/** A destination state with every lane that delivers there, however small. */
export interface StateRow extends DrillRow {
  lanes: DrillRow[];
}

/** Lanes are listed on their own only above this many loads; smaller ones still count in their state. */
export const MIN_LANE_LOADS = 5;

function group(loads: ComputedLoad[], key: (l: ComputedLoad) => string): DrillRow[] {
  const m = new Map<string, { loads: number; fin: number; revenue: number; cost: number }>();
  loads.forEach(l => {
    const k = key(l);
    const e = m.get(k) || { loads: 0, fin: 0, revenue: 0, cost: 0 };
    e.loads++;
    if (hasFinancials(l)) e.fin++;
    e.revenue += finRev(l);
    e.cost += finCost(l);
    m.set(k, e);
  });
  return [...m.entries()]
    .map(([name, v]) => {
      const profit = v.revenue - v.cost;
      return {
        name, loads: v.loads, revenue: v.revenue, cost: v.cost, profit,
        margin: v.revenue > 0 ? (profit / v.revenue) * 100 : 0,
        avgRevenue: v.revenue / (v.fin || 1),
        avgCost: v.cost / (v.fin || 1),
      };
    })
    .sort((a, b) => b.loads - a.loads || b.profit - a.profit);
}

export const destinationStateOf = (l: Pick<ComputedLoad, 'destinationState'>) =>
  l.destinationState?.trim().toUpperCase() || 'Unknown';

/**
 * One broker / operator's lanes, destination states and top customers, ranked by volume (load count).
 * - lanes: every lane with more than MIN_LANE_LOADS loads (no top-N cap)
 * - states: every destination state, each with all of its lanes, so small lanes still show up
 */
export function brokerDrilldown(loads: ComputedLoad[], broker: string, customerLimit = 10) {
  const mine = loads.filter(l => ownerOf(l) === broker);
  const byState = new Map<string, ComputedLoad[]>();
  for (const l of mine) {
    const s = destinationStateOf(l);
    const a = byState.get(s); if (a) a.push(l); else byState.set(s, [l]);
  }
  const states: StateRow[] = group(mine, destinationStateOf)
    .map(row => ({ ...row, lanes: group(byState.get(row.name) ?? [], l => l.lane) }));

  return {
    loads: mine,
    lanes: group(mine, l => l.lane).filter(r => r.loads > MIN_LANE_LOADS),
    states,
    customers: group(mine, l => l.customerName || 'Unknown').slice(0, customerLimit),
  };
}
