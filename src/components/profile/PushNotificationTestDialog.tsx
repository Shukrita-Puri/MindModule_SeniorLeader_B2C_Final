import { useState } from 'react';
import { Bell, RefreshCw, RotateCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAuthToken } from '@/services/authTokenService';
import { useAuth } from '@/hooks/useAuth';
import {
  forcePushReRegistration,
  getNotificationDiagnostics,
  sendLocalTestNotificationNow,
  type NotificationDiagnostics,
} from '@/utils/notificationDiagnostics';
import { getSupabaseFunctionHeaders, getSupabaseFunctionUrl, readResponseBody } from '@/utils/supabaseFunctions';

interface PushNotificationTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BusyAction = 'refresh' | 'reregister' | 'local' | 'remote' | null;

function formatPermission(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? 'unknown');
  const record = value as Record<string, unknown>;
  return String(record.receive ?? record.display ?? record.status ?? 'unknown');
}

function formatRemoteResult(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const sent = record.tokens_sent;
  const env = record.apns_env;
  const results = Array.isArray(record.results) ? record.results : [];
  const statuses = results
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return `${row.status ?? 'unknown'} (${row.response ?? 'no response'})`;
    })
    .filter(Boolean)
    .join(', ');
  return `APNs ${env ?? 'unknown'} · sent ${sent ?? results.length} · ${statuses || 'no token result'}`;
}

export default function PushNotificationTestDialog({
  open,
  onOpenChange,
}: PushNotificationTestDialogProps) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [remoteResult, setRemoteResult] = useState<string | null>(null);

  const run = async (action: Exclude<BusyAction, null>, task: () => Promise<void>) => {
    setBusy(action);
    try {
      await task();
    } catch (err) {
      console.error('[PushNotificationTestDialog] action failed:', err);
      toast.error('Push notification test failed');
    } finally {
      setBusy(null);
    }
  };

  const refresh = () => run('refresh', async () => {
    setDiagnostics(await getNotificationDiagnostics());
    toast.success('Push status refreshed');
  });

  const reregister = () => run('reregister', async () => {
    setDiagnostics(await forcePushReRegistration());
    toast.success('APNs re-registration requested');
  });

  const localTest = () => run('local', async () => {
    setDiagnostics(await sendLocalTestNotificationNow());
    toast.success('Local notification scheduled');
  });

  const remoteTest = () => run('remote', async () => {
    if (!user?.email) {
      toast.error('No profile email available for targeted push test');
      return;
    }
    const token = await getAuthToken();
    const response = await fetch(getSupabaseFunctionUrl('test-push'), {
      method: 'POST',
      headers: getSupabaseFunctionHeaders(token),
      body: JSON.stringify({ email: user.email }),
    });
    const body = await readResponseBody(response);
    let parsed: unknown = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      parsed = body;
    }

    if (!response.ok) {
      const message =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error?: unknown }).error)
          : body || `HTTP ${response.status}`;
      setRemoteResult(`Failed · ${message}`);
      toast.error('Remote push test failed');
      return;
    }

    const summary = formatRemoteResult(parsed) ?? 'Remote push test sent';
    setRemoteResult(summary);
    toast.success('Remote push test sent');
  });

  const tokenMeta = diagnostics?.apnsToken;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Push Notification Test</DialogTitle>
          <DialogDescription>
            Check this device, refresh its APNs token, and send a targeted test push.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-[14px] border bg-card p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between gap-3">
              <span>Platform</span>
              <span className="text-foreground">{diagnostics?.platform ?? 'Not checked'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Push permission</span>
              <span className="text-foreground">{diagnostics ? formatPermission(diagnostics.pushPermission) : 'Not checked'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Local permission</span>
              <span className="text-foreground">{diagnostics ? formatPermission(diagnostics.localPermission) : 'Not checked'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>APNs token</span>
              <span className="text-foreground">
                {tokenMeta?.tokenPrefix ? `${tokenMeta.tokenPrefix}… (${tokenMeta.tokenLength})` : 'Not captured'}
              </span>
            </div>
            {remoteResult && (
              <div className="pt-2 text-foreground leading-relaxed">{remoteResult}</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" className="justify-start gap-2" onClick={refresh} disabled={busy !== null}>
              <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
              Refresh Push Status
            </Button>
            <Button variant="outline" className="justify-start gap-2" onClick={reregister} disabled={busy !== null}>
              <RotateCw className={`h-4 w-4 ${busy === 'reregister' ? 'animate-spin' : ''}`} />
              Re-register APNs Token
            </Button>
            <Button variant="outline" className="justify-start gap-2" onClick={localTest} disabled={busy !== null}>
              <Bell className="h-4 w-4" />
              Send Local Test
            </Button>
            <Button className="justify-start gap-2" onClick={remoteTest} disabled={busy !== null || !user?.email}>
              <Send className="h-4 w-4" />
              Send Remote Push Test
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
