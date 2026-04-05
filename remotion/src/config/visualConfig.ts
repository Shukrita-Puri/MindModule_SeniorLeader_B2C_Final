/**
 * Visual configuration for all 21 hero videos.
 * Defines palette, motion params, and layer visibility per tier × timeOfDay.
 * V2: Lighter palette, reduced vignettes, diverse nature scenes.
 */

export type Tier = 'depleted' | 'managing' | 'strong' | 'peak' | 'veryhigh';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type Variant = 'recovery' | 'masked' | null;

export interface VisualConfig {
  // Sky gradient (top to bottom)
  skyGradient: string;
  // Overlay vignette color
  vignetteColor: string;
  // Bottom fade color
  bottomFadeColor: string;

  // Layer visibility
  showStars: boolean;
  showClouds: boolean;
  showSunRays: boolean;
  showBirds: boolean;
  showMist: boolean;
  showHorizonGlow: boolean;

  // Layer intensity (0-1 scale multipliers)
  cloudDensity: number;
  cloudSpeed: number;
  cloudOpacity: number;
  sunIntensity: number;
  sunRayCount: number;
  starCount: number;
  mistIntensity: number;
  horizonWarmth: number;
  birdCount: number;

  // Horizon glow color
  horizonColor: string;
  horizonGlowColor: string;

  // Cloud color
  cloudColor: string;

  // Camera motion
  cameraDrift: 'forward' | 'none' | 'settle';
  cameraDriftAmount: number;

  // Sun position (% from left, % from top)
  sunPosition: [number, number];
}

// ─── MORNING CONFIGS ──────────────────────────────────
const morningBase: Partial<VisualConfig> = {
  showStars: false,
  showClouds: true,
  showSunRays: true,
  showBirds: false,
  showMist: false,
  showHorizonGlow: true,
  cameraDrift: 'forward',
  cameraDriftAmount: 2.5,
  horizonColor: 'hsl(40 80% 60%)',
  horizonGlowColor: 'hsl(36 70% 65%)',
  cloudColor: 'hsl(216 28% 90%)',
  sunPosition: [50, 48],
};

// ─── AFTERNOON CONFIGS ────────────────────────────────
const afternoonBase: Partial<VisualConfig> = {
  showStars: false,
  showClouds: true,
  showSunRays: true,
  showBirds: false,
  showMist: false,
  showHorizonGlow: false,
  cameraDrift: 'none',
  cameraDriftAmount: 0,
  horizonColor: 'hsl(210 20% 75%)',
  horizonGlowColor: 'hsl(210 25% 80%)',
  cloudColor: 'hsl(210 30% 94%)',
  sunPosition: [50, 30],
};

// ─── EVENING CONFIGS ──────────────────────────────────
const eveningBase: Partial<VisualConfig> = {
  showStars: true,
  showClouds: false,
  showSunRays: false,
  showBirds: false,
  showMist: true,
  showHorizonGlow: true,
  cameraDrift: 'settle',
  cameraDriftAmount: 1.5,
  horizonColor: 'hsl(33 60% 55%)',
  horizonGlowColor: 'hsl(35 55% 60%)',
  cloudColor: 'hsl(220 22% 82%)',
  sunPosition: [50, 52],
};

export const VISUAL_CONFIGS: Record<Tier, Record<TimeOfDay, VisualConfig>> = {
  // ══════════════════════════════════════════════════════
  // DEPLETED — challenging but grounded
  // ══════════════════════════════════════════════════════
  depleted: {
    morning: {
      ...morningBase,
      // Misty coastal cliffs — slate blue, silver, pale rose
      skyGradient: 'linear-gradient(180deg, hsl(215 30% 38%) 0%, hsl(218 28% 48%) 35%, hsl(220 25% 55%) 55%, hsl(216 28% 45%) 75%, hsl(215 30% 35%) 100%)',
      vignetteColor: 'hsl(215 30% 35%)',
      bottomFadeColor: 'hsl(215 25% 30%)',
      cloudDensity: 1.4,
      cloudSpeed: 0.6,
      cloudOpacity: 0.8,
      sunIntensity: 0.3,
      sunRayCount: 3,
      starCount: 0,
      mistIntensity: 0.6,
      showMist: true,
      horizonWarmth: 0.25,
      birdCount: 0,
      sunPosition: [50, 52],
    } as VisualConfig,
    afternoon: {
      ...afternoonBase,
      // Dense forest — deep green, earth brown, golden light shaft
      skyGradient: 'linear-gradient(180deg, hsl(140 20% 35%) 0%, hsl(145 22% 42%) 35%, hsl(150 18% 48%) 55%, hsl(145 22% 40%) 75%, hsl(140 20% 32%) 100%)',
      vignetteColor: 'hsl(140 20% 30%)',
      bottomFadeColor: 'hsl(140 18% 25%)',
      cloudDensity: 0.3,
      cloudSpeed: 0.3,
      cloudOpacity: 0.5,
      sunIntensity: 0.4,
      sunRayCount: 1,
      starCount: 0,
      mistIntensity: 0.5,
      showMist: true,
      horizonWarmth: 0.3,
      birdCount: 0,
      sunPosition: [55, 25],
    } as VisualConfig,
    evening: {
      ...eveningBase,
      // Rain on stone terrace — indigo, amber city lights
      skyGradient: 'linear-gradient(180deg, hsl(230 35% 22%) 0%, hsl(232 32% 28%) 35%, hsl(228 28% 34%) 55%, hsl(230 32% 26%) 75%, hsl(230 35% 20%) 100%)',
      vignetteColor: 'hsl(230 35% 20%)',
      bottomFadeColor: 'hsl(230 30% 18%)',
      cloudDensity: 0.0,
      cloudSpeed: 0.0,
      cloudOpacity: 0.0,
      sunIntensity: 0,
      sunRayCount: 0,
      starCount: 5,
      mistIntensity: 0.9,
      horizonWarmth: 0.3,
      birdCount: 0,
      sunPosition: [50, 55],
    } as VisualConfig,
  },

  // ══════════════════════════════════════════════════════
  // MANAGING — steady, present
  // ══════════════════════════════════════════════════════
  managing: {
    morning: {
      ...morningBase,
      // River valley at dawn — blue-green, soft gold
      skyGradient: 'linear-gradient(180deg, hsl(200 35% 42%) 0%, hsl(198 32% 50%) 35%, hsl(195 28% 58%) 55%, hsl(198 32% 48%) 75%, hsl(200 35% 38%) 100%)',
      vignetteColor: 'hsl(200 35% 38%)',
      bottomFadeColor: 'hsl(200 30% 32%)',
      cloudDensity: 1.0,
      cloudSpeed: 0.7,
      cloudOpacity: 0.7,
      sunIntensity: 0.5,
      sunRayCount: 4,
      starCount: 0,
      mistIntensity: 0.3,
      showMist: true,
      horizonWarmth: 0.4,
      birdCount: 0,
      sunPosition: [50, 48],
    } as VisualConfig,
    afternoon: {
      ...afternoonBase,
      // Rolling wheat fields — warm gold, soft blue
      skyGradient: 'linear-gradient(180deg, hsl(215 35% 48%) 0%, hsl(212 32% 56%) 35%, hsl(210 28% 62%) 55%, hsl(212 32% 52%) 75%, hsl(215 35% 44%) 100%)',
      vignetteColor: 'hsl(215 35% 44%)',
      bottomFadeColor: 'hsl(42 40% 35%)',
      cloudDensity: 0.9,
      cloudSpeed: 0.6,
      cloudOpacity: 0.7,
      sunIntensity: 0.45,
      sunRayCount: 3,
      starCount: 0,
      mistIntensity: 0,
      horizonWarmth: 0.35,
      birdCount: 0,
      sunPosition: [50, 32],
    } as VisualConfig,
    evening: {
      ...eveningBase,
      // Autumn forest path — amber, burnt orange, twilight
      skyGradient: 'linear-gradient(180deg, hsl(270 20% 24%) 0%, hsl(268 18% 30%) 35%, hsl(265 16% 36%) 55%, hsl(268 18% 28%) 75%, hsl(270 20% 22%) 100%)',
      vignetteColor: 'hsl(270 20% 22%)',
      bottomFadeColor: 'hsl(30 30% 20%)',
      cloudDensity: 0.0,
      cloudSpeed: 0.0,
      cloudOpacity: 0.0,
      sunIntensity: 0,
      sunRayCount: 0,
      starCount: 4,
      mistIntensity: 0.6,
      horizonWarmth: 0.55,
      birdCount: 0,
      sunPosition: [50, 54],
    } as VisualConfig,
  },

  // ══════════════════════════════════════════════════════
  // STRONG — elevated, clarity
  // ══════════════════════════════════════════════════════
  strong: {
    morning: {
      ...morningBase,
      // Mountain ridge with wildflowers — blue sky, warm gold, green
      skyGradient: 'linear-gradient(180deg, hsl(212 45% 45%) 0%, hsl(210 42% 55%) 35%, hsl(208 38% 63%) 55%, hsl(210 42% 50%) 75%, hsl(212 45% 40%) 100%)',
      vignetteColor: 'hsl(212 45% 40%)',
      bottomFadeColor: 'hsl(130 25% 30%)',
      cloudDensity: 0.8,
      cloudSpeed: 0.8,
      cloudOpacity: 0.6,
      sunIntensity: 0.7,
      sunRayCount: 5,
      starCount: 0,
      mistIntensity: 0,
      horizonWarmth: 0.6,
      birdCount: 2,
      showBirds: true,
      sunPosition: [50, 46],
    } as VisualConfig,
    afternoon: {
      ...afternoonBase,
      // Mountain lake — deep teal, forest green, bright blue
      skyGradient: 'linear-gradient(180deg, hsl(205 42% 50%) 0%, hsl(203 40% 58%) 35%, hsl(200 38% 65%) 55%, hsl(203 40% 54%) 75%, hsl(205 42% 46%) 100%)',
      vignetteColor: 'hsl(205 42% 46%)',
      bottomFadeColor: 'hsl(185 30% 30%)',
      cloudDensity: 0.5,
      cloudSpeed: 0.5,
      cloudOpacity: 0.5,
      sunIntensity: 0.65,
      sunRayCount: 5,
      starCount: 0,
      mistIntensity: 0,
      horizonWarmth: 0.35,
      birdCount: 0,
      sunPosition: [50, 28],
    } as VisualConfig,
    evening: {
      ...eveningBase,
      // Harbour with boats — deep blue-grey, warm amber lights
      skyGradient: 'linear-gradient(180deg, hsl(218 38% 26%) 0%, hsl(220 35% 32%) 35%, hsl(216 30% 38%) 55%, hsl(218 35% 30%) 75%, hsl(218 38% 24%) 100%)',
      vignetteColor: 'hsl(218 38% 24%)',
      bottomFadeColor: 'hsl(218 30% 20%)',
      cloudDensity: 0.0,
      cloudSpeed: 0.0,
      cloudOpacity: 0.0,
      sunIntensity: 0,
      sunRayCount: 0,
      starCount: 6,
      mistIntensity: 0.4,
      horizonWarmth: 0.65,
      birdCount: 0,
      sunPosition: [50, 53],
    } as VisualConfig,
  },

  // ══════════════════════════════════════════════════════
  // PEAK — commanding, expansive
  // ══════════════════════════════════════════════════════
  peak: {
    morning: {
      ...morningBase,
      // Alpine panorama — rich cerulean, bright gold, white peaks
      skyGradient: 'linear-gradient(180deg, hsl(210 50% 50%) 0%, hsl(208 48% 58%) 35%, hsl(206 44% 65%) 55%, hsl(208 48% 55%) 75%, hsl(210 50% 45%) 100%)',
      vignetteColor: 'hsl(210 50% 45%)',
      bottomFadeColor: 'hsl(210 40% 35%)',
      cloudDensity: 0.4,
      cloudSpeed: 0.9,
      cloudOpacity: 0.5,
      sunIntensity: 0.85,
      sunRayCount: 7,
      starCount: 0,
      mistIntensity: 0,
      horizonWarmth: 0.8,
      birdCount: 3,
      showBirds: true,
      sunPosition: [50, 44],
    } as VisualConfig,
    afternoon: {
      ...afternoonBase,
      // Desert mesa / canyon — terracotta, cerulean, purple shadows
      skyGradient: 'linear-gradient(180deg, hsl(208 48% 52%) 0%, hsl(206 45% 60%) 35%, hsl(204 42% 68%) 55%, hsl(206 45% 56%) 75%, hsl(208 48% 48%) 100%)',
      vignetteColor: 'hsl(208 48% 48%)',
      bottomFadeColor: 'hsl(20 35% 35%)',
      cloudDensity: 0.3,
      cloudSpeed: 0.8,
      cloudOpacity: 0.4,
      sunIntensity: 0.9,
      sunRayCount: 8,
      starCount: 0,
      mistIntensity: 0,
      horizonWarmth: 0.5,
      birdCount: 0,
      sunPosition: [50, 25],
    } as VisualConfig,
    evening: {
      ...eveningBase,
      // Mountain lake under starlight — indigo, gold, silver stars
      skyGradient: 'linear-gradient(180deg, hsl(230 42% 20%) 0%, hsl(232 38% 26%) 35%, hsl(228 34% 32%) 55%, hsl(230 38% 24%) 75%, hsl(230 42% 18%) 100%)',
      vignetteColor: 'hsl(230 42% 18%)',
      bottomFadeColor: 'hsl(230 35% 16%)',
      cloudDensity: 0.0,
      cloudSpeed: 0.0,
      cloudOpacity: 0.0,
      sunIntensity: 0,
      sunRayCount: 0,
      starCount: 12,
      mistIntensity: 0.3,
      horizonWarmth: 0.8,
      birdCount: 0,
      sunPosition: [50, 52],
    } as VisualConfig,
  },

  // ══════════════════════════════════════════════════════
  // VERY HIGH — limitless, cosmic
  // ══════════════════════════════════════════════════════
  veryhigh: {
    morning: {
      ...morningBase,
      // Open ocean headland — azure, turquoise, golden grass
      skyGradient: 'linear-gradient(180deg, hsl(208 55% 52%) 0%, hsl(206 52% 60%) 35%, hsl(204 48% 68%) 55%, hsl(206 52% 58%) 75%, hsl(208 55% 48%) 100%)',
      vignetteColor: 'hsl(208 55% 48%)',
      bottomFadeColor: 'hsl(180 30% 35%)',
      cloudDensity: 0.2,
      cloudSpeed: 1.0,
      cloudOpacity: 0.4,
      sunIntensity: 1.0,
      sunRayCount: 9,
      starCount: 0,
      mistIntensity: 0,
      horizonWarmth: 1.0,
      birdCount: 3,
      showBirds: true,
      sunPosition: [50, 42],
    } as VisualConfig,
    afternoon: {
      ...afternoonBase,
      // Volcanic island coast — emerald, turquoise, coral
      skyGradient: 'linear-gradient(180deg, hsl(205 50% 55%) 0%, hsl(203 48% 62%) 35%, hsl(200 45% 70%) 55%, hsl(203 48% 60%) 75%, hsl(205 50% 50%) 100%)',
      vignetteColor: 'hsl(205 50% 50%)',
      bottomFadeColor: 'hsl(160 30% 32%)',
      cloudDensity: 0.15,
      cloudSpeed: 0.5,
      cloudOpacity: 0.3,
      sunIntensity: 1.0,
      sunRayCount: 10,
      starCount: 0,
      mistIntensity: 0,
      horizonWarmth: 0.5,
      birdCount: 0,
      sunPosition: [50, 22],
    } as VisualConfig,
    evening: {
      ...eveningBase,
      // Open starfield from plateau — midnight blue, stars, warm horizon
      skyGradient: 'linear-gradient(180deg, hsl(240 40% 18%) 0%, hsl(238 36% 24%) 35%, hsl(235 32% 30%) 55%, hsl(238 36% 22%) 75%, hsl(240 40% 16%) 100%)',
      vignetteColor: 'hsl(240 40% 16%)',
      bottomFadeColor: 'hsl(35 30% 18%)',
      cloudDensity: 0.0,
      cloudSpeed: 0.0,
      cloudOpacity: 0.0,
      sunIntensity: 0,
      sunRayCount: 0,
      starCount: 18,
      mistIntensity: 0.2,
      horizonWarmth: 0.9,
      birdCount: 0,
      sunPosition: [50, 54],
    } as VisualConfig,
  },
};

/** Divergence overlay: recovery = warm amber, masked = cool blue */
export function getDivergenceOverlay(variant: Variant): string | null {
  if (variant === 'recovery') return 'hsl(35 60% 50% / 0.08)';
  if (variant === 'masked') return 'hsl(215 50% 50% / 0.10)';
  return null;
}

/** Get all 21 render combinations */
export function getAllCombinations(): Array<{ tier: Tier; timeOfDay: TimeOfDay; variant: Variant; id: string }> {
  const tiers: Tier[] = ['depleted', 'managing', 'strong', 'peak', 'veryhigh'];
  const times: TimeOfDay[] = ['morning', 'afternoon', 'evening'];
  const combos: Array<{ tier: Tier; timeOfDay: TimeOfDay; variant: Variant; id: string }> = [];

  for (const tier of tiers) {
    for (const time of times) {
      combos.push({ tier, timeOfDay: time, variant: null, id: `${tier}-${time}` });
    }
  }

  // Divergence variants use the "managing" tier base images
  for (const time of times) {
    combos.push({ tier: 'managing', timeOfDay: time, variant: 'recovery', id: `recovery-${time}` });
    combos.push({ tier: 'managing', timeOfDay: time, variant: 'masked', id: `masked-${time}` });
  }

  return combos;
}
