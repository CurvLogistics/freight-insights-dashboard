import { describe, it, expect } from 'vitest';
import { computeLoad } from '@/lib/computeLoads';
import { cashItems, weeklyForecast } from '@/lib/cashflow';
import type { Load } from '@/types/loads';
import { isActiveLoad, isMissingPickup } from '@/lib/computeLoads';
import { buildLaneVolatility } from '@/lib/laneVolatility';
import { brokerDrilldown } from '@/lib/brokerDrilldown';
import { summarizeCarriers, mostRecentCarrier } from '@/lib/laneCarriers';

const rescheduled = (extra: Partial<Load>): Load => ({
  loadId: 'T-1', serviceSource: 'turvo', shipmentStatus: 'Delivered',
  onTimeDelivery: 'Late', deliveryRescheduled: true, appointmentShiftHours: 24, ...extra,
});

describe('reschedules and on-time %', () => {
  it('excludes customer reschedules', () => {
    const l = computeLoad(rescheduled({ rescheduleReason: 'customer' }));
    expect(l.onTimeDelivery).toBe('Excluded');
    expect(l.onTimeDeliveryRaw).toBe('Late');
    expect(l.excludedFromOnTime).toBe(true);
  });

  it('still scores carrier reschedules', () => {
    const l = computeLoad(rescheduled({ rescheduleReason: 'carrier' }));
    expect(l.onTimeDelivery).toBe('Late');
    expect(l.excludedFromOnTime).toBe(false);
  });
});

describe('weeklyForecast', () => {
  it('puts a due date in the right week and past dates in overdue', () => {
    const asOf = '2026-10-14'; // Wednesday, so week 1 starts Monday 10/12
    const loads: Load[] = [
      { loadId: 'A', shipmentStatus: 'Delivered', arInvoiceAmount: 1000, arOpenBalance: 1000, arPaid: false, arDueDate: '2026-10-22' },
      { loadId: 'B', shipmentStatus: 'Delivered', arInvoiceAmount: 500, arOpenBalance: 500, arPaid: false, arDueDate: '2026-10-01' },
    ];
    const fc = weeklyForecast(cashItems(loads, 'ar', asOf), [], 4, asOf);
    expect(fc.buckets[0].weekStart).toBe('2026-10-12');
    expect(fc.buckets[1].ar).toBe(1000);
    expect(fc.overdueAr).toBe(500);
  });
});

describe('isActiveLoad (Business Health load count)', () => {
  it('excludes canceled loads regardless of spelling/casing', () => {
    for (const s of ['Canceled', 'Cancelled', 'CANCELED', ' canceled ', 'Canceled - customer', 'Draft', 'draft']) {
      expect(isActiveLoad({ shipmentStatus: s })).toBe(false);
    }
  });
  it('keeps live loads', () => {
    for (const s of ['Completed', 'Processing', 'Tendered', 'En route', undefined]) {
      expect(isActiveLoad({ shipmentStatus: s })).toBe(true);
    }
  });
});

describe('Lane Volatility', () => {
  const lane = { originCity: 'Miami', originState: 'FL', destinationCity: 'Atlanta', destinationState: 'GA' };
  const loads: Load[] = [
    { loadId: '1', broker: 'Ana', revenue: 1000, carrierCost: 900, ...lane },
    { loadId: '2', broker: 'Ana', revenue: 2000, carrierCost: 1700, ...lane },
    { loadId: '3', broker: 'Ben', revenue: 5000, carrierCost: 1000, ...lane },
  ];
  it('only includes the selected owner and reports load count', () => {
    const rows = buildLaneVolatility(loads, 'Ana');
    expect(rows).toHaveLength(1);
    expect(rows[0].loads).toBe(2);
    expect(rows[0].avgRevenue).toBe(1500);
    expect(rows[0].avgCost).toBe(1300);
  });
  it('returns nothing for an owner with no loads', () => {
    expect(buildLaneVolatility(loads, 'Zoe')).toEqual([]);
  });
});

describe('Missing Pickup', () => {
  const now = '2026-10-14T12:00:00Z';
  const base: Load = { loadId: 'P', serviceSource: 'turvo', pickupDate: '2026-10-13', scheduledPickupDate: '2026-10-13T12:00:00Z' };
  it('flags a past pickup with no arrival', () => {
    expect(isMissingPickup(base, now)).toBe(true);
  });
  it('ignores pickups that have an arrival', () => {
    expect(isMissingPickup({ ...base, pickupArrival: '2026-10-13T13:00:00Z' }, now)).toBe(false);
  });
  it('ignores future pickups', () => {
    expect(isMissingPickup({ ...base, scheduledPickupDate: '2026-10-15T12:00:00Z' }, now)).toBe(false);
  });
});

describe('Productivity drill-down', () => {
  const mk = (id: string, broker: string, lane: string, customerName: string, revenue: number, carrierCost: number) =>
    computeLoad({ loadId: id, broker, customerName, revenue, carrierCost,
      originCity: lane, originState: 'FL', destinationCity: 'Atlanta', destinationState: 'GA' });
  const loads = [
    mk('1', 'Ana', 'Miami', 'Acme', 1000, 900),
    mk('2', 'Ana', 'Miami', 'Acme', 1200, 1000),
    mk('3', 'Ana', 'Tampa', 'Beta', 2000, 1500),
    mk('4', 'Ben', 'Miami', 'Acme', 5000, 1000),
  ];
  it('ranks the operator\'s own lanes and customers by volume', () => {
    const d = brokerDrilldown(loads, 'Ana');
    expect(d.loads).toHaveLength(3);
    expect(d.lanes[0]).toMatchObject({ name: 'Miami, FL → Atlanta, GA', loads: 2, revenue: 2200, profit: 300 });
    expect(d.customers.map(c => [c.name, c.loads])).toEqual([['Acme', 2], ['Beta', 1]]);
  });
});


describe('Lane Intelligence carrier table', () => {
  const ship = (carrier: string, date: string, cost: number | null) =>
    ({ carrier, date, cost: cost ?? 0, hasCost: cost != null });
  const shipments = [
    ship('Alpha', '2026-10-10', 1000),
    ship('Beta', '2026-09-01', 900), ship('Beta', '2026-09-05', 1100), ship('Beta', '2026-09-20', 1300),
    ship('Gamma', '2026-08-01', null),
  ];
  it('defaults to highest volume first', () => {
    expect(summarizeCarriers(shipments).map(c => c.carrier)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });
  it('sorts by last run and cost both ways, missing cost last', () => {
    expect(summarizeCarriers(shipments, 'lastDate', 'desc').map(c => c.carrier)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(summarizeCarriers(shipments, 'lastDate', 'asc').map(c => c.carrier)).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(summarizeCarriers(shipments, 'lastCost', 'asc').map(c => c.carrier)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(summarizeCarriers(shipments, 'avgCost', 'desc').map(c => c.carrier)).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(summarizeCarriers(shipments, 'loads', 'asc').map(c => c.carrier)).toEqual(['Alpha', 'Gamma', 'Beta']);
  });
  it('still finds the most recent carrier for the summary line', () => {
    expect(mostRecentCarrier(summarizeCarriers(shipments))?.carrier).toBe('Alpha');
  });
});