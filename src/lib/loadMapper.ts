import type { Load } from '@/types/loads';
import type { Tables } from '@/integrations/supabase/types';

export type LoadRow = Tables<'loads'>;

export function loadRowToLoad(row: LoadRow): Load {
  return {
    loadId: row.load_id,
    customerName: row.customer_name ?? undefined,
    carrierName: row.carrier_name ?? undefined,
    originCity: row.origin_city ?? undefined,
    originState: row.origin_state ?? undefined,
    destinationCity: row.destination_city ?? undefined,
    destinationState: row.destination_state ?? undefined,
    broker: row.broker ?? undefined,
    team: row.team ?? undefined,
    equipmentType: row.equipment_type ?? undefined,
    shipmentStatus: row.shipment_status ?? undefined,
    pickupDate: row.pickup_date ?? undefined,
    deliveryDate: row.delivery_date ?? undefined,
    scheduledPickupDate: row.scheduled_pickup_date ?? undefined,
    scheduledDeliveryDate: row.scheduled_delivery_date ?? undefined,
    revenue: row.revenue != null ? Number(row.revenue) : undefined,
    carrierCost: row.carrier_cost != null ? Number(row.carrier_cost) : undefined,
    readyToBillDate: row.ready_to_bill_date ?? undefined,
    invoiceSentDate: row.invoice_sent_date ?? undefined,
    serviceReason: row.service_reason ?? undefined,
  };
}

export function loadToDbRow(load: Load, source = 'turvo_export') {
  return {
    load_id: load.loadId,
    customer_name: load.customerName ?? null,
    carrier_name: load.carrierName ?? null,
    origin_city: load.originCity ?? null,
    origin_state: load.originState ?? null,
    destination_city: load.destinationCity ?? null,
    destination_state: load.destinationState ?? null,
    broker: load.broker ?? null,
    team: load.team ?? null,
    equipment_type: load.equipmentType ?? null,
    shipment_status: load.shipmentStatus ?? null,
    pickup_date: load.pickupDate?.slice(0, 10) ?? null,
    delivery_date: load.deliveryDate?.slice(0, 10) ?? null,
    scheduled_pickup_date: load.scheduledPickupDate ?? null,
    scheduled_delivery_date: load.scheduledDeliveryDate ?? null,
    revenue: load.revenue ?? null,
    carrier_cost: load.carrierCost ?? null,
    ready_to_bill_date: load.readyToBillDate?.slice(0, 10) ?? null,
    invoice_sent_date: load.invoiceSentDate?.slice(0, 10) ?? null,
    service_reason: load.serviceReason ?? null,
    source,
  };
}
