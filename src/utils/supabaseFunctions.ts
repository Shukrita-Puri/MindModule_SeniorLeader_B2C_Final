export function getSupabaseFunctionUrl(functionName: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    return `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/${functionName}`;
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PROJECT_ID');
  }

  return `https://${projectId}.supabase.co/functions/v1/${functionName}`;
}

export function getSupabaseFunctionHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (anonKey) headers.apikey = anonKey;
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

export async function readResponseBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export function describeFetchError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
