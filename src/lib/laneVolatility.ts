import type { Load } from '@/types/loads';
import { hasFinancials, finRev, finCost, laneOf } from '@/lib/computeLoads';

export const FLOOR_TARGET = 8;
export const STRETCH_TARGET = 12;

export const laneKey = laneOf;

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
 * Lane Volatility (formerly Quote Guidance): per-lane averages, used for daily quoting.
 * Loads arrive already filtered (including the global account-owner filter).
 */
export function buildLaneVolatility(loads: Load[], limit = 15): LaneVolatilityRow[] {
  const byLane = new Map<string, Load[]>();
  loads.forEach(l => {
    const k = laneKey(l);
    (byLane.get(k) || (byLane.set(k, []), byLane.get(k)!)).push(l);
  });
  const rows: LaneVolatilityRow[] = [];
  byLane.forEach((ls, name) => {
    const rev = ls.reduce((s, l) => s + finRev(l), 0);
    const cost = ls.reduce((s, l) => s + finCost(l), 0);
    const finCount = ls.filter(hasFinancials).length || 1;
    const avgRevenue = rev / finCount;
    const avgCost = cost / finCount;
    rows.push({
      name, loads: ls.length, avgRevenue, avgCost,
      avgMargin: avgRevenue > 0 ? ((avgRevenue - avgCost) / avgRevenue) * 100 : 0,
      quoteFloor: avgCost / (1 - FLOOR_TARGET / 100),
      quoteStretch: avgCost / (1 - STRETCH_TARGET / 100),
    });
  });
  return rows.sort((a, b) => b.loads - a.loads).slice(0, limit);
}