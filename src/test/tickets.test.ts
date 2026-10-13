import { describe, it, expect } from 'vitest';
import { computeLoad } from '@/lib/computeLoads';
import { cashItems, weeklyForecast } from '@/lib/cashflow';
import type { Load } from '@/types/loads';

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
