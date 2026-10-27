import { useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useData } from '@/context/DataContext';
import { useAuth } from '@clerk/react';
import { triggerSync, importHistoricalLoads } from '@/lib/loadsRepository';
import { useRole } from '@/auth/useRole';
import UsersRolesCard from '@/components/UsersRolesCard';
import { parseCSV } from '@/lib/computeLoads';
import { getDatasetBounds } from '@/lib/comparison';
import { Loader2, AlertTriangle, RefreshCw, Download, Database, History, Upload } from 'lucide-react';
import { formatUSDate, formatUSDateTime } from '@/lib/dates';

const sourceLabels = {
  turvo: 'Turvo (daily API sync)',
  csv: 'CSV import (this browser only)',
  none: 'No data yet',
} as const;

/** Sync and import change shared data, so only users with the Clerk "admin" role see them (the server checks it too). */
function TurvoSyncCard({ isAdmin }: { isAdmin: boolean }) {
  const { getToken } = useAuth();
  const { dataSource, dataLoading, dataError, rawLoads, lastSyncedAt, refreshLoads } = useData();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const bounds = getDatasetBounds(rawLoads);

  const handleSync = async (days = 45) => {
    setSyncing(true);
    setMessage(null);
    try {
      await triggerSync(getToken, days);
      setMessage(`Sync of the last ${days} days started. It usually takes a few minutes${days > 45 ? ' (longer for 180 days)' : ''}. Click Refresh afterwards to load the new data.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed to start');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="w-4 h-4" />
              Turvo Sync
            </CardTitle>
            <CardDescription>
              Shipments are pulled from Turvo every day at about 5 AM ET. Credentials are stored on the server, never in the browser.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => void handleSync(180)} disabled={syncing} className="gap-1.5" title="Turvo's API maximum. Run once to backfill; the daily sync keeps it going.">
                  <History className="w-3.5 h-3.5" />
                  Backfill 180 days
                </Button>
                <Button size="sm" onClick={() => void handleSync()} disabled={syncing} className="gap-1.5">
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Sync now
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => void refreshLoads()} disabled={dataLoading} className="gap-1.5">
              {dataLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Active source</p>
            <p className="font-medium mt-0.5">{dataLoading ? 'Loading…' : sourceLabels[dataSource]}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Loads in memory</p>
            <p className="font-medium mt-0.5">{rawLoads.length.toLocaleString('en-US')}</p>
            {bounds.min && <p className="text-[11px] text-muted-foreground">{formatUSDate(bounds.min)} – {formatUSDate(bounds.max)}</p>}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Last synced</p>
            <p className="font-medium mt-0.5">
              {lastSyncedAt ? formatUSDateTime(lastSyncedAt) : 'Never'}
            </p>
          </div>
        </div>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        {dataError && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Using fallback data</AlertTitle>
            <AlertDescription className="text-xs">{dataError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryImportCard() {
  const { getToken } = useAuth();
  const { rawLoads, refreshLoads } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { min } = getDatasetBounds(rawLoads);

  const handleFile = async (file: File) => {
    setBusy(true);
    setMessage('Reading file…');
    try {
      const parsed = parseCSV(await file.text()).filter(l => !l.loadId.startsWith('AUTO-'));
      if (parsed.length === 0) throw new Error('No loads found. Check the file has a Load / Shipment ID column.');
      const { added, skipped } = await importHistoricalLoads(getToken, parsed, (d, t) => setMessage(`Uploading ${d.toLocaleString('en-US')} / ${t.toLocaleString('en-US')}…`));
      setMessage(`Added ${added.toLocaleString('en-US')} historical loads (${skipped.toLocaleString('en-US')} already synced from Turvo were kept as-is).`);
      await refreshLoads();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-4 h-4" />
              Historical data (for year-over-year)
            </CardTitle>
            <CardDescription>
              Turvo’s API only returns the last 180 days, so “Same period last year” needs older loads imported once.
              Export shipments from Turvo (Reports → Shipments, CSV) going back at least 13 months and upload it here.
              It’s saved on the server for everyone; loads already synced from the API are never overwritten.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()} className="gap-1.5 shrink-0">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Import Turvo CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleFile(f); }}
          />
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          Data currently starts {min ? formatUSDate(min) : '—'}.
          {' '}Year-over-year works for any range whose last-year dates are on or after that day.
        </p>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}

/** Historical CSV import (admin only) — loads synced from the Turvo API always win over CSV rows with the same ID. */
const SHOW_CSV_IMPORT = true;

const SettingsView = () => {
  const { isAdmin } = useRole();
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage integrations and data connections</p>
      </div>
      <TurvoSyncCard isAdmin={isAdmin} />
      {isAdmin && <UsersRolesCard />}
      {SHOW_CSV_IMPORT && isAdmin && <HistoryImportCard />}
    </div>
  );
};

export default SettingsView;
