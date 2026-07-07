type InvokeHeaders = Record<string, string>;

function isPlainJsonBody(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== 'object') return false;
  if (Array.isArray(body)) return true;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  return true;
}

function headerEntries(headers: unknown): Array<[string, string]> {
  if (!headers || typeof headers !== 'object') return [];
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Array.from(headers.entries());
  }
  return Object.entries(headers as Record<string, unknown>)
    .filter(([, value]) => typeof value === 'string') as Array<[string, string]>;
}

function findHeaderKey(headers: unknown, name: string): string | null {
  const lower = name.toLowerCase();
  return headerEntries(headers).find(([key]) => key.toLowerCase() === lower)?.[0] ?? null;
}

function getHeaderValue(headers: unknown, name: string): string | null {
  const lower = name.toLowerCase();
  return headerEntries(headers).find(([key]) => key.toLowerCase() === lower)?.[1] ?? null;
}

/**
 * Supabase functions-js only serializes object bodies when invoke-level
 * `Content-Type` is absent. If callers pass `{ body: {...}, headers:
 * { 'Content-Type': 'application/json' } }`, the SDK sends an empty request.
 * Strip only that header for plain JSON object bodies so the SDK can set it
 * and serialize the body itself.
 */
export function normalizeInvokeOptions<T extends { headers?: unknown; body?: unknown } | undefined>(options: T): T {
  if (!options || !isPlainJsonBody(options.body)) return options;
  const contentTypeKey = findHeaderKey(options.headers, 'content-type');
  if (!contentTypeKey || !options.headers || typeof options.headers !== 'object') return options;
  if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
    const nextHeaders = new Headers(options.headers);
    nextHeaders.delete(contentTypeKey);
    return { ...options, headers: nextHeaders } as T;
  }
  const nextHeaders: InvokeHeaders = { ...(options.headers as InvokeHeaders) };
  delete nextHeaders[contentTypeKey];
  return { ...options, headers: nextHeaders } as T;
}

export function getInvokeTransportDiagnostics(options: { headers?: unknown; body?: unknown } | undefined) {
  const body = options?.body;
  const contentTypeHeader = getHeaderValue(options?.headers, 'content-type');
  const authHeaderPresent = !!getHeaderValue(options?.headers, 'authorization');
  const bodyIsObject = !!body && typeof body === 'object' && !Array.isArray(body);
  let estimatedJsonBytes: number | null = null;
  try {
    estimatedJsonBytes = body === undefined ? null : new Blob([JSON.stringify(body)]).size;
  } catch {
    estimatedJsonBytes = null;
  }
  return {
    bodyExists: body !== undefined && body !== null,
    bodyType: Array.isArray(body) ? 'array' : typeof body,
    payloadFieldNames: bodyIsObject ? Object.keys(body as Record<string, unknown>).sort() : [],
    estimatedJsonBytes,
    contentTypeHeader: contentTypeHeader ?? 'sdk-managed',
    authHeaderPresent,
    devHeaderPresent: !!getHeaderValue(options?.headers, 'x-dev-user-id'),
    requestMode: getHeaderValue(options?.headers, 'x-request-mode') ?? 'default',
    caller: getHeaderValue(options?.headers, 'x-plan-caller') ?? 'unknown',
  };
}
