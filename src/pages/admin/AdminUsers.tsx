import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAuthToken } from '@/services/authTokenService';
import { useImpersonation } from '@/hooks/useImpersonation';
import { toast } from 'sonner';

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string | null;
  onboardingCompletedAt: string | null;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  wearableConnected: boolean;
  calendarConnected: boolean;
  lastCheckInDate: string | null;
  lastCardRunDate: string | null;
}

const AdminUsers = () => {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { start } = useImpersonation();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAuthToken();
        if (!token) throw new Error('Not authenticated');
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const params = new URLSearchParams();
        if (debounced) params.set('q', debounced);
        params.set('limit', '50');
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-list-users?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `HTTP ${res.status}`);
        }
        const body = await res.json();
        if (!cancelled) {
          setUsers(body.users ?? []);
          setTotal(body.total ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debounced]);

  const impersonate = async (u: UserRow) => {
    const res = await start({ id: u.id, email: u.email ?? '', name: u.name });
    if (!res.ok) {
      toast.error(res.error ?? 'Failed to start impersonation');
      return;
    }
    toast.success(`Now viewing as ${u.email ?? u.id}`);
    navigate('/executive-home');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${users.length} shown / ${total.toLocaleString()} total`}
          </p>
        </div>
        <Input
          placeholder="Search email, name, or user id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-80"
        />
      </header>

      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 px-3">Email</th>
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">User ID</th>
              <th className="py-2 px-3">Created</th>
              <th className="py-2 px-3">Onboarded</th>
              <th className="py-2 px-3">Wearable</th>
              <th className="py-2 px-3">Calendar</th>
              <th className="py-2 px-3">Last check-in</th>
              <th className="py-2 px-3">Last card</th>
              <th className="py-2 px-3">Subscription</th>
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                  No users match this search.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="py-2 px-3">{u.email ?? '—'}</td>
                <td className="py-2 px-3">{u.name ?? '—'}</td>
                <td className="py-2 px-3 font-mono text-xs truncate max-w-[18ch]" title={u.id}>{u.id}</td>
                <td className="py-2 px-3">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                <td className="py-2 px-3">{u.onboardingCompletedAt ? 'Yes' : 'No'}</td>
                <td className="py-2 px-3">
                  <Badge variant={u.wearableConnected ? 'default' : 'outline'}>
                    {u.wearableConnected ? 'On' : 'Off'}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  <Badge variant={u.calendarConnected ? 'default' : 'outline'}>
                    {u.calendarConnected ? 'On' : 'Off'}
                  </Badge>
                </td>
                <td className="py-2 px-3">{u.lastCheckInDate ?? '—'}</td>
                <td className="py-2 px-3">{u.lastCardRunDate ?? '—'}</td>
                <td className="py-2 px-3">
                  {u.subscriptionTier ?? '—'}
                  {u.subscriptionStatus ? (
                    <span className="ml-1 text-xs text-muted-foreground">({u.subscriptionStatus})</span>
                  ) : null}
                </td>
                <td className="py-2 px-3 text-right whitespace-nowrap">
                  <Link
                    to={`/admin/users/${encodeURIComponent(u.id)}`}
                    className="inline-block mr-2 text-xs underline underline-offset-4"
                  >
                    View
                  </Link>
                  <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => impersonate(u)}>
                    View as
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUsers;