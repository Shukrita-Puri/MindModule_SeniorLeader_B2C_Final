/**
 * User self-serve account deletion (App Store Review Guideline 5.1.1(v)).
 *
 * Server-driven: calls the `delete-my-account` edge function, which decides
 * whose data to delete from the caller's Auth0 JWT. Local caches are cleared
 * and the user is signed out only AFTER the server confirms deletion, so a
 * failed request can never leave the user logged out with their data intact.
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getAuthHeaders } from '@/services/authTokenService';
import { useAuth } from '@/hooks/useAuth';

const CONFIRMATION = 'DELETE';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const { signOut } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmation.trim().toUpperCase() !== CONFIRMATION) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/delete-my-account`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation: CONFIRMATION }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Deletion failed (${res.status})`);

      toast.success('Your account and data have been deleted.');
      onOpenChange(false);
      // signOut() already unregisters this device's push token and wipes every
      // local/per-user cache before ending the Auth0 session.
      await signOut();
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Account deletion failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete your account</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This permanently deletes your Mind Module account and all associated data —
                check-ins, readiness history, plans, briefs, coach conversations, calendar and
                wearable records, and your connected-integration tokens. This cannot be undone.
              </p>
              <p>
                Deleting your account does <strong>not</strong> cancel an active subscription. If you
                subscribed through Apple, cancel it in Settings › Apple ID › Subscriptions. If you
                subscribed on the web, cancel it before deleting.
              </p>
              <p>
                Type <strong>{CONFIRMATION}</strong> below to confirm.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={CONFIRMATION}
          autoCapitalize="characters"
          data-testid="delete-account-confirmation"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Keep my account
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={deleting || confirmation.trim().toUpperCase() !== CONFIRMATION}
            data-testid="delete-account-confirm"
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}