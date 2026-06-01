import { useEffect, useState } from 'react';
import { Linkedin, Info, Pencil, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { useAuth } from '@/hooks/useAuth';

type ExternalProfileRow = {
  profile_url: string;
  scrape_status: string;
  scraped_at: string | null;
};

const LINKEDIN_RX =
  /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?(\?.*)?$/i;

const TOOLTIP_TEXT =
  "Share your public LinkedIn profile URL. We'll use it to understand your Leadership context.";

function normalizeForValidation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function displayHandle(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

export default function LinkedInAccountRow() {
  const { user } = useAuth();
  const [existing, setExisting] = useState<ExternalProfileRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('user_external_profiles')
        .select('profile_url, scrape_status, scraped_at')
        .eq('user_id', user.id)
        .eq('source', 'linkedin_public_profile')
        .order('scraped_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) setExisting(data as ExternalProfileRow);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const openEditor = () => {
    setUrl(existing?.profile_url || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const normalized = normalizeForValidation(url);
    if (!LINKEDIN_RX.test(normalized)) {
      toast.error('Please paste a valid public LinkedIn profile URL.');
      return;
    }
    setLoading(true);
    try {
      const token = await getAuthToken();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/linkedin-profile-scrape`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ linkedinUrl: normalized }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || 'Could not import LinkedIn profile.');
        return;
      }
      if (data?.status === 'insufficient') {
        toast.warning(
          data?.message ||
            "We couldn't read enough public information from this LinkedIn page.",
        );
      } else if (data?.status === 'url_only') {
        toast.success(data?.message || 'LinkedIn URL saved.');
      } else {
        toast.success('LinkedIn profile saved.');
      }
      setExisting({
        profile_url: normalized,
        scrape_status: data?.status || 'ok',
        scraped_at: new Date().toISOString(),
      });
      setDialogOpen(false);
    } catch (err) {
      console.error('[LinkedInAccountRow] error:', err);
      toast.error('Could not reach the import service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasUrl = !!existing?.profile_url;

  return (
    <div className="flex items-center justify-between py-2 border-b border-border">
      <div className="flex items-center gap-3">
        <Linkedin className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">LinkedIn</span>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/70 hover:text-muted-foreground"
                aria-label="About LinkedIn URL"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs">
              {TOOLTIP_TEXT}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {hasUrl ? (
          <>
            <a
              href={existing!.profile_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm truncate max-w-[180px] sm:max-w-[260px] hover:underline inline-flex items-center gap-1"
              title={existing!.profile_url}
            >
              {displayHandle(existing!.profile_url)}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={openEditor}
              aria-label="Edit LinkedIn URL"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={openEditor}
          >
            Add LinkedIn
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hasUrl ? 'Edit LinkedIn URL' : 'Add LinkedIn URL'}</DialogTitle>
            <DialogDescription>{TOOLTIP_TEXT}</DialogDescription>
          </DialogHeader>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.linkedin.com/in/your-handle"
            inputMode="url"
            autoComplete="url"
            maxLength={500}
            disabled={loading}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || !url.trim()} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}