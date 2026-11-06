/** Small CSV helpers shared by every "Export CSV" button. */

export type CsvValue = string | number | boolean | null | undefined;

const esc = (v: CsvValue) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Rows → CSV text. Starts with a BOM so Excel reads UTF-8 (lane names use "→"). */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return '﻿' + [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}

/** "Lane Comparison 11/03/2026 – 11/09/2026" → "lane-comparison-11-03-2026-11-09-2026.csv" */
export const csvFilename = (title: string) =>
  `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export'}.csv`;

/** Builds the CSV and starts the browser download. */
export function downloadCsv(title: string, header: string[], rows: CsvValue[][]) {
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = csvFilename(title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
