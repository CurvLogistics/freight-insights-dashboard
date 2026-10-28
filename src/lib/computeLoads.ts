import { Load, ComputedLoad, DataQuality, OnTimeStatus, RescheduleReason } from '@/types/loads';
import { getDelayFault, parseDelayReason } from '@/lib/delayReasons';

const ON_TIME_TOLERANCE_MS = 60 * 60 * 1000; // 60 minutes (CSV fallback only)

/** Reschedules listed here are removed from on-time % entirely. Tweak after Ryan/Johnny review. */
export const ON_TIME_RULES = {
  excludedRescheduleReasons: ['customer', 'shipper_delay'] as RescheduleReason[],
  /** Ignore small moves (e.g. same-day window shifts). 0 = any move counts. */
  minShiftHours: 0,
};

/** Counts toward on-time % (in the denominator). */
export const isScored = (s?: OnTimeStatus) => s === 'On Time' || s === 'Late';

  /**
   * Removed from on-time % because the shipper or customer caused it.
   * A structured reason entered in Turvo (ticket 14) wins over the sync's inferred reason.
   */
  export function isExcludedReschedule(load: Load, rawDelivery: OnTimeStatus = 'Unknown'): boolean {
    if (load.serviceSource !== 'turvo') return false;
    const explicit = parseDelayReason(load.delayReason);
    if (explicit) return explicit !== 'carrier' && (!!load.deliveryRescheduled || rawDelivery === 'Late');
    if (!load.deliveryRescheduled || !load.rescheduleReason) return false;
    if (!ON_TIME_RULES.excludedRescheduleReasons.includes(load.rescheduleReason)) return false;
    return Math.abs(load.appointmentShiftHours ?? Infinity) >= ON_TIME_RULES.minShiftHours;
}

const titleCase = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const upper = (s?: string) => (s ?? '').trim().toUpperCase();
/** One lane name everywhere, so "RIO RICO, az" and "Rio Rico, AZ" are the same lane. */
export function laneOf(l: Pick<Load, 'originCity' | 'originState' | 'destinationCity' | 'destinationState'>): string {
  const o = [titleCase(l.originCity), upper(l.originState)].filter(Boolean).join(', ') || '?';
  const d = [titleCase(l.destinationCity), upper(l.destinationState)].filter(Boolean).join(', ') || '?';
  return `${o} → ${d}`;
}
/** laneOf() for a load with no origin or destination at all. */
export const UNKNOWN_LANE = '? → ?';

export function computeLoad(load: Load): ComputedLoad {
  const grossProfit = hasFinancials(load) ? load.revenue! - load.carrierCost! : undefined;
  const marginPercent = (grossProfit != null && load.revenue && load.revenue > 0) ? (grossProfit / load.revenue) * 100 : undefined;

  const lane = laneOf(load);

  const originSt = load.originState || '?';
  const destSt = load.destinationState || '?';
  const stateLane = originSt !== '?' && destSt !== '?' ? `${originSt} → ${destSt}` : 'Unknown';

  // Prefer the service result from the Turvo sync (original vs. current appointment,
  // customer reschedules excluded). Fall back to the old timestamp check for CSV imports.
  const fromSync = load.serviceSource === 'turvo';
  const onTimePickup: OnTimeStatus = fromSync && load.onTimePickup
    ? load.onTimePickup
    : getOnTimeStatus(load.pickupDate, load.scheduledPickupDate);
  const onTimeDeliveryRaw: OnTimeStatus = fromSync && load.onTimeDelivery
    ? load.onTimeDelivery
    : getOnTimeStatus(load.deliveryDate, load.scheduledDeliveryDate);
    const excludedFromOnTime = isExcludedReschedule(load, onTimeDeliveryRaw);
  // Raw actuals = arrival vs. the original appointment (Turvo sync); CSV has only one date.
  const onTimeDeliveryActual: OnTimeStatus = fromSync && load.onTimeDeliveryOriginal ? load.onTimeDeliveryOriginal : onTimeDeliveryRaw;
  const { fault: delayFault, source: delayFaultSource } = getDelayFault(load, onTimeDeliveryActual);
  const onTimeDelivery: OnTimeStatus = excludedFromOnTime ? 'Excluded' : onTimeDeliveryRaw;

  const hiddenLate = fromSync && load.onTimeDeliveryTurvo === 'On Time' && onTimeDelivery === 'Late';

  const statusLower = (load.shipmentStatus || '').toLowerCase();
  const isLocked = load.readyToBillDate || statusLower === 'ready for billing' || statusLower === 'completed';
  const simpleStatus: 'Booked' | 'Locked' = isLocked ? 'Locked' : 'Booked';

  return { ...load, grossProfit, marginPercent, lane, stateLane, onTimePickup, onTimeDelivery,
            onTimeDeliveryRaw, excludedFromOnTime, hiddenLate, simpleStatus,
  onTimeDeliveryActual, delayFault, delayFaultSource };
}

function getOnTimeStatus(actual?: string, scheduled?: string): OnTimeStatus {
  if (!actual || !scheduled) return 'Unknown';
  const actualMs = new Date(actual).getTime();
  const scheduledMs = new Date(scheduled).getTime();
  // On time if actual <= scheduled + 60 minute tolerance
  return actualMs <= scheduledMs + ON_TIME_TOLERANCE_MS ? 'On Time' : 'Late';
}

/**
 * Canceled and draft loads never have revenue/cost and are excluded from every metric.
 * Matched loosely so "Cancelled", "CANCELED", "Canceled - customer", trailing spaces etc.
 * from CSV imports or older syncs are excluded too.
 */
const INACTIVE_STATUS = /^\s*(cancell?ed|draft)\b/i;
export function isActiveLoad(l: Pick<Load, 'shipmentStatus'>): boolean {
  return !INACTIVE_STATUS.test(l.shipmentStatus || '');
}

/**
 * Profit and margin only use loads that have BOTH revenue and carrier cost.
 */
type FinFields = Pick<Load, 'revenue' | 'carrierCost'> & Partial<Pick<Load, 'carrierName'>>;
/**
 * Uncovered = no carrier assigned and no carrier cost yet. Turvo often reports $0 payable
 * for these, which would otherwise read as a 100% margin. Treat the cost as pending:
 * revenue still counts, profit/margin wait until a carrier is booked.
 */
export const isUncovered = (l: FinFields): boolean =>
  !(l.carrierName || '').trim() && !l.carrierCost;
export const hasFinancials = (l: FinFields): boolean => l.revenue != null && l.carrierCost != null && !isUncovered(l);
export const finRev = (l: FinFields): number => (hasFinancials(l) ? l.revenue! : 0);
export const finCost = (l: FinFields): number => (hasFinancials(l) ? l.carrierCost! : 0);

/**
 * Pickup is due (appointment has passed) but Turvo has no pickup arrival.
 * The sync always fills pickupDate from the appointment, so "!pickupDate" was never true
 * and Missing Pickup showed 0. CSV imports have no arrival field, so they keep the old check.
 */
export function isMissingPickup(l: Load, now: string = new Date().toISOString()): boolean {
  if (l.serviceSource !== 'turvo') return !l.pickupDate;
  const due = l.scheduledPickupDate || l.pickupDate;
  return !!due && due <= now && !l.pickupArrival;
}

export type DataQualityIssue = 'missingRevenue' | 'missingCarrierCost' | 'missingPickup' | 'missingDelivery';

export const DATA_QUALITY_CHECKS: Record<DataQualityIssue, { label: string; match: (l: Load) => boolean; fix: string }> = {
  missingRevenue:     { label: 'Missing Revenue',  match: l => l.revenue == null,     fix: 'Add the customer rate in Turvo (Financials → Receivables).' },
  missingCarrierCost: { label: 'Missing Cost',     match: l => l.carrierCost == null, fix: 'Add the carrier rate in Turvo (Financials → Payables).' },
  missingPickup:      { label: 'Missing Pickup',   match: l => isMissingPickup(l),    fix: 'Pickup appointment has passed but no arrival is recorded — add the pickup arrival in Turvo.' },
  missingDelivery:    { label: 'Missing Delivery', match: l => !l.deliveryDate,       fix: 'Add the delivery appointment or arrival in Turvo.' },
};

/** Loads behind a data-quality number (same population as computeDataQuality). */
export function getDataQualityLoads(loads: Load[], issue: DataQualityIssue): Load[] {
  return loads.filter(isActiveLoad).filter(DATA_QUALITY_CHECKS[issue].match);
}

export function computeDataQuality(allLoads: Load[]): DataQuality {
  // Canceled/draft loads used to count as "missing revenue" (7 of the 8 flagged loads were canceled).
  const loads = allLoads.filter(isActiveLoad);
  const total = loads.length;

  return {
    totalLoads: total,
    missingRevenue: loads.filter(l => l.revenue == null).length,
    missingCarrierCost: loads.filter(l => l.carrierCost == null).length,
    missingPickup: loads.filter(l => isMissingPickup(l)).length,
    missingDelivery: loads.filter(l => !l.deliveryDate).length,
    missingCustomer: loads.filter(l => !l.customerName).length,
    missingCarrier: loads.filter(l => !l.carrierName).length,
  };
}

const DATE_FIELDS = new Set<keyof Load>(['pickupDate', 'deliveryDate', 'scheduledPickupDate', 'scheduledDeliveryDate', 'readyToBillDate', 'invoiceSentDate']);

/**
 * Turvo CSV exports use US dates ("09/14/2025 08:00"); the app compares ISO strings
 * ("2025-09-14"), so convert on import. Already-ISO values pass through.
 */
function normalizeCsvDate(val: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i.exec(val);
  if (!m) {
    const t = Date.parse(val); // e.g. "Sep 14, 2025"
    return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
  }
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const p2 = (n: number | string) => String(n).padStart(2, '0');
  const date = `${year}-${p2(m[1])}-${p2(m[2])}`;
  if (!m[4]) return date;
  let hour = Number(m[4]);
  if (m[6]) hour = (hour % 12) + (m[6].toUpperCase() === 'PM' ? 12 : 0);
  return `${date}T${p2(hour)}:${m[5]}:00`;
}

export function parseCSV(text: string): Load[] {
  const lines = text.trim().split(/\r?\n/);

  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s/]+/g, '_'));

  const fieldMap: Record<string, keyof Load> = {
    load_id: 'loadId', loadid: 'loadId', shipment_id: 'loadId', shipmentid: 'loadId',
    customer_name: 'customerName', customer: 'customerName', primary_customer: 'customerName',
    carrier_name: 'carrierName', carrier: 'carrierName', primary_carrier: 'carrierName',
    origin_city: 'originCity', origincity: 'originCity',
    origin_state: 'originState', originstate: 'originState',
    destination_city: 'destinationCity', destinationcity: 'destinationCity',
    destination_state: 'destinationState', destinationstate: 'destinationState',
    broker: 'broker', operator: 'broker', account_owner: 'broker',
    team: 'team',
    equipment_type: 'equipmentType', equipmenttype: 'equipmentType', equipment: 'equipmentType', mode: 'equipmentType',
    shipment_status: 'shipmentStatus', status: 'shipmentStatus',
    pickup_date: 'pickupDate', pickupdate: 'pickupDate', pickup: 'pickupDate',
    delivery_date: 'deliveryDate', deliverydate: 'deliveryDate', delivery: 'deliveryDate',
    scheduled_pickup: 'scheduledPickupDate', scheduled_pickup_date: 'scheduledPickupDate',
    scheduled_delivery: 'scheduledDeliveryDate', scheduled_delivery_date: 'scheduledDeliveryDate',
    revenue: 'revenue', customer_bill: 'revenue',
    carrier_cost: 'carrierCost', carriercost: 'carrierCost', cost: 'carrierCost', carrier_and_other_pay: 'carrierCost',
    ready_to_bill_date: 'readyToBillDate', readytobilldate: 'readyToBillDate', ready_to_bill: 'readyToBillDate',
    invoice_sent_date: 'invoiceSentDate', invoicesentdate: 'invoiceSentDate', invoice_sent: 'invoiceSentDate',
    service_reason: 'serviceReason', servicereason: 'serviceReason',
  };

  const locationMap: Record<string, 'origin' | 'destination'> = {
    origin: 'origin', destination: 'destination',
  };

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line);
    const load: Partial<Load> = {};
    headers.forEach((h, i) => {
      const field = fieldMap[h];
      const locType = locationMap[h];
      if ((!field && !locType) || !values[i]?.trim()) return;
      const val = values[i].trim();

      if (locType) {
        const parts = val.split(',').map(p => p.trim());
        if (locType === 'origin') {
          load.originCity = parts[0] || undefined;
          load.originState = parts[1] || undefined;
        } else {
          load.destinationCity = parts[0] || undefined;
          load.destinationState = parts[1] || undefined;
        }
      } else if (field === 'revenue' || field === 'carrierCost') {
        const num = parseFloat(val.replace(/[$,]/g, ''));
      if (!isNaN(num)) (load as any)[field] = num;
      } else if (DATE_FIELDS.has(field!)) {
        const iso = normalizeCsvDate(val);
        if (iso) (load as any)[field!] = iso;
      } else {
        (load as any)[field!] = val;
      }
    });
    if (!load.loadId) load.loadId = `AUTO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    load.serviceSource = 'csv';
    return load as Load;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += char; }
  }
  result.push(current);
  return result;
}
