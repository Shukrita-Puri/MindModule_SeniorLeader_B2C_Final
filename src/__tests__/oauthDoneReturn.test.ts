import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('OAuthDone return, toast, and immediate sync contract', () => {
  it('OAuthDone imports toast, triggers immediate sync, and dispatches mm:connections-changed', () => {
    const src = read('src/pages/OAuthDone.tsx');
    expect(src).toContain("import { toast } from 'sonner'");
    expect(src).toContain("window.dispatchEvent(new CustomEvent('mm:connections-changed'))");
    expect(src).toContain("supabase.functions.invoke('sync-calendar')");
    expect(src).toContain("supabase.functions.invoke('oura-sync')");
    expect(src).toContain("toast.success");
  });

  it('OAuthDone enforces automatic navigation return timer', () => {
    const src = read('src/pages/OAuthDone.tsx');
    expect(src).toContain('setTimeout');
    expect(src).toContain('navigate(targetUrl');
  });

  it('Edge functions calendar-auth and oura-oauth-callback target /oauth-done', () => {
    const calAuth = read('supabase/functions/calendar-auth/index.ts');
    const ouraAuth = read('supabase/functions/oura-oauth-callback/index.ts');
    expect(calAuth).toContain('/oauth-done?calendar_connected=true');
    expect(ouraAuth).toContain('/oauth-done?');
  });
});
