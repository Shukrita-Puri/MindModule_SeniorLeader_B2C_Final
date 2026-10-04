import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyEventV3 } from "../supabase/functions/_shared/events/event-classifier-v3.ts";
import { resolveEventCategory } from "../supabase/functions/_shared/events/resolve-event-category.ts";
import { DEFAULT_MIND_MODULE_CONTEXT } from "../supabase/functions/_shared/events/relationship-context.ts";

// Export script: extracts calendar events for shukrita@mindmodule.me to build
// the genuine Golden Set (N=200+) and Holdout Set (N=50).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run --allow-net --allow-env --allow-write scripts/export-calendar-events-for-labeling.ts

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TARGET_EMAIL = "shukrita@mindmodule.me";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function exportEvents() {
  console.log(`Searching for profile with email: ${TARGET_EMAIL}...`);

  // 1. Resolve User ID from profile
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", TARGET_EMAIL)
    .maybeSingle();

  if (profileErr || !profile) {
    console.error("Could not find user profile:", profileErr?.message || "User not found");
    Deno.exit(1);
  }

  const userId = profile.id;
  console.log(`Found user ID: ${userId} (${profile.full_name || profile.email})`);

  // 2. Fetch up to 350 real calendar events
  const { data: events, error: eventsErr } = await supabase
    .from("calendar_events")
    .select("id, title, description, location, start_time, end_time, attendees, is_recurring, recurring_event_id, event_category, event_subcategory")
    .eq("user_id", userId)
    .order("start_time", { ascending: false })
    .limit(350);

  if (eventsErr) {
    console.error("Error querying calendar_events:", eventsErr.message);
    Deno.exit(1);
  }

  if (!events || events.length === 0) {
    console.warn("No calendar events found for user.");
    Deno.exit(0);
  }

  console.log(`Extracted ${events.length} real events. Processing classifications...`);

  const rows = events.map((evt, idx) => {
    const rawAttendees = Array.isArray(evt.attendees) ? evt.attendees : [];
    const attendeesList = rawAttendees.map((a: any) => ({
      name: a?.name || a?.displayName || null,
      email: a?.email || null,
      domain: a?.email ? a.email.split("@")[1]?.toLowerCase() : null,
      isSelf: a?.isSelf || false,
      isOrganizer: a?.isOrganizer || false,
    }));

    const durationMinutes = (evt.start_time && evt.end_time)
      ? Math.round((new Date(evt.end_time).getTime() - new Date(evt.start_time).getTime()) / 60000)
      : 30;

    // Run legacy resolve
    const legacy = resolveEventCategory(evt.title, evt, { companyContext: DEFAULT_MIND_MODULE_CONTEXT });

    // Run v3
    const v3 = classifyEventV3({
      item: {
        id: evt.id,
        sourceType: "calendar",
        title: evt.title || "",
        description: evt.description || "",
        location: evt.location || null,
        durationMinutes,
        isRecurring: !!(evt.is_recurring || evt.recurring_event_id),
        attendees: attendeesList,
      },
      companyContext: DEFAULT_MIND_MODULE_CONTEXT,
    });

    return {
      index: idx + 1,
      id: evt.id,
      title: evt.title || "(No Title)",
      start_time: evt.start_time,
      durationMinutes,
      is_recurring: !!(evt.is_recurring || evt.recurring_event_id),
      attendees_count: attendeesList.length,
      attendee_domains: Array.from(new Set(attendeesList.map((a) => a.domain).filter(Boolean))),
      location: evt.location || null,
      description_preview: (evt.description || "").slice(0, 100),
      legacy_category: legacy.categoryId,
      legacy_subtype: legacy.subtypeId,
      v3_category: v3.category,
      v3_subtype: v3.subtype,
      v3_confidence: v3.categoryConfidence,
      // Blank columns for Shukrita to label:
      shukrita_correct_category: "",
      shukrita_correct_subtype: "",
      shukrita_difficulty: "", // obvious | ambiguous | misleading_title | edge_case
      shukrita_notes: "",
    };
  });

  const outputPath = "exported_shukrita_events_for_labeling.json";
  await Deno.writeTextFile(outputPath, JSON.stringify(rows, null, 2));
  console.log(`Successfully exported ${rows.length} events to ${outputPath}`);
}

exportEvents().catch(console.error);
