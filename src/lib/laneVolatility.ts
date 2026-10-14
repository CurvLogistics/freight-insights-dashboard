import type { Load } from '@/types/loads';

export const FLOOR_TARGET = 8;
export const STRETCH_TARGET = 12;

export const laneKey = (l: Load) =>
  `${l.originCity || '?'}, ${l.originState || '?'} → ${l.destinationCity || '?'}, ${l.destinationState || '?'}`;

export interface LaneVolatilityRow {
  name: string;
  loads: number;
  avgRevenue: number;
  avgCost: number;
  avgMargin: number;
  quoteFloor: number;
  quoteStretch: number;
}

/**
 * Lane Volatility (formerly Quote Guidance): per-lane averages for one account owner's
 * own loads, used for daily quoting. `owner` = the load's broker / account owner.
 */
export function buildLaneVolatility(loads: Load[], owner: string, limit = 15): LaneVolatilityRow[] {
  const byLane = new Map<string, Load[]>();
  loads.forEach(l => {
    if ((l.broker || '') !== owner) return;
    const k = laneKey(l);
    (byLane.get(k) || (byLane.set(k, []), byLane.get(k)!)).push(l);
  });
  const rows: LaneVolatilityRow[] = [];
  byLane.forEach((ls, name) => {
    const rev = ls.reduce((s, l) => s + (l.revenue || 0), 0);
    const cost = ls.reduce((s, l) => s + (l.carrierCost || 0), 0);
    const avgRevenue = rev / ls.length;
    const avgCost = cost / ls.length;
    rows.push({
      name, loads: ls.length, avgRevenue, avgCost,
      avgMargin: avgRevenue > 0 ? ((avgRevenue - avgCost) / avgRevenue) * 100 : 0,
      quoteFloor: avgCost / (1 - FLOOR_TARGET / 100),
      quoteStretch: avgCost / (1 - STRETCH_TARGET / 100),
    });
  });
  return rows.sort((a, b) => b.loads - a.loads).slice(0, limit);
}