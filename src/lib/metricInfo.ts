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
    text:
      'Shows which lanes are getting more expensive to cover. For each lane with loads in the selected period, ' +
      'compares the average carrier cost per load against the comparison period, sorted by the biggest $ increase. ' +
      '"New" means the lane had no loads in the comparison period.',
    source:
      'Carrier cost (carrier pay) on each Turvo shipment, synced daily. Lane = origin → destination. ' +
      'Canceled and draft loads are excluded.',
  },
  onTimePickup: {
    text:
      'Share of pickups where the carrier arrived by the pickup appointment. Scored against the current appointment, ' +
      'so a customer moving the pickup never counts as late. Loads with no pickup arrival time are left out.',
    source: 'Pickup appointment and actual arrival times from Turvo, synced daily.',
  },
  otdOriginal: {
    text:
      'Strictest view of delivery: on time only if the carrier arrived by the FIRST delivery appointment set on the load. ' +
      'Nothing is excused, even if the customer or shipper moved the date. ' +
      '"Turvo" below is Turvo\'s own on-time flag, which checks the latest appointment — so a moved date can make a late load look on time.',
    source:
      'Delivery appointments and arrival times from Turvo, synced daily. The original appointment is captured by our sync from the ' +
      'appointment history; the Turvo % uses the on-time status Turvo stores on the stop.',
  },
  otdFair: {
    text:
      'Fair view of delivery: scored against the FIRST delivery appointment, but loads the customer rescheduled or the shipper held ' +
      'are left out, so the carrier is only judged on delays it could own. ' +
      '"Turvo" below is Turvo\'s own on-time flag, which checks the latest appointment — so a moved date can make a late load look on time.',
    source:
      'Delivery appointments and arrival times from Turvo, synced daily. Reschedule reasons are inferred by our sync unless a delay ' +
      'reason was entered in Turvo; the Turvo % uses the on-time status Turvo stores on the stop.',
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
    text: 'Shipments Turvo marks as on time that were actually late against the original delivery appointment, because the appointment was moved. These make the Turvo on-time % look better than reality.',
    source: 'Compares Turvo\'s on-time flag with our check against the original appointment from the Turvo appointment history. Only loads synced from Turvo are checked.',
  },
  rescheduled: {
    text: 'Shipments whose delivery was moved by the customer or held by the shipper. In the Fair view they are left out of on-time %, so the carrier isn\'t blamed; in the Original appointment view they are scored like any other load.',
    source: 'Turvo appointment history. The reason is inferred by our sync unless a structured delay reason was entered in Turvo.',
  },
  cantScore: {
    text: 'Shipments that can\'t be marked on time or late because Turvo has no delivery arrival time. They are left out of on-time % — a high number here means the % is based on fewer loads.',
    source: 'Missing delivery arrival time on the Turvo shipment.',
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
    text: 'Profit as a share of revenue, for loads with both revenue and carrier cost. The change is shown in percentage points (pp). Ranges that include today can read high because recent loads have no carrier cost yet.',
    source: 'Customer revenue and carrier cost on each Turvo shipment.',
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
} satisfies Record<string, MetricInfo>;