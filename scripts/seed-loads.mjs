#!/usr/bin/env node
/**
 * Seeds Supabase `loads` from the embedded Turvo export (sampleData.ts).
 * Requires the reporting migration to be applied first.
 *
 * Usage: npm run seed:loads
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(name) {
  try {
    const text = readFileSync(resolve(root, name), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and publishable/service role key in .env');
  process.exit(1);
}

// Some dashboards copy a `/rest/v1/` URL; supabase-js expects the base project URL.
const normalizedUrl = url.replace(/\/rest\/v1\/?$/, '');

function parseSampleLoads() {
  const ts = readFileSync(resolve(root, 'src/data/sampleData.ts'), 'utf8');
  const exportMarker = 'export const sampleLoads';
  const markerIdx = ts.indexOf(exportMarker);
  if (markerIdx < 0) throw new Error('Could not find "export const sampleLoads" in sampleData.ts');

  // `export const sampleLoads: Load[] = [ ... ]`
  // There are `[` characters inside `Load[]`, so we must start searching after the `=`.
  const equalsIdx = ts.indexOf('=', markerIdx);
  if (equalsIdx < 0) throw new Error('Could not find "=" after sampleLoads export');

  const startBracket = ts.indexOf('[', equalsIdx);
  if (startBracket < 0) throw new Error('Could not find opening "[" for sampleLoads');

  // Walk the file and find the matching closing `]` for the top-level array.
  // This avoids accidentally parsing the `Load[]` type earlier in the file.
  let depth = 0;
  let inString = false;
  let stringQuote = null;
  let escape = false;

  let endBracket = -1;
  for (let i = startBracket; i < ts.length; i++) {
    const ch = ts[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      continue;
    }

    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        endBracket = i;
        break;
      }
    }
  }

  if (endBracket < 0) throw new Error('Could not find closing "]" for sampleLoads array');

  const jsonArrayText = ts.slice(startBracket, endBracket + 1);
  return JSON.parse(jsonArrayText);
}

function toDbRow(load) {
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
    pickup_date: load.pickupDate?.slice?.(0, 10) ?? load.pickupDate ?? null,
    delivery_date: load.deliveryDate?.slice?.(0, 10) ?? load.deliveryDate ?? null,
    scheduled_pickup_date: load.scheduledPickupDate ?? null,
    scheduled_delivery_date: load.scheduledDeliveryDate ?? null,
    revenue: load.revenue ?? null,
    carrier_cost: load.carrierCost ?? null,
    ready_to_bill_date: load.readyToBillDate?.slice?.(0, 10) ?? load.readyToBillDate ?? null,
    invoice_sent_date: load.invoiceSentDate?.slice?.(0, 10) ?? load.invoiceSentDate ?? null,
    service_reason: load.serviceReason ?? null,
    source: 'turvo_export',
  };
}

const BATCH = 200;

async function main() {
  const loads = parseSampleLoads();
  console.log(`Parsed ${loads.length} loads from Turvo export (sampleData.ts)`);

  const supabase = createClient(normalizedUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let total = 0;
  for (let i = 0; i < loads.length; i += BATCH) {
    const chunk = loads.slice(i, i + BATCH).map(toDbRow);
    const { data, error } = await supabase.rpc('upsert_loads_batch', { rows: chunk });
    if (error) {
      console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
      console.error('Did you apply supabase/migrations/20260721220000_create_reporting_loads.sql?');
      process.exit(1);
    }
    total += Number(data ?? chunk.length);
    console.log(`Upserted batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(loads.length / BATCH)} (+${data})`);
  }

  const { count, error: countError } = await supabase
    .from('loads')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.warn('Seed finished but count failed:', countError.message);
  } else {
    console.log(`Done. Reporting DB now has ${count} loads (rpc reported ~${total} upserts).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
