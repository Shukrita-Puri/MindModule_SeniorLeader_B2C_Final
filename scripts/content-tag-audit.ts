import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This script audits the content tags in sanctuary_content and sanctuary_content_metadata
// to ensure parity and completeness across the 6 axes consumed by the Plan engine.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
  console.log("Starting Content-Tag Parity Audit...");
  
  const { data: content, error: contentError } = await supabase
    .from("sanctuary_content")
    .select(`
      id, 
      title, 
      category, 
      sub_type, 
      protocol_type, 
      is_active,
      sanctuary_content_metadata (
        meta_skill,
        state_signal,
        moment,
        horizon,
        mastery_category
      )
    `)
    .eq("is_active", true);
    
  if (contentError) {
    console.error("Error fetching content:", contentError);
    Deno.exit(1);
  }
  
  if (!content || content.length === 0) {
    console.log("No active content found.");
    return;
  }
  
  console.log(`Auditing ${content.length} active practices...`);
  
  let missingCategory = 0;
  let missingSubType = 0;
  let missingProtocolType = 0;
  let missingMetadata = 0;
  let missingMetaSkill = 0;
  let missingStateSignal = 0;
  let missingMoment = 0;
  let missingHorizon = 0;
  let missingMasteryCategory = 0;
  
  for (const item of content) {
    if (!item.category) missingCategory++;
    if (!item.sub_type) missingSubType++;
    if (!item.protocol_type) missingProtocolType++;
    
    const meta = Array.isArray(item.sanctuary_content_metadata) 
      ? item.sanctuary_content_metadata[0] 
      : item.sanctuary_content_metadata;
      
    if (!meta) {
      missingMetadata++;
      continue;
    }
    
    if (!meta.meta_skill || meta.meta_skill.length === 0) missingMetaSkill++;
    if (!meta.state_signal || meta.state_signal.length === 0) missingStateSignal++;
    if (!meta.moment || meta.moment.length === 0) missingMoment++;
    if (!meta.horizon) missingHorizon++;
    if (!meta.mastery_category) missingMasteryCategory++;
  }
  
  console.log("\n--- Audit Results ---");
  console.log(`Total Active Practices: ${content.length}`);
  console.log(`Missing Category (Shelf): ${missingCategory}`);
  console.log(`Missing Sub-Type (Form): ${missingSubType}`);
  console.log(`Missing Protocol Type: ${missingProtocolType}`);
  console.log(`Missing Metadata Row: ${missingMetadata}`);
  console.log(`Missing Meta-Skill: ${missingMetaSkill}`);
  console.log(`Missing State Signal: ${missingStateSignal}`);
  console.log(`Missing Moment: ${missingMoment}`);
  console.log(`Missing Horizon: ${missingHorizon}`);
  console.log(`Missing Mastery Category: ${missingMasteryCategory}`);
  
  const totalGaps = missingCategory + missingSubType + missingProtocolType + 
                    missingMetadata + missingMetaSkill + missingStateSignal + 
                    missingMoment + missingHorizon + missingMasteryCategory;
                    
  if (totalGaps === 0) {
    console.log("\n✅ 100% Parity Achieved. All active practices are fully tagged.");
  } else {
    console.log(`\n⚠️ Found ${totalGaps} tagging gaps that need to be backfilled.`);
  }
}

runAudit();
