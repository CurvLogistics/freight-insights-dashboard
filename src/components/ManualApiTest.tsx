import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Play, Plus, X } from 'lucide-react';

interface ManualResult {
  success: boolean;
  status?: number;
  error?: string;
  message?: string;
  response_body?: string;
  debug?: {
    full_url?: string;
    http_method?: string;
    headers_sent?: Record<string, string>;
    request_attempted?: boolean;
    response_status?: number | null;
    network_error?: string;
  };
}

const ManualApiTest = () => {
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ManualResult | null>(null);

  const addHeader = () => setHeaders(h => [...h, { key: '', value: '' }]);
  const removeHeader = (i: number) => setHeaders(h => h.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    setHeaders(h => { const next = [...h]; next[i] = { ...next[i], [field]: val }; return next; });
  };

  const handleRun = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);

    const headersObj: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim() && h.value.trim()) headersObj[h.key.trim()] = h.value.trim();
    }

    try {
      const { data, error } = await supabase.functions.invoke('turvo-proxy', {
        body: {
          mode: 'manual',
          manual_url: url.trim(),
          manual_method: method,
          manual_headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
          manual_body: method === 'POST' && body.trim() ? body.trim() : undefined,
        },
      });
      if (error) {
        setResult({ success: false, error: `Proxy error: ${error.message}` });
      } else {
        setResult(data as ManualResult);
      }
    } catch (err: any) {
      setResult({ success: false, error: `Failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const debug = result?.debug;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Manual API Test</CardTitle>
        <CardDescription>Paste an exact working request to validate it through the backend proxy</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="space-y-1.5">
            <Label>Full URL</Label>
            <Input placeholder="https://example.com/api/v1/endpoint" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={v => setMethod(v as 'GET' | 'POST')}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Headers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Headers</Label>
            <Button variant="ghost" size="sm" onClick={addHeader} className="gap-1 text-xs h-6 px-2">
              <Plus className="w-3 h-3" /> Add
            </Button>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input className="h-8 text-xs flex-1" placeholder="Header name" value={h.key} onChange={e => updateHeader(i, 'key', e.target.value)} />
              <Input className="h-8 text-xs flex-1" placeholder="Value" value={h.value} onChange={e => updateHeader(i, 'value', e.target.value)} />
              <Button variant="ghost" size="sm" onClick={() => removeHeader(i)} className="h-8 w-8 p-0 shrink-0">
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>

        {/* Body */}
        {method === 'POST' && (
          <div className="space-y-1.5">
            <Label>Request Body <span className="text-muted-foreground font-normal">(JSON)</span></Label>
            <Textarea className="font-mono text-xs min-h-[80px]" placeholder='{"key": "value"}' value={body} onChange={e => setBody(e.target.value)} />
          </div>
        )}

        <Button onClick={handleRun} disabled={loading || !url.trim()} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'Running…' : 'Run Manual Request'}
        </Button>

        {/* Debug output */}
        {debug && (
          <div className="rounded-md border border-border bg-muted/50 p-3 text-xs font-mono space-y-1">
            <p className="font-semibold text-foreground mb-1">Debug Details</p>
            <p><span className="text-muted-foreground">Full URL:</span> {debug.full_url || '—'}</p>
            <p><span className="text-muted-foreground">Method:</span> {debug.http_method || '—'}</p>
            <p><span className="text-muted-foreground">Request attempted:</span> {debug.request_attempted ? 'Yes' : 'No'}</p>
            <p><span className="text-muted-foreground">Response status:</span> {debug.response_status ?? '—'}</p>
            {debug.network_error && <p><span className="text-muted-foreground">Network error:</span> {debug.network_error}</p>}
            {debug.headers_sent && (
              <div className="mt-1">
                <p className="text-muted-foreground mb-0.5">Headers sent (masked):</p>
                {Object.entries(debug.headers_sent).map(([k, v]) => (
                  <p key={k} className="pl-2">{k}: {v}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Result message */}
        {result && !debug && (
          <div className={`rounded-md border p-3 text-xs ${result.success ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
            {result.error || result.message || 'Unknown result'}
          </div>
        )}

        {/* Response body */}
        {result?.response_body && (
          <div className="rounded-md border border-border bg-muted/50 p-3">
            <p className="text-xs font-semibold text-foreground mb-1">Response Body</p>
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-auto text-muted-foreground">{result.response_body}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ManualApiTest;
