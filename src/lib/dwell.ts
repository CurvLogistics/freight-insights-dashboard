import type { Load } from '@/types/loads';

/** Turvo's default expected dwell per stop is 2 hours; longer than that is worth a look (detention). */
export const LONG_WAIT_HOURS = 2;

/** Hours between check-in and check-out. null when either is missing or check-out is before check-in (bad data). */
export function dwellHours(checkIn?: string, checkOut?: string): number | null {
  if (!checkIn || !checkOut) return null;
  const h = (Date.parse(checkOut) - Date.parse(checkIn)) / 3_600_000;
  return Number.isFinite(h) && h >= 0 ? Math.round(h * 10) / 10 : null;
}

type DwellFields = Pick<Load, 'hoursAtShipper' | 'pickupArrival' | 'pickupDeparture' | 'hoursAtReceiver' | 'deliveryArrival' | 'deliveryDeparture'>;

/** Time the truck spent at the shipper. Uses the sync's value, else the pickup check-in/out times. */
export const hoursAtShipperOf = (l: DwellFields): number | null =>
  l.hoursAtShipper != null && l.hoursAtShipper >= 0 ? l.hoursAtShipper : dwellHours(l.pickupArrival, l.pickupDeparture);

/** Time the truck spent at the receiver (delivery check-in to check-out). */
export const hoursAtReceiverOf = (l: DwellFields): number | null =>
  l.hoursAtReceiver != null && l.hoursAtReceiver >= 0 ? l.hoursAtReceiver : dwellHours(l.deliveryArrival, l.deliveryDeparture);

export const longWaitAtShipper = (l: DwellFields) => (hoursAtShipperOf(l) ?? 0) >= LONG_WAIT_HOURS;
export const longWaitAtReceiver = (l: DwellFields) => (hoursAtReceiverOf(l) ?? 0) >= LONG_WAIT_HOURS;

export const formatHours = (h: number | null) =>
  h == null ? '—' : h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
