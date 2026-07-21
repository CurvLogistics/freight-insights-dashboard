import { useState, useEffect } from 'react';
import ManualApiTest from '@/components/ManualApiTest';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  TurvoCredentials, TurvoRequestConfig, AuthMethod, HttpMethod,
  ConnectionStatus, TurvoStepResult,
  saveCredentials, loadCredentials, clearCredentials, testConnection,
} from '@/lib/turvoService';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Plug, Trash2, Eye, EyeOff, Plus, X } from 'lucide-react';

const emptyCreds: TurvoCredentials = {
  apiUsername: '', apiPassword: '', clientName: '', clientSecret: '', apiKey: '',
  baseApiUrl: 'https://publicapi.turvo.com/v1',
};

const defaultConfig: TurvoRequestConfig = {
  testEndpoint: 'users/list',
  httpMethod: 'GET',
  authMethod: 'turvo_oauth',
  apiKeyHeader: 'x-api-key',
  clientNameHeader: 'client_name',
  clientSecretHeader: 'client_secret',
  bearerToken: '',
  customHeaders: [],
  requestBody: '',
};

const authMethodLabels: Record<AuthMethod, string> = {
  turvo_oauth: 'Turvo OAuth (Recommended)',
  basic: 'Basic Auth',
  apikey: 'API Key Header',
  client_credentials: 'Client Credentials',
  basic_apikey: 'Basic Auth + API Key',
  bearer: 'Bearer Token',
};

function statusLabel(s: ConnectionStatus) {
  switch (s) {
    case 'idle': return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Plug className="w-3 h-3" />Not Connected</span>;
    case 'testing': return <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Loader2 className="w-3 h-3 animate-spin" />Testing…</span>;
    case 'connected': return <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" />Connected</span>;
    case 'auth_failed': return <span className="inline-flex items-center gap-1 text-xs text-destructive"><XCircle className="w-3 h-3" />Auth Failed</span>;
    case 'error': return <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="w-3 h-3" />Error</span>;
  }
}

const SettingsView = () => {
  const [creds, setCreds] = useState<TurvoCredentials>(emptyCreds);
  const [config, setConfig] = useState<TurvoRequestConfig>(defaultConfig);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [message, setMessage] = useState('');
  const [steps, setSteps] = useState<TurvoStepResult[]>([]);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    const saved = loadCredentials();
    if (saved) { setCreds(prev => ({ ...prev, ...saved })); setMessage('Saved credentials loaded'); }
  }, []);

  const setCred = (key: keyof TurvoCredentials, val: string) =>
    setCreds(prev => ({ ...prev, [key]: val }));

  const setConf = <K extends keyof TurvoRequestConfig>(key: K, val: TurvoRequestConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  const addHeader = () => setConf('customHeaders', [...config.customHeaders, { key: '', value: '' }]);
  const removeHeader = (i: number) => setConf('customHeaders', config.customHeaders.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...config.customHeaders];
    next[i] = { ...next[i], [field]: val };
    setConf('customHeaders', next);
  };

  const handleSave = () => { saveCredentials(creds); setMessage('Credentials saved locally'); };

  const handleTest = async () => {
    setStatus('testing');
    setMessage('');
    setSteps([]);
    const result = await testConnection(creds, config);
    setStatus(result.status);
    setMessage(result.message);
    setSteps(result.steps || []);
  };

  const handleClear = () => {
    clearCredentials();
    setCreds(emptyCreds);
    setConfig(defaultConfig);
    setStatus('idle');
    setMessage('Credentials cleared');
    setSteps([]);
  };

  const isTurvoOAuth = config.authMethod === 'turvo_oauth';
  const secretType = showSecrets ? 'text' : 'password';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage integrations and data connections</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Turvo Connection</CardTitle>
              <CardDescription>Configure API credentials to connect FreightOps to Turvo</CardDescription>
            </div>
            {statusLabel(status)}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Auth Method — shown first */}
          <div className="space-y-1.5">
            <Label>Auth Method</Label>
            <Select value={config.authMethod} onValueChange={v => setConf('authMethod', v as AuthMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(authMethodLabels) as [AuthMethod, string][]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isTurvoOAuth && (
              <p className="text-[11px] text-muted-foreground">
                Uses the documented Turvo OAuth flow: POST /oauth/token with your credentials to get a bearer token, then calls the test endpoint.
              </p>
            )}
          </div>

          {/* Base URL */}
          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">Base API URL</Label>
            <Input id="baseUrl" placeholder="https://publicapi.turvo.com/v1" value={creds.baseApiUrl} onChange={e => setCred('baseApiUrl', e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Production: https://publicapi.turvo.com/v1 · Sandbox: https://my-sandbox-publicapi.turvo.com/v1
            </p>
          </div>

          {/* Credentials toggle */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Credentials</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowSecrets(p => !p)} className="gap-1 text-xs">
              {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecrets ? 'Hide' : 'Show'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">{isTurvoOAuth ? 'Username (Email)' : 'API Username'}</Label>
              <Input id="username" placeholder="user@company.com" value={creds.apiUsername} onChange={e => setCred('apiUsername', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type={secretType} placeholder="••••••••" value={creds.apiPassword} onChange={e => setCred('apiPassword', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="clientName">{isTurvoOAuth ? 'Client ID (OAuth)' : 'Client Name'}</Label>
              <Input id="clientName" placeholder="your-client-id" value={creds.clientName} onChange={e => setCred('clientName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientSecret">{isTurvoOAuth ? 'Client Secret (OAuth)' : 'Client Secret'}</Label>
              <Input id="clientSecret" type={secretType} placeholder="••••••••" value={creds.clientSecret} onChange={e => setCred('clientSecret', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apiKey">API Key</Label>
            <Input id="apiKey" type={secretType} placeholder="••••••••" value={creds.apiKey} onChange={e => setCred('apiKey', e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              {isTurvoOAuth ? 'Sent as x-api-key header on all requests per Turvo docs.' : 'Sent via the configured header name.'}
            </p>
          </div>

          {/* ── Request Configuration ── */}
          <div className="border-t border-border pt-4 space-y-4">
            <h3 className="text-sm font-medium text-foreground">Request Configuration</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="testEndpoint">Test Endpoint <span className="text-muted-foreground font-normal">(path)</span></Label>
                {isTurvoOAuth ? (
                  <Select value={config.testEndpoint || 'users/list'} onValueChange={v => setConf('testEndpoint', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="users/list">users/list</SelectItem>
                      <SelectItem value="shipments/list">shipments/list</SelectItem>
                      <SelectItem value="orders/list">orders/list</SelectItem>
                      <SelectItem value="loads/list">loads/list</SelectItem>
                      <SelectItem value="customers/list">customers/list</SelectItem>
                      <SelectItem value="carriers/list">carriers/list</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id="testEndpoint" placeholder="e.g. users/list" value={config.testEndpoint} onChange={e => setConf('testEndpoint', e.target.value)} />
                )}
              </div>

              {!isTurvoOAuth && (
                <div className="space-y-1.5">
                  <Label>HTTP Method</Label>
                  <Select value={config.httpMethod} onValueChange={v => setConf('httpMethod', v as HttpMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {config.authMethod === 'bearer' && (
              <div className="space-y-1.5">
                <Label htmlFor="bearerToken">Bearer Token</Label>
                <Input id="bearerToken" type={secretType} placeholder="token" value={config.bearerToken} onChange={e => setConf('bearerToken', e.target.value)} />
              </div>
            )}

            {/* Header name overrides (non-oauth modes) */}
            {!isTurvoOAuth && (
              <div className="grid grid-cols-3 gap-3">
                {(config.authMethod === 'apikey' || config.authMethod === 'basic_apikey') && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">API Key Header Name</Label>
                    <Input className="h-8 text-xs" value={config.apiKeyHeader} onChange={e => setConf('apiKeyHeader', e.target.value)} />
                  </div>
                )}
                {(config.authMethod === 'client_credentials' || config.authMethod === 'basic_apikey') && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Client Name Header</Label>
                      <Input className="h-8 text-xs" value={config.clientNameHeader} onChange={e => setConf('clientNameHeader', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Client Secret Header</Label>
                      <Input className="h-8 text-xs" value={config.clientSecretHeader} onChange={e => setConf('clientSecretHeader', e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Custom Headers (non-oauth) */}
            {!isTurvoOAuth && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">Custom Headers</Label>
                  <Button variant="ghost" size="sm" onClick={addHeader} className="gap-1 text-xs h-6 px-2">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                {config.customHeaders.map((h, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input className="h-8 text-xs flex-1" placeholder="Header name" value={h.key} onChange={e => updateHeader(i, 'key', e.target.value)} />
                    <Input className="h-8 text-xs flex-1" placeholder="Value" value={h.value} onChange={e => updateHeader(i, 'value', e.target.value)} />
                    <Button variant="ghost" size="sm" onClick={() => removeHeader(i)} className="h-8 w-8 p-0 shrink-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Request Body (non-oauth POST) */}
            {!isTurvoOAuth && config.httpMethod === 'POST' && (
              <div className="space-y-1.5">
                <Label>Request Body <span className="text-muted-foreground font-normal">(JSON)</span></Label>
                <Textarea className="font-mono text-xs min-h-[80px]" placeholder='{"key": "value"}' value={config.requestBody} onChange={e => setConf('requestBody', e.target.value)} />
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground border-l-2 border-muted pl-3">
            Credentials are stored in your browser's local storage.
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleTest} disabled={status === 'testing'} className="gap-2">
              {status === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              {status === 'testing' ? 'Testing…' : 'Test Connection'}
            </Button>
            <Button variant="secondary" onClick={handleSave}>Save Credentials</Button>
            <Button variant="ghost" onClick={handleClear} className="gap-1 text-muted-foreground ml-auto">
              <Trash2 className="w-4 h-4" /> Clear
            </Button>
          </div>

          {/* Result */}
          {message && status !== 'idle' && (
            <Alert variant={status === 'connected' ? 'default' : 'destructive'} className="mt-4">
              {status === 'connected' ? <CheckCircle2 className="h-4 w-4" /> : status === 'auth_failed' ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>
                {status === 'connected' ? 'Connection Successful' : status === 'auth_failed' ? 'Authentication Failed' : status === 'testing' ? 'Testing…' : 'Connection Error'}
              </AlertTitle>
              <AlertDescription className="text-xs mt-1">{message}</AlertDescription>
            </Alert>
          )}

          {/* Two-step diagnostic */}
          {steps.length > 0 && (
            <div className="mt-4 space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="rounded-md border border-border bg-muted/50 p-3 text-xs font-mono space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    {step.success
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                    <span className="font-semibold text-foreground">Step {i + 1}: {step.name}</span>
                    <span className={`ml-auto text-[11px] px-1.5 py-0.5 rounded ${step.success ? 'bg-emerald-100 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>
                      {step.success ? 'OK' : 'FAILED'}
                    </span>
                  </div>
                  <p><span className="text-muted-foreground">URL:</span> {step.url}</p>
                  <p><span className="text-muted-foreground">Method:</span> {step.method}</p>
                  <p><span className="text-muted-foreground">Status:</span> {step.status ?? '—'}</p>
                  {step.error && <p><span className="text-muted-foreground">Error:</span> <span className="text-destructive">{step.error}</span></p>}
                  {step.headers_sent && (
                    <div className="mt-1">
                      <p className="text-muted-foreground mb-0.5">Headers:</p>
                      {Object.entries(step.headers_sent).map(([k, v]) => (
                        <p key={k} className="pl-2">{k}: {v}</p>
                      ))}
                    </div>
                  )}
                  {step.response_body && (
                    <div className="mt-1">
                      <p className="text-muted-foreground mb-0.5">Response:</p>
                      <pre className="whitespace-pre-wrap break-all max-h-[200px] overflow-auto text-muted-foreground pl-2">{step.response_body}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ManualApiTest />
    </div>
  );
};

export default SettingsView;
