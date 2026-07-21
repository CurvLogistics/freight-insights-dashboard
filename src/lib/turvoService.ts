import { supabase } from '@/integrations/supabase/client';

export interface TurvoCredentials {
  apiUsername: string;
  apiPassword: string;
  clientName: string;
  clientSecret: string;
  apiKey: string;
  baseApiUrl: string;
}

export type AuthMethod = 'turvo_oauth' | 'basic' | 'apikey' | 'basic_apikey' | 'client_credentials' | 'bearer';
export type HttpMethod = 'GET' | 'POST';

export interface TurvoRequestConfig {
  testEndpoint?: string;
  httpMethod: HttpMethod;
  authMethod: AuthMethod;
  apiKeyHeader: string;
  clientNameHeader: string;
  clientSecretHeader: string;
  bearerToken: string;
  customHeaders: { key: string; value: string }[];
  requestBody: string;
}

export type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'auth_failed' | 'error';

export interface TurvoStepResult {
  name: string;
  url: string;
  method: string;
  headers_sent?: Record<string, string>;
  status: number | null;
  success: boolean;
  response_body: string | null;
  error: string | null;
}

export interface TurvoDebugInfo {
  full_url?: string;
  http_method?: string;
  auth_method?: string;
  headers_sent?: Record<string, string>;
  has_body?: boolean;
  request_attempted?: boolean;
  response_status?: number | null;
  network_error?: string;
  oauth_token_obtained?: boolean;
  oauth_token_url?: string;
  step?: string;
}

export interface TurvoTestResult {
  status: ConnectionStatus;
  message: string;
  responseBody?: string;
  debug?: TurvoDebugInfo;
  steps?: TurvoStepResult[];
}

const STORAGE_KEY = 'freightops_turvo_credentials';

export function saveCredentials(creds: TurvoCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function loadCredentials(): TurvoCredentials | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as TurvoCredentials; } catch { return null; }
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function testConnection(creds: TurvoCredentials, config: TurvoRequestConfig): Promise<TurvoTestResult> {
  if (!creds.baseApiUrl.trim()) {
    return { status: 'error', message: 'Base API URL is required' };
  }
  try { new URL(creds.baseApiUrl); } catch { return { status: 'error', message: 'Invalid Base API URL' }; }

  // Turvo OAuth mode: two-step token exchange
  if (config.authMethod === 'turvo_oauth') {
    try {
      const { data, error } = await supabase.functions.invoke('turvo-proxy', {
        body: {
          mode: 'turvo_oauth',
          base_url: creds.baseApiUrl.trim(),
          username: creds.apiUsername.trim(),
          password: creds.apiPassword,
          client_id: creds.clientName.trim(),
          client_secret: creds.clientSecret,
          api_key: creds.apiKey,
          test_endpoint: config.testEndpoint?.trim() || undefined,
        },
      });

      if (error) return { status: 'error', message: `Proxy error: ${error.message}`, steps: [] };
      if (!data) return { status: 'error', message: 'No response from backend', steps: [] };

      const steps: TurvoStepResult[] = data.steps || [];
      if (data.success) return { status: 'connected', message: data.message || 'Connected', steps };

      const failedStep = steps.find(s => !s.success);
      const httpStatus = failedStep?.status || 0;
      if (httpStatus === 401 || httpStatus === 403) {
        return { status: 'auth_failed', message: data.error || 'Auth failed', steps };
      }
      return { status: 'error', message: data.error || 'Unknown error', steps };
    } catch (err: any) {
      return { status: 'error', message: `Connection failed: ${err.message}`, steps: [] };
    }
  }

  // Generic mode (unchanged)
  const customHeadersObj: Record<string, string> = {};
  for (const h of config.customHeaders) {
    if (h.key.trim() && h.value.trim()) customHeadersObj[h.key.trim()] = h.value.trim();
  }

  try {
    const { data, error } = await supabase.functions.invoke('turvo-proxy', {
      body: {
        base_url: creds.baseApiUrl.trim(),
        test_endpoint: config.testEndpoint?.trim() || undefined,
        http_method: config.httpMethod,
        auth_method: config.authMethod,
        username: creds.apiUsername.trim() || undefined,
        password: creds.apiPassword || undefined,
        api_key: creds.apiKey || undefined,
        api_key_header: config.apiKeyHeader.trim() || 'x-api-key',
        client_name: creds.clientName || undefined,
        client_secret: creds.clientSecret || undefined,
        client_name_header: config.clientNameHeader.trim() || 'client_name',
        client_secret_header: config.clientSecretHeader.trim() || 'client_secret',
        bearer_token: config.bearerToken || undefined,
        custom_headers: Object.keys(customHeadersObj).length > 0 ? customHeadersObj : undefined,
        request_body: config.httpMethod === 'POST' && config.requestBody.trim() ? config.requestBody.trim() : undefined,
      },
    });

    if (error) return { status: 'error', message: `Proxy error: ${error.message}` };
    if (!data) return { status: 'error', message: 'No response from backend' };

    const debug: TurvoDebugInfo = data.debug || {};
    if (data.success) return { status: 'connected', message: data.message || 'Connected', responseBody: data.response_body, debug };

    const errMsg: string = data.error || 'Unknown error';
    const httpStatus: number = data.status || 0;
    if (httpStatus === 401 || httpStatus === 403) return { status: 'auth_failed', message: errMsg, responseBody: data.response_body, debug };
    return { status: 'error', message: errMsg, responseBody: data.response_body, debug };
  } catch (err: any) {
    return { status: 'error', message: `Connection failed: ${err.message}` };
  }
}
