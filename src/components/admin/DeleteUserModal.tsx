import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { getAuthToken } from '@/services/authTokenService';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { id: string; email: string | null; name: string | null };
  onDeleted: () => void;
}

interface PreviewResp {
  target: { id: string; email: string | null; name: string | null };
  counts: Record<string, number>;
  totalRows: number;
}

const CONFIRM = 'DELETE USER';

const DeleteUserModal = ({ open, onOpenChange, target, onDeleted }: Props) => {
  const [phrase, setPhrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhrase('');
    setAcknowledged(false);
    setPreview(null);
    setError(null);
    let cancelled = false;
    (async () => {
      setLoadingPreview(true);
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('Not authenticated');
        const { data, error } = await supabase.functions.invoke('admin-user-delete-preview', {
          headers: { Authorization: `Bearer ${token}` },
          body: { userId: target.id },
        });
        if (error) throw new Error(error.message);
        if (!cancelled) setPreview(data as PreviewResp);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, target.id]);

  const canDelete = phrase === CONFIRM && acknowledged && !deleting && !!preview;

  const submit = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');
      const { error } = await supabase.functions.invoke('admin-delete-user', {
        headers: { Authorization: `Bearer ${token}` },
        body: { userId: target.id, confirmation: CONFIRM },
      });
      if (error) throw new Error(error.message);
      toast.success(`Deleted ${target.email ?? target.id}`);
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const nonZeroCounts = preview
    ? Object.entries(preview.counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete user permanently</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="font-medium text-destructive">
              This will permanently delete this user's MindModule data across the system. This action cannot be undone.
            </p>
          </div>

          <div className="rounded-md border border-border p-3 space-y-1">
            <div><span className="text-muted-foreground">Name: </span>{target.name ?? '—'}</div>
            <div><span className="text-muted-foreground">Email: </span>{target.email ?? '—'}</div>
            <div className="font-mono text-xs break-all"><span className="text-muted-foreground font-sans">ID: </span>{target.id}</div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Deletion impact</div>
            {loadingPreview && <p className="text-muted-foreground">Calculating…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {preview && (
              <>
                <p className="mb-1">
                  Total rows to delete: <span className="font-semibold">{preview.totalRows.toLocaleString()}</span>
                </p>
                <div className="max-h-40 overflow-y-auto rounded border border-border/60 text-xs">
                  {nonZeroCounts.length === 0 ? (
                    <p className="p-2 text-muted-foreground">No user data found.</p>
                  ) : (
                    <table className="w-full">
                      <tbody>
                        {nonZeroCounts.map(([t, n]) => (
                          <tr key={t} className="border-b border-border/40 last:border-b-0">
                            <td className="py-1 px-2 font-mono">{t}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{n.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{CONFIRM}</span> to confirm:
            </label>
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={CONFIRM}
              autoComplete="off"
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              className="mt-0.5"
            />
            <span>I understand this will permanently delete this user's data.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canDelete}>
            {deleting ? 'Deleting…' : 'Delete user permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteUserModal;
