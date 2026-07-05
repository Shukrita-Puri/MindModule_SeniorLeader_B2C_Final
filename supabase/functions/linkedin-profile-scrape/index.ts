import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOURCE = "linkedin_public_profile";
const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

// Accept linkedin.com/in/<slug> (with optional country subdomain like uk., www., etc.)
const LINKEDIN_PUBLIC_RX =
  /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?(\?.*)?$/i;

function normalizeLinkedinUrl(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  let withScheme = trimmed;
  if (!/^https?:\/\//i.test(withScheme)) {
    withScheme = "https://" + withScheme;
  }
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  // Strip query/hash to canonicalize
  const canonical = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  if (!LINKEDIN_PUBLIC_RX.test(canonical)) return null;
  return canonical;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function extractFromScrape(payload: any, profileUrl: string) {
  // Firecrawl v2 returns { success, data: { markdown, metadata, json?, summary?, ... } }
  // (in some shapes fields live at root). Normalize.
  const root = payload?.data ?? payload ?? {};
  const metadata = root.metadata ?? {};
  const llmJson = root.json ?? root.extract ?? null;
  const markdown: string = typeof root.markdown === "string" ? root.markdown : "";
  const summary: string | null = typeof root.summary === "string" ? root.summary : null;

  const ogTitle = pickString(metadata.ogTitle, metadata["og:title"], metadata.title);
  const ogDescription = pickString(
    metadata.ogDescription,
    metadata["og:description"],
    metadata.description,
  );
  const ogImage = pickString(metadata.ogImage, metadata["og:image"]);

  // Title often looks like: "Jane Doe - Chief Product Officer at Acme | LinkedIn"
  let nameFromTitle: string | null = null;
  let headlineFromTitle: string | null = null;
  if (ogTitle) {
    const cleaned = ogTitle.replace(/\s*\|\s*LinkedIn.*$/i, "").trim();
    const m = cleaned.match(/^(.*?)\s+[-–|]\s+(.+)$/);
    if (m) {
      nameFromTitle = m[1].trim();
      headlineFromTitle = m[2].trim();
    } else {
      nameFromTitle = cleaned;
    }
  }

  const j = (llmJson && typeof llmJson === "object") ? llmJson : {};

  const extracted = {
    full_name: pickString(j.full_name, j.name, nameFromTitle),
    headline: pickString(j.headline, j.title, headlineFromTitle, ogDescription),
    current_company: pickString(j.current_company, j.company),
    current_role: pickString(j.current_role, j.role, j.position),
    location: pickString(j.location),
    about: pickString(j.about, j.summary, summary, ogDescription),
    experience: Array.isArray(j.experience) ? j.experience.slice(0, 20) : null,
    education: Array.isArray(j.education) ? j.education.slice(0, 10) : null,
    skills: Array.isArray(j.skills) ? j.skills.slice(0, 50) : null,
    profile_image_url: pickString(j.profile_image_url, ogImage),
    profile_url: profileUrl,
    source: SOURCE,
    scraped_at: new Date().toISOString(),
  };

  // Confidence heuristic: how many top-level fields we resolved
  const fields = [
    extracted.full_name,
    extracted.headline,
    extracted.current_company,
    extracted.current_role,
    extracted.about,
    extracted.location,
  ];
  const filled = fields.filter((v) => v && String(v).length > 0).length;
  const confidence = filled / fields.length;
  const hasMinimum = !!(extracted.full_name || extracted.headline);
  const parse_status = hasMinimum
    ? (confidence >= 0.5 ? "ok" : "partial")
    : "insufficient";

  return {
    extracted,
    confidence,
    parse_status,
    raw_markdown_length: markdown.length,
  };
}

async function callFirecrawlScrape(apiKey: string, url: string) {
  const body = {
    url,
    onlyMainContent: true,
    formats: [
      "markdown",
      "summary",
      {
        type: "json",
        prompt:
          "Extract the public LinkedIn profile fields. Return ONLY these keys when visible: full_name, headline, current_company, current_role, location, about, experience (array of {title, company, dates}), education (array of {school, degree, dates}), skills (array of strings), profile_image_url. Omit anything that is not publicly visible on the page.",
      },
    ],
  };
  const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, body: parsed, raw: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.errorResponse) {
      console.warn("[linkedin-profile-scrape] auth_missing — returning 401");
      return authResult.errorResponse;
    }
    const userId = authResult.userId;
    console.info(`[linkedin-profile-scrape] start user_id=${redactUserId(userId)}`);

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error("[linkedin-profile-scrape] FIRECRAWL_API_KEY missing");
      return json(503, {
        error: "linkedin_scrape_unavailable",
        message:
          "LinkedIn import is temporarily unavailable. Please try again later or continue manually.",
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = (body as any)?.linkedinUrl;
    if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
      return json(400, { error: "invalid_url", message: "linkedinUrl is required" });
    }
    const profileUrl = normalizeLinkedinUrl(rawUrl);
    if (!profileUrl) {
      return json(400, {
        error: "invalid_linkedin_url",
        message:
          "Please paste a valid public LinkedIn profile URL (e.g. https://www.linkedin.com/in/your-handle).",
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const fc = await callFirecrawlScrape(apiKey, profileUrl);
    console.info(`[linkedin-profile-scrape] firecrawl status=${fc.status} ok=${fc.ok}`);

    if (!fc.ok || !fc.body) {
      const errMsg =
        (fc.body && (fc.body.error || fc.body.message)) ||
        `Firecrawl request failed (status ${fc.status})`;
      console.error("[linkedin-profile-scrape] Firecrawl error:", fc.status, errMsg);
      // Persist the URL even when scraping fails — the URL itself is valuable
      // leadership-context signal and the user explicitly chose to save it.
      const { error: dbErr } = await db.from("user_external_profiles").upsert(
        {
          user_id: userId,
          source: SOURCE,
          profile_url: profileUrl,
          extracted_data: { profile_url: profileUrl, source: SOURCE },
          scrape_status: "url_only",
          scrape_error: String(errMsg).slice(0, 1000),
          scraped_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source,profile_url" },
      );
      if (dbErr) {
        console.error("[linkedin-profile-scrape] DB upsert error (url_only):", dbErr);
        return json(500, { error: "persist_failed", message: "Failed to save profile URL" });
      }
      // Mirror URL into onboarding row so synthesize-cos-profile has the link
      // even if no scrape content is available. Best-effort; ignore errors.
      await db
        .from("onboarding_v8_responses")
        .upsert(
          {
            user_id: userId,
            linkedin_url: profileUrl,
            linkedin_scrape: {
              url: profileUrl,
              ok: false,
              error: String(errMsg).slice(0, 500),
              scraped_at: new Date().toISOString(),
            },
          },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) console.warn("[linkedin-profile-scrape] v8 mirror (url_only) failed:", error.message);
        });
      return json(200, {
        ok: true,
        status: "url_only",
        message:
          "Saved your LinkedIn URL. We couldn't auto-import details from the page, but we'll use the URL for your leadership context.",
      });
    }

    const parsed = extractFromScrape(fc.body, profileUrl);
    const status =
      parsed.parse_status === "insufficient" ? "insufficient" : "ok";

    const extracted_data = {
      ...parsed.extracted,
      _meta: {
        confidence: parsed.confidence,
        parse_status: parsed.parse_status,
        raw_markdown_length: parsed.raw_markdown_length,
      },
    };

    const { error: dbErr } = await db
      .from("user_external_profiles")
      .upsert(
        {
          user_id: userId,
          source: SOURCE,
          profile_url: profileUrl,
          extracted_data,
          scrape_status: status,
          scrape_error: null,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source,profile_url" },
      );

    if (dbErr) {
      console.error("[linkedin-profile-scrape] DB upsert error:", dbErr);
      return json(500, { error: "persist_failed", message: "Failed to save profile" });
    }
    // Mirror raw scrape into onboarding_v8_responses so synthesize-cos-profile
    // can reuse it without re-hitting Firecrawl. Best-effort; non-blocking.
    {
      const root = (fc.body as any)?.data ?? fc.body ?? {};
      const linkedinScrape = {
        url: profileUrl,
        ok: true,
        markdown: typeof root.markdown === "string" ? root.markdown : "",
        summary: typeof root.summary === "string" ? root.summary : null,
        metadata: root.metadata ?? null,
        scraped_at: new Date().toISOString(),
      };
      const { error: mirrorErr } = await db
        .from("onboarding_v8_responses")
        .upsert(
          { user_id: userId, linkedin_url: profileUrl, linkedin_scrape: linkedinScrape },
          { onConflict: "user_id" },
        );
      if (mirrorErr) {
        console.warn("[linkedin-profile-scrape] v8 mirror failed:", mirrorErr.message);
      }
    }
    console.info(`[linkedin-profile-scrape] upsert ok user_id=${redactUserId(userId)} status=${status}`);

    if (status === "insufficient") {
      return json(200, {
        ok: false,
        status: "insufficient",
        message:
          "We couldn't read enough public information from this LinkedIn page. You can try again or continue manually.",
        profile: extracted_data,
      });
    }

    return json(200, {
      ok: true,
      status,
      profile: extracted_data,
    });
  } catch (err) {
    console.error("[linkedin-profile-scrape] Unexpected error:", err);
    return json(500, { error: "internal_error", message: "Internal server error" });
  }
});
