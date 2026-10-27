/**
 * US date formatting helpers. All dates in the app are stored as ISO strings
 * (YYYY-MM-DD or full ISO timestamps); these only change how they are shown.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Reporting days are US business days in this time zone. Change if the team works off Central/Pacific. */
export const BUSINESS_TZ = 'America/New_York';

const UTC_STAMP = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/i;

/**
 * The calendar day a timestamp falls on, for date filters and grouping.
 * - "2026-10-08" or a local/offset timestamp ("2026-10-08T22:00:00-05:00") → its own date.
 * - A UTC timestamp ("2026-10-09T02:00:00Z") → the date in BUSINESS_TZ (here 2026-10-08),
 *   so a late-evening US pickup isn't counted on the next day.
 */
export function toBusinessDate(value?: string | null, tz: string = BUSINESS_TZ): string {
  if (!value) return '';
  if (!UTC_STAMP.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "2026-10-08" or "2026-10-08T14:00:00Z" -> "10/08/2026". Empty/invalid -> "—". */
export function formatUSDate(value?: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return '—';
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/** "2026-10-08" -> "10/08" (chart axes). */
export function formatUSShortDate(value?: string | null): string {
  const full = formatUSDate(value);
  return full === '—' ? full : full.slice(0, 5);
}

/** Full timestamp in the viewer's time zone, US layout: "10/08/2026, 2:05 PM". */
export function formatUSDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** "10/08/2026" (also 10/8/2026, 10-08-2026) -> "2026-10-08". Returns null if invalid. */
export function parseUSDate(input: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(input);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Local Date (from the calendar picker) -> "YYYY-MM-DD" without time-zone drift. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> local Date at midnight (for the calendar picker). */
export function fromISODate(value?: string | null): Date | undefined {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}