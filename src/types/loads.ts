import type { DelayFault, DelayFaultSource } from '@/lib/delayReasons';

export type OnTimeStatus = 'On Time' | 'Late' | 'Excluded' | 'Unknown';

/** Why a delivery appointment moved (set by the Turvo sync; Turvo stores no reason, so it is inferred). */
export type RescheduleReason = 'customer' | 'shipper_delay' | 'carrier';

export interface Load {
  loadId: string;
  customerName?: string;
  carrierName?: string;
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  broker?: string;
  team?: string;
  equipmentType?: string;
  shipmentStatus?: string;
  pickupDate?: string;
  deliveryDate?: string;
  scheduledPickupDate?: string;
  scheduledDeliveryDate?: string;
  revenue?: number;
  carrierCost?: number;
  readyToBillDate?: string;
  invoiceSentDate?: string;
  serviceReason?: string;

  // --- Service fields from the Turvo sync (turvo-mcp-server/service_status.py) ---
  pickupArrival?: string;
  deliveryArrival?: string;
  originalPickupAppointment?: string;
  originalDeliveryAppointment?: string;
  /** Pickup vs. its current appointment (customer pickup changes never count as late). */
  onTimePickup?: OnTimeStatus;
  /** Fair delivery result: original date, unless the customer/shipper caused the move. */
  onTimeDelivery?: OnTimeStatus;
  /** What Turvo Analytics shows: delivery vs. the current appointment. */
  onTimeDeliveryTurvo?: OnTimeStatus;
  /** Strict: delivery vs. the original appointment. */
  onTimeDeliveryOriginal?: OnTimeStatus;
  pickupRescheduled?: boolean;
  deliveryRescheduled?: boolean;
  rescheduleReason?: RescheduleReason;
  deliveryScoredAgainst?: 'original' | 'current';
  appointmentShiftHours?: number;
  hoursAtShipper?: number;
  minutesLate?: number;
  toReview?: boolean;
  serviceSource?: 'turvo' | 'csv';
    /** Structured delay reason from Turvo (ticket 14). The sync copies the field/task/comment text here. */
  delayReason?: string;

  // --- Finance fields from the Turvo sync (turvo-mcp-server/loads_sync.py) ---
  turvoId?: number;
  arInvoiceNumber?: string; arInvoiceDate?: string; arDueDate?: string; arInvoiceAmount?: number;
  arOpenBalance?: number; arPaid?: boolean; arLastPaymentDate?: string;
  apInvoiceNumber?: string; apInvoiceDate?: string; apDueDate?: string; apInvoiceAmount?: number;
  apOpenBalance?: number; apPaid?: boolean; apLastPaymentDate?: string;
}


export interface ComputedLoad extends Load {
  grossProfit?: number;
  marginPercent?: number;
  lane: string;
  stateLane: string;
  onTimePickup: OnTimeStatus;
  onTimeDelivery: OnTimeStatus;
  simpleStatus: 'Booked' | 'Locked';
  /** On time in Turvo, but really late (carrier delay hidden by a moved date). */
  hiddenLate: boolean;
  onTimeDeliveryRaw: OnTimeStatus;
  excludedFromOnTime: boolean;
    /** Raw actuals: arrival vs. the original appointment, nothing excused. */
  onTimeDeliveryActual: OnTimeStatus;
  /** Who caused the delay/reschedule (null = on time and not rescheduled). */
  delayFault: DelayFault | null;
  /** 'turvo' = from the structured Turvo field; 'inferred' = guessed by the sync. */
  delayFaultSource: DelayFaultSource | null;
}

export interface DataQuality {
  totalLoads: number;
  missingRevenue: number;
  missingCarrierCost: number;
  missingPickup: number;
  missingDelivery: number;
  missingCustomer: number;
  missingCarrier: number;
}

export type ViewType = 'dashboard' | 'service' | 'lanes' | 'productivity' | 'exceptions' | 'customer-scorecard' | 'carrier-scorecard' | 'cash-flow' | 'insights' | 'settings';

