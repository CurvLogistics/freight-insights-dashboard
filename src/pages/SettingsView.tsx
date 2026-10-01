import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useData } from '@/context/DataContext';
import { triggerSync } from '@/lib/loadsRepository';
import { Loader2, AlertTriangle, RefreshCw, Download, Database } from 'lucide-react';

const sourceLabels = {
  turvo: 'Turvo (weekly API sync)',
  sample: 'Bundled export (fallback)',
  csv: 'CSV import (this browser only)',
} as const;

function TurvoSyncCard() {
  const { dataSource, dataLoading, dataError, rawLoads, lastSyncedAt, refreshLoads } = useData();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      await triggerSync(45);
      setMessage('Sync started. It usually takes a few minutes. Click Refresh afterwards to load the new data.');
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
              Shipments are pulled from Turvo every Monday. Credentials are stored on the server, never in the browser.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" onClick={() => void handleSync()} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Sync now
            </Button>
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
            <p className="font-medium mt-0.5">{rawLoads.length.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Last synced</p>
            <p className="font-medium mt-0.5">
              {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never'}
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

const SettingsView = () => (
  <div className="p-6 space-y-6 max-w-4xl">
    <div>
      <h2 className="text-2xl font-bold">Settings</h2>
      <p className="text-sm text-muted-foreground">Manage integrations and data connections</p>
    </div>
    <TurvoSyncCard />
  </div>
);

export default SettingsView;