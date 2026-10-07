import { Load, ComputedLoad, DataQuality, OnTimeStatus } from '@/types/loads';

const ON_TIME_TOLERANCE_MS = 60 * 60 * 1000; // 60 minutes (CSV fallback only)

export function computeLoad(load: Load): ComputedLoad {
  const grossProfit = (load.revenue != null && load.carrierCost != null) ? load.revenue - load.carrierCost : undefined;
  const marginPercent = (grossProfit != null && load.revenue && load.revenue > 0) ? (grossProfit / load.revenue) * 100 : undefined;

  const origin = [load.originCity, load.originState].filter(Boolean).join(', ');
  const dest = [load.destinationCity, load.destinationState].filter(Boolean).join(', ');
  const lane = origin && dest ? `${origin} → ${dest}` : origin || dest || 'Unknown';

  const originSt = load.originState || '?';
  const destSt = load.destinationState || '?';
  const stateLane = originSt !== '?' && destSt !== '?' ? `${originSt} → ${destSt}` : 'Unknown';

  // Prefer the service result from the Turvo sync (original vs. current appointment,
  // customer reschedules excluded). Fall back to the old timestamp check for CSV imports.
  const fromSync = load.serviceSource === 'turvo';
  const onTimePickup: OnTimeStatus = fromSync && load.onTimePickup
    ? load.onTimePickup
    : getOnTimeStatus(load.pickupDate, load.scheduledPickupDate);
  const onTimeDelivery: OnTimeStatus = fromSync && load.onTimeDelivery
    ? load.onTimeDelivery
    : getOnTimeStatus(load.deliveryDate, load.scheduledDeliveryDate);
  const hiddenLate = fromSync && load.onTimeDeliveryTurvo === 'On Time' && onTimeDelivery === 'Late';

  const statusLower = (load.shipmentStatus || '').toLowerCase();
  const isLocked = load.readyToBillDate || statusLower === 'ready for billing' || statusLower === 'completed';
  const simpleStatus: 'Booked' | 'Locked' = isLocked ? 'Locked' : 'Booked';

  return { ...load, grossProfit, marginPercent, lane, stateLane, onTimePickup, onTimeDelivery, hiddenLate, simpleStatus };
}

function getOnTimeStatus(actual?: string, scheduled?: string): OnTimeStatus {
  if (!actual || !scheduled) return 'Unknown';
  const actualMs = new Date(actual).getTime();
  const scheduledMs = new Date(scheduled).getTime();
  // On time if actual <= scheduled + 60 minute tolerance
  return actualMs <= scheduledMs + ON_TIME_TOLERANCE_MS ? 'On Time' : 'Late';
}

export function computeDataQuality(loads: Load[]): DataQuality {
  const total = loads.length;
  return {
    totalLoads: total,
    missingRevenue: loads.filter(l => l.revenue == null).length,
    missingCarrierCost: loads.filter(l => l.carrierCost == null).length,
    missingPickup: loads.filter(l => !l.pickupDate).length,
    missingDelivery: loads.filter(l => !l.deliveryDate).length,
    missingCustomer: loads.filter(l => !l.customerName).length,
    missingCarrier: loads.filter(l => !l.carrierName).length,
  };
}

export function parseCSV(text: string): Load[] {
  const lines = text.trim().split('\n');
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
