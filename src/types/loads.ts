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
}

export interface ComputedLoad extends Load {
  grossProfit?: number;
  marginPercent?: number;
  lane: string;
  stateLane: string;
  onTimePickup: 'On Time' | 'Late' | 'Unknown';
  onTimeDelivery: 'On Time' | 'Late' | 'Unknown';
  simpleStatus: 'Booked' | 'Locked';
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

export type ViewType = 'dashboard' | 'service' | 'lanes' | 'productivity' | 'exceptions' | 'customer-scorecard' | 'carrier-scorecard' | 'insights' | 'settings';
