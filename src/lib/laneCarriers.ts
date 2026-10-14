export type CarrierSortKey = 'loads' | 'lastDate' | 'lastCost' | 'avgCost';
export type CarrierSortDir = 'asc' | 'desc';

/** The fields of a lane shipment the carrier summary needs. */
export interface CarrierShipment {
  carrier: string;
  date: string;
  cost: number;
  hasCost: boolean;
}

export interface CarrierOnLane {
  carrier: string; loads: number; lastDate: string;
  lastCost: number | null; avgCost: number | null; minCost: number | null; maxCost: number | null;
}

/** Missing values always sort last, in either direction. */
function compare(a: string | number | null, b: string | number | null, dir: CarrierSortDir): number {
  const aMissing = a == null || a === '';
  const bMissing = b == null || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === 'string' && typeof b === 'string') return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  return dir === 'asc' ? Number(a) - Number(b) : Number(b) - Number(a);
}

/** Who ran this lane and what we paid them. Default order: most loads first. */
export function summarizeCarriers(
  shipments: CarrierShipment[],
  sortKey: CarrierSortKey = 'loads',
  sortDir: CarrierSortDir = 'desc',
): CarrierOnLane[] {
  const m = new Map<string, CarrierShipment[]>();
  shipments.forEach(s => m.set(s.carrier, [...(m.get(s.carrier) ?? []), s]));
  const rows = [...m.entries()].map(([carrier, list]) => {
    const byDate = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const costs = list.filter(s => s.hasCost).map(s => s.cost);
    const lastWithCost = byDate.find(s => s.hasCost);
    return {
      carrier, loads: list.length, lastDate: byDate[0]?.date ?? '',
      lastCost: lastWithCost ? lastWithCost.cost : null,
      avgCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
      minCost: costs.length ? Math.min(...costs) : null,
      maxCost: costs.length ? Math.max(...costs) : null,
    };
  });
  // Tie-breakers: more loads, then most recent
  return rows.sort((a, b) =>
    compare(a[sortKey], b[sortKey], sortDir) || b.loads - a.loads || b.lastDate.localeCompare(a.lastDate));
}

/** The carrier who ran the lane most recently (for the one-line summary). */
export function mostRecentCarrier(carriers: CarrierOnLane[]): CarrierOnLane | undefined {
  return carriers.reduce<CarrierOnLane | undefined>((best, c) => (!best || c.lastDate > best.lastDate ? c : best), undefined);
}