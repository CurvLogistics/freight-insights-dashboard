import type { Load, OnTimeStatus } from '@/types/loads';

/** Who caused a delivery delay / reschedule. */
export type DelayFault = 'customer' | 'shipper' | 'carrier';
export type DelayFaultSource = 'turvo' | 'inferred';

export const DELAY_FAULT_LABEL: Record<DelayFault, string> = {
  customer: 'Customer / receiver',
  shipper: 'Shipper (product not ready)',
  carrier: 'Carrier',
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
 * 2. the reason the sync inferred from a delivery reschedule
 * 3. a late delivery with no excuse is the carrier's
 */
export function getDelayFault(
  load: Pick<Load, 'delayReason' | 'deliveryRescheduled' | 'rescheduleReason'>,
  rawDelivery: OnTimeStatus,
): { fault: DelayFault | null; source: DelayFaultSource | null } {
  const explicit = parseDelayReason(load.delayReason);
  if (explicit) return { fault: explicit, source: 'turvo' };
  if (load.deliveryRescheduled && load.rescheduleReason) {
    const fault: DelayFault = load.rescheduleReason === 'shipper_delay' ? 'shipper' : load.rescheduleReason;
    return { fault, source: 'inferred' };
  }
  if (rawDelivery === 'Late') return { fault: 'carrier', source: 'inferred' };
  return { fault: null, source: null };
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
      else s.excludedCustomer++;
    }
  });
  s.rawPct = s.rawScored ? (s.rawOnTime / s.rawScored) * 100 : null;
  s.truePct = s.trueScored ? (s.trueOnTime / s.trueScored) * 100 : null;
  return s;
}