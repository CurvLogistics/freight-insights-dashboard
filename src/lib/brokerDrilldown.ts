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

function group(loads: ComputedLoad[], key: (l: ComputedLoad) => string, limit: number): DrillRow[] {
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
    .sort((a, b) => b.loads - a.loads || b.profit - a.profit)
    .slice(0, limit);
}

/** Top lanes and top customers for one broker / operator, ranked by volume (load count). */
export function brokerDrilldown(loads: ComputedLoad[], broker: string, limit = 10) {
  const mine = loads.filter(l => ownerOf(l) === broker);
  return {
    loads: mine,
    lanes: group(mine, l => l.lane, limit),
    customers: group(mine, l => l.customerName || 'Unknown', limit),
  };
}