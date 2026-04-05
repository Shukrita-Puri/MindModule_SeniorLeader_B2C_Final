/**
 * Generate all 15 base woodcut illustrations for hero videos.
 * Uses Gemini image model via Lovable AI gateway.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../public/images");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) throw new Error("LOVABLE_API_KEY not set");

const BASE_STYLE = `Style: engraved illustration, fine line etching, stippling and cross-hatching technique, reminiscent of 19th century scientific illustration and wood engraving. Detailed but not busy. Vertical composition (portrait 9:16 aspect ratio). No figures, no people. The viewer IS the figure — elevated perspective looking outward.`;

const PROMPTS = {
  // ── MORNING ──
  "depleted-morning": `${BASE_STYLE}
Rolling landscape viewed from elevated ground. Rocks or high terrain in foreground. Vast open plains receding to horizon. Heavy cloud formation dominates upper frame. Sun barely visible, low on horizon, partially obscured. Landscape in deep shadow — dark stippling, dense cross-hatching on foreground terrain. Colour palette: deep slate blue, almost no warm tones. Mood: before the storm, not after. Still purposeful. The clouds are the challenge.`,

  "managing-morning": `${BASE_STYLE}
Rolling landscape viewed from elevated ground. Rocks in foreground. Vast open plains receding to horizon. Sun at horizon. Partial cloud cover. Sun visible but not dominant — moderate rays. Landscape: mix of shadow and emerging light. Colour palette: cool blue dominant, slight warmth at horizon. Mood: steady. The day is possible. Not peak — but grounded and present.`,

  "strong-morning": `${BASE_STYLE}
Rolling landscape viewed from elevated ground. Rocks in foreground. Hills receding to horizon. Sun clearly visible, strong rays breaking across landscape. Cloud formation present but organised — moving, not threatening. Landscape: light catching the upper hills, shadow in valleys — depth and contrast. Colour palette: blue sky, warm gold at horizon, cool light on terrain. Mood: elevated, ready, looking forward.`,

  "peak-morning": `${BASE_STYLE}
Rolling landscape viewed from elevated ground. Rocks in foreground. Hills receding to horizon. Full clear sky with single dramatic cloud formation to one side. Sun high and radiating with precision — fine engraved rays extending across sky. Landscape fully lit — every hill and rock visible and detailed. Colour palette: rich deep blue sky, bright clear horizon, warm gold where sun meets land. Mood: this is the day. Everything is possible.`,

  "veryhigh-morning": `${BASE_STYLE}
Rolling landscape from elevated ground. Vast and expansive terrain. Completely open sky. Sun dominant and commanding. Landscape vast — rolling hills disappearing into distance. Colour palette: the most vivid — deep cerulean blue, sharp white sun, warm horizon. Mood: complete readiness. No resistance. Pure forward energy. Birds in flight.`,

  // ── AFTERNOON ──
  "depleted-afternoon": `${BASE_STYLE}
Open sky dominant — 70% sky, 30% landscape. Sun higher in frame — midday position. Heavy overcast. Sun completely obscured. Dense cloud bank — layered, pressing down. Landscape dark and textured. Colour palette: grey-blue, almost monochrome. One shaft of light trying to break through — not succeeding, but present. Mood: the afternoon is heavy. But you are still standing.`,

  "managing-afternoon": `${BASE_STYLE}
Open sky dominant — 70% sky, 30% landscape. Sun higher in frame — midday position. Mixed cloud and clear sky. Sun partially visible — diffuse rays. Colour palette: muted steel blue. Landscape: moderate contrast. Mood: getting through. Steady.`,

  "strong-afternoon": `${BASE_STYLE}
Open sky dominant — 70% sky, 30% landscape. Sun higher in frame. Clear blue sky dominant. Single organised cloud formation, right of frame. Sun radiating clean precise lines. Colour palette: deep steel blue, bright white cloud, dark detailed landscape below. Mood: I can see clearly. I am in command.`,

  "peak-afternoon": `${BASE_STYLE}
Open sky dominant — 70% sky, 30% landscape. Maximum sky openness. Sun at full strength — rays extending across entire upper frame. Cloud formation dramatic but controlled. Landscape sharp and detailed below. Colour palette: richest blue of all. Mood: full clarity. Full capacity.`,

  "veryhigh-afternoon": `${BASE_STYLE}
Open sky dominant — 70% sky, 30% landscape. Cloudless sky. Sun dominant and unchallenged. Landscape detailed and expansive. The most open composition of all. Colour palette: pure deep blue, bright horizon. Mood: nothing can obscure this.`,

  // ── EVENING ──
  "depleted-evening": `${BASE_STYLE}
Post-sunset landscape. Dark sky. Sun fully set. Traces of deep amber barely visible at far horizon. Landscape: dense shadow, heavy stippling. Colour palette: near-black sky, thin gold line at horizon. Mood: the day cost something. Rest is earned and necessary.`,

  "managing-evening": `${BASE_STYLE}
Post-sunset landscape. Sky transitioning — sun just below horizon. Moderate amber at horizon, deepening blue above. Landscape: peaceful shadow. Mood: the day was handled. Not remarkable. Sufficient.`,

  "strong-evening": `${BASE_STYLE}
Post-sunset landscape. Rich post-sunset sky. Warm amber and gold at horizon meeting deep blue above. Cloud formations softly lit from below. Landscape: settled and detailed. Mood: the day was met and delivered. Closing with quiet satisfaction.`,

  "peak-evening": `${BASE_STYLE}
Post-sunset landscape. Full post-sunset drama. Sky: deep indigo above, gold and amber at horizon, first stars appearing. Cloud formations glowing softly from the last light. Landscape: solid ground, looking back over distance covered. Mood: complete. The day was exceptional. Closing it with dignity.`,

  "veryhigh-evening": `${BASE_STYLE}
Post-sunset landscape. Stars visible. The most open evening composition. Horizon still holds warmth — deep gold fading to indigo. Landscape quietly detailed below. The viewer has crossed something significant and knows it. Mood: done. Well done.`,
};

async function generateImage(name, prompt) {
  const outputPath = path.join(OUTPUT_DIR, `${name}.png`);
  
  if (fs.existsSync(outputPath) && !process.env.FORCE) {
    console.log(`⏭ ${name} already exists`);
    return;
  }

  console.log(`🎨 Generating ${name}...`);
  
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ ${name}: ${res.status} ${text}`);
    return;
  }

  const data = await res.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!imageUrl) {
    console.error(`❌ ${name}: No image in response`);
    return;
  }

  // Extract base64 and save
  const base64 = imageUrl.replace(/^data:image\/\w+;base64,/, "");
  fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
  console.log(`✅ ${name} saved`);
}

// Process sequentially to avoid rate limits
const entries = Object.entries(PROMPTS);

// Allow filtering: node generate-images.mjs evening
const filter = process.argv[2];
const filtered = filter ? entries.filter(([name]) => name.includes(filter)) : entries;

for (const [name, prompt] of filtered) {
  await generateImage(name, prompt);
  // Small delay between requests
  await new Promise(r => setTimeout(r, 2000));
}

console.log("Image generation complete!");
