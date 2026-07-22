import type { Load } from '@/types/loads';
import { supabase } from '@/integrations/supabase/client';
import { loadRowToLoad, loadToDbRow } from '@/lib/loadMapper';

const PAGE_SIZE = 1000;
const UPSERT_BATCH = 200;

export async function fetchLoadsFromSupabase(): Promise<Load[]> {
  const all: Load[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('loads')
      .select('*')
      .order('pickup_date', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data?.length) break;

    all.push(...data.map(loadRowToLoad));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

/** Upsert a Turvo CSV/export into the reporting DB while API access is pending. */
export async function upsertLoadsToSupabase(
  loads: Load[],
  source = 'turvo_export',
): Promise<number> {
  let total = 0;

  for (let i = 0; i < loads.length; i += UPSERT_BATCH) {
    const chunk = loads.slice(i, i + UPSERT_BATCH).map((load) => loadToDbRow(load, source));
    const { data, error } = await supabase.rpc('upsert_loads_batch', { rows: chunk });
    if (error) throw error;
    total += Number(data ?? chunk.length);
  }

  return total;
}
