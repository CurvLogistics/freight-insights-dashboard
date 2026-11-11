import type { Load, OnTimeStatus } from '@/types/loads';

/** Who caused a delivery delay / reschedule. 'unknown' = moved with no reason we can trust. */
export type DelayFault = 'customer' | 'shipper' | 'carrier' | 'unknown';
export type DelayFaultSource = 'turvo' | 'inferred';

export const DELAY_FAULT_LABEL: Record<DelayFault, string> = {
  customer: 'Customer / receiver',
  shipper: 'Shipper (product not ready)',
  carrier: 'Carrier',
  unknown: 'Unconfirmed — needs review',
};

/**
 * Turns the structured delay reason from Turvo (ticket 14) into a fault.
 * Accepts a code ("CUSTOMER", "SHIPPER", "CARRIER") or free text in the agreed
 * comment format, e.g. "RDD / delivery appointment / product availability".
 * Returns null when the text doesn't say whose fault it was.
 */
export function parseDelayReason(text?: string | null): DelayFault | null {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return null;
  if (/\b(carrier|breakdown|broke down|driver|truck|equipment failure|hos|hours of service|missed (pickup|delivery)|late truck|accident)\b/.test(t)) return 'carrier';
  if (/\b(shipper|product (availability|not ready)|not ready|loading delay|load(ing)? late|short ?ship|product availability)\b/.test(t)) return 'shipper';
  if (/\b(customer|receiver|consignee|rdd|requested delivery|delivery appointment|appointment (change|moved|reschedul)|reschedul|closed|refused)\b/.test(t)) return 'customer';
  return null;
}

/**
 * Delay fault for one load. Priority:
 * 1. the structured reason entered in Turvo (once the field exists — ticket 14)
 * 2. late even against the revised appointment → carrier (no reschedule excuses that)
 * 3. the reason the sync inferred from a delivery reschedule ('unknown' stays unknown)
 * 4. a late delivery with no reschedule is the carrier's
 */
export function getDelayFault(
  load: Pick<Load, 'delayReason' | 'deliveryRescheduled' | 'rescheduleReason' | 'onTimeDeliveryTurvo'>,
  rawDelivery: OnTimeStatus,
): { fault: DelayFault | null; source: DelayFaultSource | null } {
  // A missed revised date is the carrier's, whatever moved the date (same rule as isExcludedReschedule)
  if (load.deliveryRescheduled && load.onTimeDeliveryTurvo === 'Late') return { fault: 'carrier', source: 'inferred' };
  const explicit = parseDelayReason(load.delayReason);
  if (explicit) return { fault: explicit, source: 'turvo' };
  if (load.deliveryRescheduled && load.rescheduleReason) {
    const fault: DelayFault = load.rescheduleReason === 'shipper_delay' ? 'shipper' : load.rescheduleReason;
    return { fault, source: 'inferred' };
  }
  if (rawDelivery === 'Late') return { fault: 'carrier', source: 'inferred' };
  return { fault: null, source: null };
}

/** Who asked for the date change. Only Turvo evidence counts as confirmed. */
export function requestedBy(l: Pick<Load, 'deliveryRescheduled' | 'rescheduleReason' | 'delayReason'>): string {
  if (!l.deliveryRescheduled) return '—';
  if (l.rescheduleReason === 'customer') return 'Customer (matches requested date)';
  const explicit = parseDelayReason(l.delayReason);
  if (explicit) return `${DELAY_FAULT_LABEL[explicit]} (entered in Turvo)`;
  return 'Not recorded in Turvo';
}

export interface OtdSummary {
  /** Raw actuals: arrival vs. the ORIGINAL appointment, nothing excused. */
  rawScored: number; rawOnTime: number; rawPct: number | null;
  /** "True" on-time: shipper/customer-caused delays removed. */
  trueScored: number; trueOnTime: number; truePct: number | null;
  excludedCustomer: number; excludedShipper: number;
  /** Late deliveries scored against the carrier. */
  carrierLate: number;
}

type OtdLoad = {
  onTimeDelivery: OnTimeStatus;
  onTimeDeliveryActual: OnTimeStatus;
  excludedFromOnTime: boolean;
  delayFault: DelayFault | null;
};

export function summarizeOtd(loads: OtdLoad[]): OtdSummary {
  const s: OtdSummary = {
    rawScored: 0, rawOnTime: 0, rawPct: null, trueScored: 0, trueOnTime: 0, truePct: null,
    excludedCustomer: 0, excludedShipper: 0, carrierLate: 0,
  };
  loads.forEach(l => {
    if (l.onTimeDeliveryActual === 'On Time' || l.onTimeDeliveryActual === 'Late') {
      s.rawScored++;
      if (l.onTimeDeliveryActual === 'On Time') s.rawOnTime++;
    }
    if (l.onTimeDelivery === 'On Time' || l.onTimeDelivery === 'Late') {
      s.trueScored++;
      if (l.onTimeDelivery === 'On Time') s.trueOnTime++;
      else s.carrierLate++;
    }
    if (l.excludedFromOnTime) {
      if (l.delayFault === 'shipper') s.excludedShipper++;
      else if (l.delayFault === 'customer') s.excludedCustomer++;
    }
  });
  s.rawPct = s.rawScored ? (s.rawOnTime / s.rawScored) * 100 : null;
  s.truePct = s.trueScored ? (s.trueOnTime / s.trueScored) * 100 : null;
  return s;
}

/**
 * Which delivery result a page scores on-time with (Katzman report, item 4).
 * - 'fair': the default — customer/shipper-caused reschedules are excluded.
 * - 'original': arrival vs. the ORIGINAL appointment, nothing excused (raw actuals).
 */
export type OtdBasis = 'fair' | 'original';
export const OTD_BASIS_LABEL: Record<OtdBasis, string> = {
  fair: 'Fair (customer/shipper moves excused)',
  original: 'Original appointment (nothing excused)',
};
export function deliveryStatus(
  l: { onTimeDelivery: OnTimeStatus; onTimeDeliveryActual: OnTimeStatus },
  basis: OtdBasis,
): OnTimeStatus {
  return basis === 'original' ? l.onTimeDeliveryActual : l.onTimeDelivery;
}