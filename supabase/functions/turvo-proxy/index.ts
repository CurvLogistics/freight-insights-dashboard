const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (lower === "authorization" || lower.includes("secret") || lower.includes("key") || lower.includes("token")) {
      out[k] = String(v).substring(0, 8) + "…";
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

// ── Turvo OAuth: token exchange then test call ──
async function handleTurvoOAuth(body: Record<string, any>) {
  const { base_url, username, password, client_id, client_secret, api_key, test_endpoint } = body;

  if (!base_url || !username || !password || !client_id || !client_secret || !api_key) {
    return jsonResponse({
      success: false,
      error: "Missing required fields: base_url, username, password, client_id, client_secret, api_key",
      steps: [],
    }, 400);
  }

  const cleanBase = String(base_url).replace(/\/+$/, "");

  // ── Step 1: OAuth Token ──
  const tokenUrl = `${cleanBase}/oauth/token?client_id=${encodeURIComponent(client_id)}&client_secret=${encodeURIComponent(client_secret)}`;
  const tokenBodyObj = {
    grant_type: "password", username, password, client_id, client_secret,
    scope: "read trust write", type: "business",
  };
  const tokenHeaders: Record<string, string> = {
    "Content-Type": "application/json", "Accept": "application/json", "x-api-key": api_key,
  };

  const step1: Record<string, unknown> = {
    name: "OAuth Token Request",
    url: tokenUrl,
    method: "POST",
    headers_sent: maskHeaders(tokenHeaders),
    status: null,
    success: false,
    response_body: null,
    error: null,
  };

  console.log(`[turvo-proxy][oauth] POST ${tokenUrl}`);

  let accessToken: string | null = null;
  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST", headers: tokenHeaders, body: JSON.stringify(tokenBodyObj),
    });
    step1.status = tokenRes.status;
    const tokenText = await tokenRes.text();
    step1.response_body = tokenText.length > 1500 ? tokenText.substring(0, 1500) + "…" : tokenText;

    if (tokenRes.ok) {
      try {
        const tokenData = JSON.parse(tokenText);
        accessToken = tokenData.access_token || null;
        step1.success = !!accessToken;
        if (!accessToken) step1.error = "Response missing access_token field";
      } catch {
        step1.error = "Could not parse token JSON";
      }
    } else {
      step1.error = `HTTP ${tokenRes.status}`;
    }
  } catch (err) {
    step1.error = (err as Error).message || String(err);
  }

  // If step 1 failed, return early with just that step
  if (!accessToken) {
    return jsonResponse({
      success: false,
      error: `OAuth token request failed: ${step1.error}`,
      steps: [step1],
    });
  }

  // ── Step 2: Test Endpoint ──
  const endpoint = test_endpoint ? String(test_endpoint).replace(/^\/+/, "") : "users/list";
  const testUrl = `${cleanBase}/${endpoint}`;
  const testHeaders: Record<string, string> = {
    "Content-Type": "application/json", "Accept": "application/json",
    "Authorization": `Bearer ${accessToken}`, "x-api-key": api_key,
  };

  const step2: Record<string, unknown> = {
    name: "Test Endpoint Request",
    url: testUrl,
    method: "GET",
    headers_sent: maskHeaders(testHeaders),
    status: null,
    success: false,
    response_body: null,
    error: null,
  };

  console.log(`[turvo-proxy][oauth] GET ${testUrl}`);

  try {
    const testRes = await fetch(testUrl, { method: "GET", headers: testHeaders });
    step2.status = testRes.status;
    let text = ""; try { text = await testRes.text(); } catch { /* ok */ }
    step2.response_body = text.length > 1500 ? text.substring(0, 1500) + "…" : text;
    step2.success = testRes.ok;
    if (!testRes.ok) step2.error = `HTTP ${testRes.status}`;
  } catch (err) {
    step2.error = (err as Error).message || String(err);
  }

  const allSuccess = !!(step1.success && step2.success);
  return jsonResponse({
    success: allSuccess,
    message: allSuccess ? `Connected! GET ${testUrl} → ${step2.status} OK` : undefined,
    error: allSuccess ? undefined : `Failed at: ${!step1.success ? "OAuth Token" : "Test Endpoint"}`,
    steps: [step1, step2],
  });
}

// ── Manual mode: raw passthrough ──
async function handleManual(body: Record<string, any>) {
  const { manual_url, manual_method, manual_headers, manual_body } = body;

  if (!manual_url) {
    return jsonResponse({ success: false, error: "URL is required", debug: { request_attempted: false } }, 400);
  }

  const mMethod = (manual_method || "GET").toUpperCase();
  const mHeaders: Record<string, string> = manual_headers && typeof manual_headers === "object" ? { ...manual_headers } : {};

  const debugInfo = {
    full_url: manual_url, http_method: mMethod, auth_method: "manual",
    headers_sent: maskHeaders(mHeaders), has_body: !!manual_body, request_attempted: true,
  };

  console.log(`[turvo-proxy][manual] ${mMethod} ${manual_url}`);

  try {
    const opts: RequestInit = { method: mMethod, headers: mHeaders };
    if (mMethod === "POST" && manual_body) opts.body = manual_body;
    const res = await fetch(manual_url, opts);
    let text = ""; try { text = await res.text(); } catch { /* ok */ }
    const trunc = text.length > 2000 ? text.substring(0, 2000) + "…(truncated)" : text;
    return jsonResponse({
      success: res.ok, message: `${mMethod} ${manual_url} → ${res.status}`,
      status: res.status, response_body: trunc,
      debug: { ...debugInfo, response_status: res.status },
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    return jsonResponse({
      success: false, error: `Connection failed: ${msg}`,
      debug: { ...debugInfo, response_status: null, network_error: msg },
    });
  }
}

// ── Standard/generic mode ──
async function handleStandard(body: Record<string, any>) {
  const {
    base_url, test_endpoint, http_method = "GET", auth_method = "basic_apikey",
    username, password, api_key, api_key_header = "x-api-key",
    client_name, client_secret, client_name_header = "client_name",
    client_secret_header = "client_secret", bearer_token,
    custom_headers = {}, request_body,
  } = body;

  if (!base_url) {
    return jsonResponse({ success: false, error: "Base API URL is required", debug: { request_attempted: false } }, 400);
  }

  const cleanBase = String(base_url).replace(/\/+$/, "");
  const fullUrl = test_endpoint
    ? `${cleanBase}/${String(test_endpoint).replace(/^\/+/, "")}`
    : cleanBase;

  const method = (http_method || "GET").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
  const authMethod = auth_method || "basic_apikey";

  if (authMethod === "basic" || authMethod === "basic_apikey") {
    if (username && password) headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
  }
  if (authMethod === "apikey" || authMethod === "basic_apikey") {
    if (api_key) headers[api_key_header || "x-api-key"] = api_key;
  }
  if (authMethod === "client_credentials" || authMethod === "basic_apikey") {
    if (client_name) headers[client_name_header || "client_name"] = client_name;
    if (client_secret) headers[client_secret_header || "client_secret"] = client_secret;
  }
  if (authMethod === "bearer") {
    if (bearer_token) headers["Authorization"] = `Bearer ${bearer_token}`;
  }

  if (custom_headers && typeof custom_headers === "object") {
    for (const [k, v] of Object.entries(custom_headers)) {
      if (k && v) headers[k] = v as string;
    }
  }

  const debugInfo = {
    full_url: fullUrl, http_method: method, auth_method: authMethod,
    headers_sent: maskHeaders(headers), has_body: !!request_body, request_attempted: true,
  };

  console.log(`[turvo-proxy] ${method} ${fullUrl}`);

  try {
    const fetchOpts: RequestInit = { method, headers };
    if (method === "POST" && request_body) fetchOpts.body = request_body;
    const res = await fetch(fullUrl, fetchOpts);

    let responseText = "";
    try { responseText = await res.text(); } catch { /* ok */ }
    const truncated = responseText.length > 2000 ? responseText.substring(0, 2000) + "…" : responseText;

    if (res.ok) {
      return jsonResponse({
        success: true, message: `${method} ${fullUrl} → ${res.status} OK`,
        status: res.status, response_body: truncated,
        debug: { ...debugInfo, response_status: res.status },
      });
    }

    let errorLabel = `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) errorLabel = `Auth failed (${res.status})`;
    if (res.status === 404) errorLabel = `Endpoint not found (${res.status})`;

    return jsonResponse({
      success: false, error: errorLabel, status: res.status, response_body: truncated,
      debug: { ...debugInfo, response_status: res.status },
    });
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    const isHostUnreachable = /dns|resolve|ENOTFOUND|getaddrinfo/i.test(errMsg);
    return jsonResponse({
      success: false,
      error: isHostUnreachable
        ? `Host unreachable — could not resolve ${cleanBase}. Base URL may be incorrect.`
        : `Connection failed: ${errMsg}`,
      debug: { ...debugInfo, response_status: null, network_error: errMsg },
    });
  }
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const mode = body.mode as string | undefined;

  if (mode === "manual") return handleManual(body as any);
  if (mode === "turvo_oauth") return handleTurvoOAuth(body as any);
  return handleStandard(body as any);
});
