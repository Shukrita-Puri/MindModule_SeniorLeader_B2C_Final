// [KIND: adapter] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Practice Adapter for Layer 3 Interventions.
// Adapts database / catalogue snapshot into typed PracticeDefinition objects.
// Source: Part 2 Layer 3 (Section 4.1, 13.5).

import type { PracticeDefinition } from "../types.ts";

export class PracticeAdapter {
  private static cachedCatalogue: PracticeDefinition[] | null = null;
  private static version = "1.0.0";

  /**
   * Adapts raw database/json records into typed PracticeDefinition list.
   */
  public static adapt(rawList: any[]): PracticeDefinition[] {
    return rawList.map((item) => ({
      id: item.id,
      title: item.title,
      visible: item.visible ?? true,
      surfaces: item.surfaces ?? ["recalibrate", "plan", "nudge"],
      content_type: item.content_type ?? "micro-practice",
      sub_type: item.sub_type === "mindset" ? "mindset" : "somatic",
      category: item.category ?? "pause",
      recalibrate_page: item.recalibrate_page ?? "pause",
      recalibrate_section: item.recalibrate_section ?? "somatic",
      protocol_type: item.protocol_type ?? "somatic",
      minutes: Number(item.minutes ?? 2),
      duration_band: item.duration_band ?? "quick",
      combos: item.combos ?? [],
      arousal: item.arousal ?? "steadying",
      energy_direction: item.energy_direction,
      intensity: item.intensity,
      horizon: item.horizon,
      moment: item.moment,
      meta_skill: item.meta_skill,
      usage_occasions: item.usage_occasions,
      state_signal: item.state_signal,
      capabilities: item.capabilities ?? [],
      goal_tags: item.goal_tags ?? [],
    }));
  }

  public static setCatalogue(practices: PracticeDefinition[], version = "1.0.0") {
    PracticeAdapter.cachedCatalogue = practices;
    PracticeAdapter.version = version;
  }

  public static getCatalogue(): PracticeDefinition[] {
    return PracticeAdapter.cachedCatalogue ?? [];
  }

  public static getVersion(): string {
    return PracticeAdapter.version;
  }
}
