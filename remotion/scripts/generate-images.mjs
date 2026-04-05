/**
 * Generate all 15 base woodcut illustrations for hero videos.
 * Each state gets a UNIQUE nature scene — diverse, lighter, empowering.
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

const BASE_STYLE = `Style: engraved illustration, fine line etching, stippling and cross-hatching technique, reminiscent of 19th century scientific illustration and wood engraving. Detailed but not busy. Vertical composition (portrait 9:16 aspect ratio). No figures, no people. The viewer IS the figure — elevated perspective looking outward. IMPORTANT: Horizon line in upper third of frame — landscape and terrain fill 50-60% of the image. Use warm, visible tones — NOT dark or murky. The image should feel light, open, and empowering. Subtle color tinting applied over the engraving — like a hand-tinted vintage print.`;

const PROMPTS = {
  // ── MORNING ──
  "depleted-morning": `${BASE_STYLE}
Misty coastal cliffs at dawn. Fog rolling gently over dark water far below. Rocky cliff edge in foreground with wild grasses. The ocean stretches to a hazy horizon. Heavy morning mist hangs in layers. Colour palette: soft slate blue-grey, subtle silver, hint of pale rose at the horizon where dawn begins. Mood: the challenge is ahead, but the ground beneath is solid. Not defeated — preparing.`,

  "managing-morning": `${BASE_STYLE}
A wide river valley at dawn. The river winds through the centre of the composition, reflecting pale morning light. Gentle rolling banks with scattered trees. Light just touching the water's surface, creating soft silver reflections. Colour palette: cool blue-green water, soft warm gold at the horizon, sage green riverbanks. Mood: steady flow. The day is beginning. Not rushing — present.`,

  "strong-morning": `${BASE_STYLE}
Mountain ridge with alpine wildflowers in the foreground. Sun breaking through clouds, casting shafts of golden light across the mountainside. Snow-capped peaks visible in the distance. Wildflowers rendered in fine detail — small dots of colour amid the engraved linework. Colour palette: deep sky blue, warm gold sunlight, green and purple wildflower accents. Mood: elevated, ready, looking forward with energy.`,

  "peak-morning": `${BASE_STYLE}
Vast alpine panorama viewed from a high summit. Eagles or large birds in flight across the middle distance. Golden morning light floods the entire scene. Multiple mountain ranges receding into bright distance. Crisp, clear atmosphere. Colour palette: rich cerulean blue sky, bright warm gold, white snow on distant peaks. Mood: everything is visible. Commanding view. This is the day.`,

  "veryhigh-morning": `${BASE_STYLE}
Open ocean horizon viewed from a high rocky headland covered in windswept grass. Infinite sky stretches above. The ocean is vast and calm, stretching endlessly. A few seabirds soar on thermal currents. Colour palette: the most vivid — deep azure blue sky, bright turquoise water, warm golden morning light on the grass. Mood: no resistance. Pure forward energy. Limitless.`,

  // ── AFTERNOON ──
  "depleted-afternoon": `${BASE_STYLE}
Dense ancient forest. Massive tree trunks rise like columns. A single clearing in the canopy lets a column of warm light fall through to the forest floor. Ferns and moss cover the ground in fine cross-hatched detail. Colour palette: deep forest green, rich earth browns, one shaft of warm golden light cutting through. Mood: heavy canopy overhead, but light exists. Still standing.`,

  "managing-afternoon": `${BASE_STYLE}
Rolling wheat fields stretching to the horizon under a partly cloudy sky. The wheat is rendered in fine parallel lines, swaying gently. Mixed sky — cumulus clouds and patches of blue. A lone track or path cuts through the field. Colour palette: warm golden wheat, soft blue sky, white-grey clouds, dusty path brown. Mood: getting through. Steady progress. Grounded.`,

  "strong-afternoon": `${BASE_STYLE}
A crystal-clear mountain lake reflecting surrounding peaks perfectly. Pine trees line the shore. The water is still and mirror-like, rendered with delicate horizontal etching lines. Mountains reflected in perfect symmetry. Colour palette: deep teal lake water, forest green pines, blue-grey mountains, bright blue sky. Mood: clarity. Command. Everything in sharp focus.`,

  "peak-afternoon": `${BASE_STYLE}
Desert mesa viewed from a canyon summit. Vast red-gold sandstone formations stretch in all directions. Deep canyon dropping away in foreground. Enormous sky. The landscape has a geological grandeur — layered rock strata visible in fine cross-hatching. Colour palette: warm terracotta and amber sandstone, deep cerulean sky, long purple shadows. Mood: full capacity. Full view. Expansive.`,

  "veryhigh-afternoon": `${BASE_STYLE}
Volcanic island coastline viewed from high ground. Lush tropical vegetation in foreground — palms and broad-leaved plants in fine detail. Turquoise Pacific ocean stretching to the horizon. White surf on distant reef. Colour palette: vivid emerald green, brilliant turquoise water, warm coral and amber volcanic rock, clear blue sky. Mood: nothing can obscure this. Complete openness.`,

  // ── EVENING ──
  "depleted-evening": `${BASE_STYLE}
Rain falling gently on a stone terrace or balcony. Distant city lights twinkling far below in a valley. The terrace has an iron railing and perhaps a lantern. Rain rendered as fine diagonal lines. NO SUN — this is night. Colour palette: deep indigo sky, warm amber city lights in distance, cool grey stone, silver rain streaks. Mood: the day cost something. Rest is earned. Quiet dignity.`,

  "managing-evening": `${BASE_STYLE}
An autumn forest path winding through tall trees. Last amber light filtering horizontally through the trunks. Fallen leaves on the path rendered in fine detail. The trees create a natural archway. NO SUN — just warm ambient twilight glow through the trees. Colour palette: warm amber and burnt orange leaves, deep brown trunks, muted purple twilight sky glimpsed through canopy. Mood: the day was handled. Winding down with grace.`,

  "strong-evening": `${BASE_STYLE}
A harbour with several moored sailing boats at twilight. Calm water reflecting mast lights and the fading sky. Stone harbour wall in foreground. Buildings with warm lit windows beyond. NO SUN — soft twilight. Colour palette: deep blue-grey water, warm amber window lights, navy twilight sky, warm stone tones. Mood: the day was delivered. Quiet satisfaction. Safe harbour.`,

  "peak-evening": `${BASE_STYLE}
A mountain lake under early starlight. Perfect still water reflecting the first stars and deep indigo sky. Mountain silhouettes frame the scene. A thin warm glow remains at the western horizon. NO SUN — stars and last light only. Colour palette: deep indigo sky, silver-white stars, warm gold at horizon, dark mountain silhouettes, cool blue-black water. Mood: an exceptional day closes. Dignity. Completeness.`,

  "veryhigh-evening": `${BASE_STYLE}
Open starfield viewed from a high plateau or mesa. The Milky Way is faintly visible arcing across the sky, rendered in fine stippling. Warm amber glow persists at the horizon edge. Desert scrub and rock in foreground. NO SUN — deep night sky full of stars. Colour palette: deep midnight blue-purple sky, thousands of fine white star points, warm amber horizon glow, dark ochre terrain. Mood: done. Well done. Cosmic calm. Everything accomplished.`,
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
