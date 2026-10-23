// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Open Loops Domain Engine.
// Source: Part 2 Layer 2 (Section 4.10).

import type { OpenLoopsFacts, OpenLoopItem } from "./types.ts";
import { OPEN_LOOPS_ENABLED } from "./constants.ts";

export interface OpenLoopsEngineInput {
  hasCommunicationConnector?: boolean;
  rawSignals?: OpenLoopItem[];
}

export class OpenLoopsEngine {
  /**
   * Evaluates open communication loops and pending decisions.
   * Dormant (switched off) until communication connectors ship.
   */
  public evaluate(input?: OpenLoopsEngineInput): OpenLoopsFacts {
    const isConnectorActive = input?.hasCommunicationConnector && OPEN_LOOPS_ENABLED;

    if (!isConnectorActive || !input?.rawSignals || input.rawSignals.length === 0) {
      return {
        active: false,
        openLoopsCount: 0,
        decisionsPendingCount: 0,
        items: [],
      };
    }

    const items = input.rawSignals;
    const decisionsPendingCount = items.filter((i) => i.title.toLowerCase().includes("decision")).length;

    return {
      active: true,
      openLoopsCount: items.length,
      decisionsPendingCount,
      items,
    };
  }
}

export const openLoopsEngine = new OpenLoopsEngine();
