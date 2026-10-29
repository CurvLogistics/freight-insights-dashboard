import { describe, it, expect } from 'vitest';
import { computeLoad } from '@/lib/computeLoads';
import { cashItems, weeklyForecast } from '@/lib/cashflow';
import type { Load } from '@/types/loads';
import { isActiveLoad, isMissingPickup } from '@/lib/computeLoads';
import { buildLaneVolatility } from '@/lib/laneVolatility';
import { brokerDrilldown } from '@/lib/brokerDrilldown';
import { summarizeCarriers, mostRecentCarrier } from '@/lib/laneCarriers';
import { parseDelayReason, summarizeOtd } from '@/lib/delayReasons';
import { matchesFilters, selectExceptionLoads, type Filters } from '@/lib/filters';
import { toBusinessDate } from '@/lib/dates';
import { selectLoads, shipDate, matchesFocus, minRankLoads, ownerOf, aggregate, groupBy, businessToday, businessTodayDate, addDays } from '@/lib/filters';
import { laneOf } from '@/lib/computeLoads';
import { laneCompareRanges } from '@/lib/laneComparison';
import { normalizeCityNames } from '@/lib/cityNames';
import { worstCarrierOn } from '@/components/BusinessIntelligence';

const rescheduled = (extra: Partial<Load>): Load => ({
  loadId: 'T-1', serviceSource: 'turvo', shipmentStatus: 'Delivered',
  onTimeDelivery: 'Late', deliveryRescheduled: true, appointmentShiftHours: 24, ...extra,
});

const baseFilters: Filters = { dateRange: { start: '2026-10-01', end: '2026-10-07' }, excludedTeams: [], owner: 'all', equipmentType: 'all', search: '' };
const mk = (id: string, extra: Partial<Load> = {}): Load => ({
  loadId: id, shipmentStatus: 'Delivered', pickupDate: '2026-10-03', revenue: 1000, carrierCost: 800,
  originCity: 'Hutchins', originState: 'TX', destinationCity: 'Bronx', destinationState: 'NY', ...extra,
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
  const ownerFilter = (owner: string): Filters =>
    ({ dateRange: { start: '', end: '' }, excludedTeams: [], owner, equipmentType: 'all', search: '' });

  it('averages the lane for the selected owner (global owner filter)', () => {
    const rows = buildLaneVolatility(loads.filter(l => matchesFilters(l, ownerFilter('Ana'))));
    expect(rows).toHaveLength(1);
    expect(rows[0].loads).toBe(2);
    expect(rows[0].avgRevenue).toBe(1500);
    expect(rows[0].avgCost).toBe(1300);
  });
  it('returns nothing for an owner with no loads', () => {
    expect(buildLaneVolatility(loads.filter(l => matchesFilters(l, ownerFilter('Zoe'))))).toEqual([]);
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

describe('Delay reasons (tickets 13–14)', () => {
  it('parses the agreed comment format and codes', () => {
    expect(parseDelayReason('RDD / delivery appointment / product availability')).toBe('shipper');
    expect(parseDelayReason('Customer moved delivery appointment')).toBe('customer');
    expect(parseDelayReason('Truck breakdown on I-95')).toBe('carrier');
    expect(parseDelayReason('CARRIER')).toBe('carrier');
    expect(parseDelayReason('')).toBeNull();
    expect(parseDelayReason('see notes')).toBeNull();
  });

  const late = (extra: Partial<Load>): Load => ({
    loadId: 'D', serviceSource: 'turvo', onTimeDelivery: 'Late', onTimeDeliveryOriginal: 'Late', ...extra,
  });

  it('Turvo reason wins: shipper fault is excused, carrier fault is scored', () => {
    const shipper = computeLoad(late({ delayReason: 'Product not ready' }));
    expect(shipper.delayFault).toBe('shipper');
    expect(shipper.delayFaultSource).toBe('turvo');
    expect(shipper.onTimeDelivery).toBe('Excluded');

    const carrier = computeLoad(late({ delayReason: 'Driver breakdown', deliveryRescheduled: true, rescheduleReason: 'customer' }));
    expect(carrier.delayFault).toBe('carrier');
    expect(carrier.onTimeDelivery).toBe('Late');
  });

  it('a late load with no reason is the carrier\'s', () => {
    const l = computeLoad(late({}));
    expect(l.delayFault).toBe('carrier');
    expect(l.delayFaultSource).toBe('inferred');
  });

  it('shows raw and true on-time side by side', () => {
    const loads = [
      computeLoad({ loadId: '1', serviceSource: 'turvo', onTimeDelivery: 'On Time', onTimeDeliveryOriginal: 'On Time' }),
      computeLoad(late({ loadId: '2' })),
      computeLoad(late({ loadId: '3', delayReason: 'Customer RDD change' })),
      computeLoad(late({ loadId: '4', deliveryRescheduled: true, rescheduleReason: 'shipper_delay', appointmentShiftHours: 24 })),
    ];
    const s = summarizeOtd(loads);
    expect(s.rawPct).toBe(25);        // 1 of 4 on time vs. original appointment
    expect(s.truePct).toBe(50);       // 1 of 2 once customer + shipper delays are excused
    expect(s.excludedCustomer).toBe(1);
    expect(s.excludedShipper).toBe(1);
    expect(s.carrierLate).toBe(1);
  });
});

describe('QA: dates use the US business day', () => {
  it('moves a UTC timestamp after midnight back to the US evening', () => {
    expect(toBusinessDate('2026-10-08T02:30:00Z')).toBe('2026-10-07');
    expect(toBusinessDate('2026-10-08T14:00:00Z')).toBe('2026-10-08');
  });
  it('keeps plain dates and local/offset timestamps as written', () => {
    expect(toBusinessDate('2026-10-08')).toBe('2026-10-08');
    expect(toBusinessDate('2026-10-07T22:00:00-05:00')).toBe('2026-10-07');
    expect(toBusinessDate('2026-10-07T22:00:00')).toBe('2026-10-07');
  });
  it('a pickup late on the last evening stays inside the range', () => {
    const l = mk('A', { pickupDate: '2026-10-08T01:00:00Z' }); // Oct 7, 9 PM ET
    expect(shipDate(l)).toBe('2026-10-07');
    expect(selectLoads([l], baseFilters, baseFilters.dateRange, 'booked')).toHaveLength(1);
  });
});

describe('QA: Booked vs Locked use the same date and exclude cancellations', () => {
  const loads = [
    mk('B1'), mk('B2', { shipmentStatus: 'Ready for Billing' }), mk('B3', { readyToBillDate: '2026-10-05' }),
    mk('C1', { shipmentStatus: 'Cancelled' }), mk('C2', { shipmentStatus: 'Canceled - customer' }),
  ];
  it('Booked = all active loads in range; Locked = the finalized subset', () => {
    expect(selectLoads(loads, baseFilters, baseFilters.dateRange, 'booked').map(l => l.loadId)).toEqual(['B1', 'B2', 'B3']);
    expect(selectLoads(loads, baseFilters, baseFilters.dateRange, 'locked').map(l => l.loadId)).toEqual(['B2', 'B3']);
  });
});

describe('QA: lanes differing only by capitalization are one lane', () => {
  it('normalizes case and spacing', () => {
    expect(laneOf(mk('X', { originCity: 'HUTCHINS ', originState: 'tx', destinationCity: 'bronx', destinationState: 'NY' })))
      .toBe(laneOf(mk('Y')));
    expect(laneOf(mk('Y'))).toBe('Hutchins, TX → Bronx, NY');
  });
});

describe('QA: row-click focus and broker totals reconcile', () => {
  const loads = selectLoads([
    mk('1', { customerName: 'Katzman', broker: 'Jaime Morales' }),
    mk('2', { customerName: 'Katzman ', broker: ' Jaime Morales' }),
    mk('3', { customerName: 'Other', broker: '' }),
  ], baseFilters, baseFilters.dateRange, 'booked');

  it('focus matches the same names the rank tables show (trimmed, Unassigned/Unknown)', () => {
    expect(loads.filter(l => matchesFocus(l, { type: 'customer', value: 'Katzman' }))).toHaveLength(2);
    expect(loads.filter(l => matchesFocus(l, { type: 'broker', value: 'Jaime Morales' }))).toHaveLength(2);
    expect(loads.filter(l => matchesFocus(l, { type: 'broker', value: 'Unassigned' }))).toHaveLength(1);
  });
  it('broker totals add up to the overall load count and revenue', () => {
    const byBroker = [...groupBy(loads, ownerOf).values()].map(aggregate);
    expect(byBroker.reduce((s, a) => s + a.loads, 0)).toBe(aggregate(loads).loads);
    expect(byBroker.reduce((s, a) => s + a.revenue, 0)).toBe(aggregate(loads).revenue);
  });
});

describe('QA: rank-table minimum scales with the range', () => {
  it('short ranges no longer require 10 loads', () => {
    expect(minRankLoads({ start: '2026-10-01', end: '2026-10-07' })).toBe(2);
    expect(minRankLoads({ start: '2026-10-01', end: '2026-10-14' })).toBe(5);
    expect(minRankLoads({ start: '2026-09-27', end: '2026-10-26' })).toBe(10);
  });
});

describe('QA: loads missing carrier cost stay out of profit and margin', () => {
  it('counts revenue but not margin for cost-pending loads', () => {
    const a = aggregate([mk('F1'), mk('F2', { carrierCost: undefined })]);
    expect(a.loads).toBe(2);
    expect(a.revenue).toBe(2000);
    expect(a.finLoads).toBe(1);
    expect(a.margin).toBeCloseTo(20);
  });
});

describe('QA: uncovered loads (no carrier, $0 payable) are cost-pending, not 100% margin', () => {
  it('keeps revenue but leaves the load out of profit and margin', () => {
    const a = aggregate([mk('F1'), mk('U1', { carrierName: '', carrierCost: 0 })]);
    expect(a.loads).toBe(2);
    expect(a.revenue).toBe(2000);
    expect(a.finLoads).toBe(1);
    expect(a.margin).toBeCloseTo(20);
  });
});

describe('QA: days-since uses the real business date, not a fixed demo date', () => {
  it('is never negative for a recent ship date', () => {
    const today = businessTodayDate();
    const last = new Date(addDays(businessToday(), -4) + 'T00:00:00Z');
    expect(Math.round((today.getTime() - last.getTime()) / 86400000)).toBe(4);
  });
});

describe('RPT-19: city spellings merged from the data, not a fixed list', () => {
  const ld = (id: string, dest: string, st = 'NY') => mk(id, { originCity: 'Rio Rico', originState: 'AZ', destinationCity: dest, destinationState: st });
  it('merges "The Bronx" into the more common "Bronx"', () => {
    const out = normalizeCityNames([ld('1', 'Bronx'), ld('2', 'Bronx'), ld('3', 'The Bronx')]);
    expect(new Set(out.map(laneOf))).toEqual(new Set(['Rio Rico, AZ → Bronx, NY']));
  });
  it('merges St. / Saint and ignores punctuation', () => {
    const out = normalizeCityNames([ld('1', 'St. Louis', 'MO'), ld('2', 'Saint Louis', 'MO'), ld('3', 'St Louis', 'MO')]);
    expect(new Set(out.map(l => l.destinationCity)).size).toBe(1);
  });
  it('leaves a "The" city alone when no other spelling exists, and never merges across states', () => {
    const out = normalizeCityNames([ld('1', 'The Dalles', 'OR'), ld('2', 'Bronx', 'NY'), ld('3', 'The Bronx', 'TX')]);
    expect(out.map(l => l.destinationCity)).toEqual(['The Dalles', 'Bronx', 'The Bronx']);
  });
});

describe('RPT-09: Lane Comparison uses Mon–Sun weeks', () => {
  // 2026-10-28 is a Wednesday.
  it('defaults to last full week vs the week before', () => {
    const r = laneCompareRanges('lastWeek', '2026-10-28');
    expect(r.a).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(r.b).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });
  it('this week so far = Monday to yesterday, vs the same weekdays last week', () => {
    const r = laneCompareRanges('thisWeek', '2026-10-28');
    expect(r.a).toEqual({ start: '2026-10-26', end: '2026-10-27' });
    expect(r.b).toEqual({ start: '2026-10-19', end: '2026-10-20' });
  });
  it('on a Monday, this week falls back to last full week', () => {
    expect(laneCompareRanges('thisWeek', '2026-10-26')).toEqual(laneCompareRanges('lastWeek', '2026-10-26'));
  });
  it('on a Sunday, last week is the week that ended a week ago', () => {
    expect(laneCompareRanges('lastWeek', '2026-11-01').a).toEqual({ start: '2026-10-19', end: '2026-10-25' });
  });
});

describe('Carrier Action Needed: worst carrier per lane', () => {
  it('picks the carrier with the lowest margin, ignoring loads without cost', () => {
    const ls = [
      mk('A1', { carrierName: 'GOOD CO', revenue: 1000, carrierCost: 800 }),
      mk('B1', { carrierName: 'BAD CO', revenue: 1000, carrierCost: 950 }),
      mk('B2', { carrierName: 'BAD CO', revenue: 1000, carrierCost: 970 }),
      mk('C1', { carrierName: 'NO COST', revenue: 1000, carrierCost: undefined }),
    ].map(computeLoad);
    const w = worstCarrierOn(ls)!;
    expect(w.name).toBe('BAD CO');
    expect(w.loads).toBe(2);
    expect(w.margin).toBeCloseTo(4);
  });
});

describe('QA: CL-27084 — uncovered loads stay in Exception Center in either view', () => {
  const uncovered = mk('CL-27084', { shipmentStatus: 'Tendered', carrierName: '', carrierCost: 0, revenue: 3200 });
  const loads = [uncovered, mk('B2', { shipmentStatus: 'Ready for Billing', carrierName: 'PRIME INC' }), mk('C1', { shipmentStatus: 'Canceled' })];
  it('the Locked view drops it, Exception Center does not', () => {
    expect(selectLoads(loads, baseFilters, baseFilters.dateRange, 'locked').map(l => l.loadId)).not.toContain('CL-27084');
    expect(selectExceptionLoads(loads, baseFilters).map(l => l.loadId)).toEqual(['CL-27084', 'B2']);
  });
  it('is flagged as missing carrier and does not count as 100% margin', () => {
    const [l] = selectExceptionLoads([uncovered], baseFilters);
    expect(l.carrierName).toBeFalsy();
    expect(l.marginPercent).toBeUndefined();
  });
});