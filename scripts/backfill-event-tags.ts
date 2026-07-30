import { createClient } from "@supabase/supabase-js";
import { enrichEvent } from "../supabase/functions/_shared/events/enrich-event.ts";

// This script backfills the new F2 schema columns (event_category, event_subcategory, flight_duration_minutes)
// for the last 30 days of calendar_events.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runBackfill() {
  console.log("Starting 30-day calendar_events backfill...");
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Fetch events from the last 30 days that haven't been tagged yet
  const { data: events, error: fetchError } = await supabase
    .from("calendar_events")
    .select("id, title, start_time, end_time")
    .gte("start_time", thirtyDaysAgo.toISOString())
    .is("event_category", null);
    
  if (fetchError) {
    console.error("Error fetching events:", fetchError);
    process.exit(1);
  }
  
  if (!events || events.length === 0) {
    console.log("No events found to backfill.");
    return;
  }
  
  console.log(`Found ${events.length} events to backfill.`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const event of events) {
    try {
      const enriched = enrichEvent(event);
      
      if (!enriched.categoryId) {
        skipped++;
        continue;
      }
      
      const { error: updateError } = await supabase
        .from("calendar_events")
        .update({
          event_category: enriched.categoryId,
          event_subcategory: enriched.subcategory || null,
          flight_duration_minutes: enriched.durationMinutes || null
        })
        .eq("id", event.id);
        
      if (updateError) {
        console.error(`Error updating event ${event.id}:`, updateError);
        errors++;
      } else {
        updated++;
      }
    } catch (err) {
      console.error(`Exception processing event ${event.id}:`, err);
      errors++;
    }
  }
  
  console.log(`Backfill complete. Updated: ${updated}, Skipped (no category): ${skipped}, Errors: ${errors}`);
}

runBackfill();
