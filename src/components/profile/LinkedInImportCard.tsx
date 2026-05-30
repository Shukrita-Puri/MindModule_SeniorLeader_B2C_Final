import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Linkedin, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { useAuth } from '@/hooks/useAuth';

type ExternalProfileRow = {
  profile_url: string;
  scrape_status: string;
  scraped_at: string | null;
  extracted_data: Record<string, any> | null;
};

const LINKEDIN_RX = /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?(\?.*)?$/i;

function normalizeForValidation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function LinkedInImportCard() {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState<ExternalProfileRow | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setLoadingExisting(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_external_profiles')
          .select('profile_url, scrape_status, scraped_at, extracted_data')
          .eq('user_id', user.id)
          .eq('source', 'linkedin_public_profile')
          .order('scraped_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (!error && data) {
          setExisting(data as ExternalProfileRow);
          setUrl(data.profile_url || '');
        }
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleImport = async () => {
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
      } else {
        toast.success('LinkedIn profile imported.');
      }
      setExisting({
        profile_url: normalized,
        scrape_status: data?.status || 'ok',
        scraped_at: new Date().toISOString(),
        extracted_data: data?.profile || null,
      });
    } catch (err) {
      console.error('[LinkedInImportCard] error:', err);
      toast.error('Could not reach the import service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const status = existing?.scrape_status;
  const lastName = existing?.extracted_data?.full_name as string | undefined;
  const lastHeadline = existing?.extracted_data?.headline as string | undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px] font-medium flex items-center gap-2">
          <Linkedin className="h-5 w-5 text-muted-foreground" />
          LinkedIn Profile
        </CardTitle>
        <CardDescription>
          Paste your public LinkedIn profile URL. We'll use it to understand your professional context.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.linkedin.com/in/your-handle"
          inputMode="url"
          autoComplete="url"
          maxLength={500}
          disabled={loading || loadingExisting}
        />
        <div className="flex items-center gap-2">
          <Button
            onClick={handleImport}
            disabled={loading || loadingExisting || !url.trim()}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : existing ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Re-import
              </>
            ) : (
              <>
                <Linkedin className="h-4 w-4" />
                Import from LinkedIn
              </>
            )}
          </Button>
        </div>

        {existing && status === 'ok' && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground pt-1">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
            <div>
              <div className="text-foreground">
                {lastName || 'Profile imported'}
                {lastHeadline ? ` — ${lastHeadline}` : ''}
              </div>
              {existing.scraped_at && (
                <div className="text-xs">
                  Last imported {new Date(existing.scraped_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        )}

        {existing && status && status !== 'ok' && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground pt-1">
            <AlertCircle className="h-4 w-4 mt-0.5 text-saffron" />
            <div>
              We couldn't read enough public information from this LinkedIn page. You can try again or continue manually.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
