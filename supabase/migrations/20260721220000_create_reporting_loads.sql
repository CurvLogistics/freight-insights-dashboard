-- Reporting database: Turvo load export (API sync comes later)
create extension if not exists pgcrypto;

create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(),
  load_id text not null,
  customer_name text,
  carrier_name text,
  origin_city text,
  origin_state text,
  destination_city text,
  destination_state text,
  broker text,
  team text,
  equipment_type text,
  shipment_status text,
  pickup_date date,
  delivery_date date,
  scheduled_pickup_date timestamptz,
  scheduled_delivery_date timestamptz,
  revenue numeric(12, 2),
  carrier_cost numeric(12, 2),
  ready_to_bill_date date,
  invoice_sent_date date,
  service_reason text,
  source text not null default 'turvo_export',
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loads_load_id_unique unique (load_id)
);

create index if not exists loads_pickup_date_idx on public.loads (pickup_date);
create index if not exists loads_customer_name_idx on public.loads (customer_name);
create index if not exists loads_carrier_name_idx on public.loads (carrier_name);
create index if not exists loads_shipment_status_idx on public.loads (shipment_status);
create index if not exists loads_source_idx on public.loads (source);

create or replace function public.set_loads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loads_set_updated_at on public.loads;
create trigger loads_set_updated_at
  before update on public.loads
  for each row
  execute function public.set_loads_updated_at();

alter table public.loads enable row level security;

-- Dashboard reads with the anon/publishable key (no auth yet)
drop policy if exists "Allow public read access to loads" on public.loads;
create policy "Allow public read access to loads"
  on public.loads
  for select
  to anon, authenticated
  using (true);

-- Writes: no direct anon DML. Use upsert_loads_batch (security definer) for the Turvo export import.
-- Service role also bypasses RLS for future API sync jobs.

create or replace function public.upsert_loads_batch(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  with parsed as (
    select * from jsonb_to_recordset(rows) as x(
      load_id text,
      customer_name text,
      carrier_name text,
      origin_city text,
      origin_state text,
      destination_city text,
      destination_state text,
      broker text,
      team text,
      equipment_type text,
      shipment_status text,
      pickup_date date,
      delivery_date date,
      scheduled_pickup_date timestamptz,
      scheduled_delivery_date timestamptz,
      revenue numeric,
      carrier_cost numeric,
      ready_to_bill_date date,
      invoice_sent_date date,
      service_reason text,
      source text
    )
  ),
  upserted as (
    insert into public.loads (
      load_id, customer_name, carrier_name, origin_city, origin_state,
      destination_city, destination_state, broker, team, equipment_type,
      shipment_status, pickup_date, delivery_date, scheduled_pickup_date,
      scheduled_delivery_date, revenue, carrier_cost, ready_to_bill_date,
      invoice_sent_date, service_reason, source
    )
    select
      p.load_id, p.customer_name, p.carrier_name, p.origin_city, p.origin_state,
      p.destination_city, p.destination_state, p.broker, p.team, p.equipment_type,
      p.shipment_status, p.pickup_date, p.delivery_date, p.scheduled_pickup_date,
      p.scheduled_delivery_date, p.revenue, p.carrier_cost, p.ready_to_bill_date,
      p.invoice_sent_date, p.service_reason, coalesce(p.source, 'turvo_export')
    from parsed p
    where p.load_id is not null and length(trim(p.load_id)) > 0
    on conflict (load_id) do update set
      customer_name = excluded.customer_name,
      carrier_name = excluded.carrier_name,
      origin_city = excluded.origin_city,
      origin_state = excluded.origin_state,
      destination_city = excluded.destination_city,
      destination_state = excluded.destination_state,
      broker = excluded.broker,
      team = excluded.team,
      equipment_type = excluded.equipment_type,
      shipment_status = excluded.shipment_status,
      pickup_date = excluded.pickup_date,
      delivery_date = excluded.delivery_date,
      scheduled_pickup_date = excluded.scheduled_pickup_date,
      scheduled_delivery_date = excluded.scheduled_delivery_date,
      revenue = excluded.revenue,
      carrier_cost = excluded.carrier_cost,
      ready_to_bill_date = excluded.ready_to_bill_date,
      invoice_sent_date = excluded.invoice_sent_date,
      service_reason = excluded.service_reason,
      source = excluded.source,
      updated_at = now()
    returning 1
  )
  select count(*)::integer into inserted from upserted;

  return inserted;
end;
$$;

revoke all on function public.upsert_loads_batch(jsonb) from public;
grant execute on function public.upsert_loads_batch(jsonb) to anon, authenticated, service_role;
