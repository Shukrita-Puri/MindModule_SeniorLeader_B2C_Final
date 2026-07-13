// Shared loader for the onboarding CoS (Chief of Staff) Leader Profile.
// Reads onboarding_v8_responses.cos_profile + row-level goals/preferences.
// Returns a normalized `LeaderProfileContext` shape so Brief/Plan/Nudges/Insights
// consume ONE shape. Missing/failed/in_progress profiles resolve to a shell
// with nulls; the downstream surfaces must treat null values as "use dynamic
// behaviour" and never fail when the profile is absent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface LeaderProfileContext {
  voice: {
    cos_brief_rules: string | null;
    brief_voice_note: string | null;
    communication_how_they_think: string | null;
    communication_what_lands: string[] | null;
    communication_what_wont_land: string[] | null;
  };
  goals: {
    declared: string[];
    cos_accountability_note: string | null;
  };
  priors: {
    high_stakes_map: {
      declared_events: string[];
      inferred_events: string[];
      event_frequency_estimate: string | null;
    } | null;
    cognitive_load_map: {
      declared_loads: string[];
      inferred_loads: string[];
      operating_burdens: string[];
      primary_depletion_pattern: string | null;
    } | null;
    cognitive_risk_profile: {
      primary_risk: string;
      risk_flags: Array<{
        flag: string;
        severity: string;
        description: string;
        trigger_conditions: string;
      }>;
      regulation_strengths: string[];
    } | null;
  };
  preferences: {
    brief_timing: string | null;
    reset_modality: string | null;
    weekend_signals: string | null;
  };
  analysis: {
    archetype: string | null;
    leadership_style: { primary_style: string; style_tags: string[] } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    communication_profile: any | null;
  };
  meta: {
    status: 'ready' | 'failed' | 'in_progress' | 'missing';
    confidence: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    what_is_missing: any[] | null;
  };
}

export async function loadLeaderProfile(
  db: ReturnType<typeof createClient>,
  userId: string,
): Promise<LeaderProfileContext> {
  let row:
    | {
        cos_profile: any | null;
        cos_profile_status: string | null;
        brief_timing: string | null;
        reset_modality: string | null;
        weekend_signals: string | null;
        goals: string[] | null;
      }
    | null = null;

  try {
    const { data, error } = await db
      .from('onboarding_v8_responses')
      .select('cos_profile, cos_profile_status, brief_timing, reset_modality, weekend_signals, goals')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[leader-profile-loader] query error:', error.message);
    }
    row = (data as any) ?? null;
  } catch (e) {
    console.warn('[leader-profile-loader] unexpected error:', e instanceof Error ? e.message : String(e));
  }

  if (!row || row.cos_profile_status !== 'ready' || !row.cos_profile) {
    return {
      voice: {
        cos_brief_rules: null,
        brief_voice_note: null,
        communication_how_they_think: null,
        communication_what_lands: null,
        communication_what_wont_land: null,
      },
      goals: {
        declared: Array.isArray(row?.goals) ? (row!.goals as string[]) : [],
        cos_accountability_note: null,
      },
      priors: {
        high_stakes_map: null,
        cognitive_load_map: null,
        cognitive_risk_profile: null,
      },
      preferences: {
        brief_timing: row?.brief_timing ?? null,
        reset_modality: row?.reset_modality ?? null,
        weekend_signals: row?.weekend_signals ?? null,
      },
      analysis: {
        archetype: null,
        leadership_style: null,
        communication_profile: null,
      },
      meta: {
        status: (row?.cos_profile_status as any) ?? 'missing',
        confidence: null,
        what_is_missing: null,
      },
    };
  }

  const p = row.cos_profile as any;
  return {
    voice: {
      cos_brief_rules: p.communication_profile?.cos_brief_rules ?? null,
      brief_voice_note: p.brief_personalisation?.brief_voice_note ?? null,
      communication_how_they_think: p.communication_profile?.how_they_think ?? null,
      communication_what_lands: Array.isArray(p.communication_profile?.what_lands)
        ? p.communication_profile.what_lands
        : null,
      communication_what_wont_land: Array.isArray(p.communication_profile?.what_wont_land)
        ? p.communication_profile.what_wont_land
        : null,
    },
    goals: {
      declared: Array.isArray(p.goals?.declared)
        ? p.goals.declared
        : Array.isArray(row.goals)
          ? (row.goals as string[])
          : [],
      cos_accountability_note: p.goals?.cos_accountability_note ?? null,
    },
    priors: {
      high_stakes_map: p.high_stakes_map ?? null,
      cognitive_load_map: p.cognitive_load_map ?? null,
      cognitive_risk_profile: p.cognitive_risk_profile ?? null,
    },
    preferences: {
      brief_timing: row.brief_timing ?? null,
      reset_modality: row.reset_modality ?? null,
      weekend_signals: row.weekend_signals ?? null,
    },
    analysis: {
      archetype: p.provisional_archetype?.name ?? null,
      leadership_style: p.leadership_style
        ? {
            primary_style: p.leadership_style.primary_style,
            style_tags: Array.isArray(p.leadership_style.style_tags) ? p.leadership_style.style_tags : [],
          }
        : null,
      communication_profile: p.communication_profile ?? null,
    },
    meta: {
      status: 'ready',
      confidence: p.confidence_overall ?? null,
      what_is_missing: Array.isArray(p.what_is_missing) ? p.what_is_missing : null,
    },
  };
}