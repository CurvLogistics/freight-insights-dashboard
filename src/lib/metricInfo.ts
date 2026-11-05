/**
 * Tooltip copy for the "i" icon on each metric: what it's for + where the data comes from.
 * Keep all metric definitions here so wording stays consistent across views.
 */
export interface MetricInfo {
  text: string;
  source: string;
}

export const METRIC_INFO = {
  carrierCostMovement: {
    text: 'Lanes where the average carrier cost per load changed most vs the comparison period. "New" = no loads last period.',
    source: 'Turvo carrier cost',
  },
  onTimePickup: {
    text: 'Pickups where the carrier arrived by the current pickup appointment.',
    source: 'Turvo appointments & arrivals',
  },
  otdOriginal: {
    text: 'Delivered by the first appointment set on the load — nothing excused. "Turvo %" uses the latest appointment instead.',
    source: 'Turvo appointments & arrivals',
  },
  otdFair: {
    text: 'Delivered by the first appointment, excluding loads the customer moved or the shipper held. "Turvo %" uses the latest appointment.',
    source: 'Turvo appointments & arrivals',
  },

  // ── Service page ─────────────────────────────────────────────
  totalShipments: {
    text: 'All shipments that match the current filters (date range, team, customer, carrier). This is the base the other service cards are counted from.',
    source: 'Shipments from Turvo, synced daily. Canceled and draft loads are excluded.',
  },
  lateShipments: {
    text: 'Shipments the carrier delivered after the delivery appointment, using the scoring rule picked in "Score delivery by" (Fair or Original appointment).',
    source: 'Delivery appointments and actual arrival times from Turvo, synced daily.',
  },
  hiddenLate: {
    text: 'On time in Turvo, but late vs the original appointment because the date was moved.',
    source: 'Turvo appointment history',
  },
  rescheduled: {
    text: 'Deliveries moved by the customer or held by the shipper. Left out of on-time % in the Fair view.',
    source: 'Turvo appointment history',
  },
  cantScore: {
    text: 'No delivery arrival time in Turvo, so these loads are left out of on-time %.',
    source: 'Turvo arrivals',
  },

  // ── Dashboard: Business Health ──────────────────────────────
  healthLoads: {
    text: 'Number of loads in the selected date range. The change below compares against the comparison period (prior period or same period last year, per Comparison mode).',
    source: 'Shipments from Turvo, synced daily. Canceled and draft loads are excluded.',
  },
  healthRevenue: {
    text: 'Total customer revenue for the loads in the range, including loads that don\'t have a carrier cost yet.',
    source: 'Customer rate (revenue) on each Turvo shipment.',
  },
  healthProfit: {
    text: 'Revenue minus carrier cost. Only loads that have both a revenue and a carrier cost are counted, so uncovered loads don\'t inflate profit.',
    source: 'Customer revenue and carrier cost on each Turvo shipment.',
  },
  healthMargin: {
    text: 'Profit ÷ revenue, for loads with a carrier cost. Change shown in percentage points.',
    source: 'Turvo revenue & carrier cost',
  },
  healthAvgCost: {
    text: 'Average carrier cost per load, for loads that have a carrier cost. Going up is shown in red because it means coverage is getting more expensive.',
    source: 'Carrier cost (carrier pay) on each Turvo shipment.',
  },

  // ── Carrier & Customer scorecards ───────────────────────────
  scTotalLoads: {
    text: 'Loads in the current filters, across all carriers/customers listed below.',
    source: 'Shipments from Turvo, synced daily.',
  },
  scTotalSpend: {
    text: 'Total paid (or owed) to carriers for these loads.',
    source: 'Carrier cost on each Turvo shipment.',
  },
  scTotalRevenue: {
    text: 'Total billed to customers for these loads.',
    source: 'Customer revenue on each Turvo shipment.',
  },
  scTotalProfit: {
    text: 'Total revenue minus total carrier spend for these loads.',
    source: 'Customer revenue and carrier cost on each Turvo shipment.',
  },
  scAvgCost: {
    text: 'Total carrier spend divided by the number of loads.',
    source: 'Carrier cost on each Turvo shipment.',
  },
  scAvgMargin: {
    text: '(Revenue − carrier spend) ÷ revenue. Shown in green at 15% or higher.',
    source: 'Customer revenue and carrier cost on each Turvo shipment.',
  },
  scActiveLanes: {
    text: 'Number of distinct origin → destination lanes with at least one load in the current filters.',
    source: 'Pickup and delivery locations on each Turvo shipment.',
  },
  latePickups: {
    text: 'Pickups where the carrier arrived after the current pickup appointment.',
    source: 'Pickup appointment and actual arrival times from Turvo, synced daily.',
  },

  // ── Executive Overview ──────────────────────────────────────
  filteredLoads: {
    text: 'Loads in the selected date range and filters (by scheduled pickup date). Change vs the comparison period.',
    source: 'Turvo shipments, excl. canceled & draft',
  },
  totalRevenue: {
    text: 'Total billed to customers for the filtered loads, including loads with no carrier cost yet.',
    source: 'Turvo customer revenue',
  },
  grossProfit: {
    text: 'Revenue minus carrier cost, for loads that have both.',
    source: 'Turvo revenue & carrier cost',
  },
  marginPct: {
    text: 'Gross profit ÷ revenue. Change shown in percentage points.',
    source: 'Turvo revenue & carrier cost',
  },

  // ── Cash Flow ───────────────────────────────────────────────
  openAr: {
    text: 'Money customers still owe us. Loads not invoiced yet are estimated from the delivery date.',
    source: 'Turvo customer invoices',
  },
  openAp: {
    text: 'Money we still owe carriers.',
    source: 'Turvo carrier invoices',
  },
  arPastDue: {
    text: 'Customer invoices past their due date.',
    source: 'Turvo customer invoices',
  },
  net8Weeks: {
    text: 'Expected money in minus money out over the next 8 weeks, by due date. Past-due amounts are not included.',
    source: 'Turvo invoices + estimates',
  },
  unpaid180: {
    text: 'Customer invoices open 180+ days — likely needs collections follow-up.',
    source: 'Turvo customer invoices',
  },
  longWait: {
    text: 'Trucks that waited 2h+ between check-in and check-out at the shipper or receiver. Often the reason a load delivers late, so check these before blaming the carrier.',
    source: 'Turvo stop check-in / check-out times',
  },
} satisfies Record<string, MetricInfo>;