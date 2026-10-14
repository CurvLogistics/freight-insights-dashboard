import { describe, it, expect } from 'vitest';
import { computeLoad } from '@/lib/computeLoads';
import { cashItems, weeklyForecast } from '@/lib/cashflow';
import type { Load } from '@/types/loads';
import { isActiveLoad } from '@/lib/computeLoads';
import { buildLaneVolatility } from '@/lib/laneVolatility';

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