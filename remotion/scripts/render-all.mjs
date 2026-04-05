/**
 * Batch render script for all 21 hero videos.
 * Usage: node scripts/render-all.mjs [compositionId]
 * If compositionId is provided, only renders that one.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../public/all-visuals/videos");

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ALL_IDS = [
  'depleted-morning', 'depleted-afternoon', 'depleted-evening',
  'managing-morning', 'managing-afternoon', 'managing-evening',
  'strong-morning', 'strong-afternoon', 'strong-evening',
  'peak-morning', 'peak-afternoon', 'peak-evening',
  'veryhigh-morning', 'veryhigh-afternoon', 'veryhigh-evening',
  'recovery-morning', 'recovery-afternoon', 'recovery-evening',
  'masked-morning', 'masked-afternoon', 'masked-evening',
];

// Allow filtering via CLI arg
const filterArg = process.argv[2];
const idsToRender = filterArg ? ALL_IDS.filter(id => id.includes(filterArg)) : ALL_IDS;

console.log(`Bundling Remotion project...`);
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (config) => config,
  publicDir: path.resolve(__dirname, "../public"),
});

const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: {
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
  chromeMode: "chrome-for-testing",
});

for (const id of idsToRender) {
  const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);

  // Skip if already exists (unless FORCE=1)
  if (!process.env.FORCE && fs.existsSync(outputPath)) {
    console.log(`⏭ Skipping ${id} (already exists)`);
    continue;
  }

  console.log(`🎬 Rendering ${id}...`);
  try {
    const composition = await selectComposition({
      serveUrl: bundled,
      id,
      puppeteerInstance: browser,
    });

    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      puppeteerInstance: browser,
      muted: true,
      concurrency: 1,
    });

    console.log(`✅ ${id} → ${outputPath}`);
  } catch (err) {
    console.error(`❌ Failed to render ${id}:`, err.message);
  }
}

await browser.close({ silent: false });
console.log("All renders complete!");
