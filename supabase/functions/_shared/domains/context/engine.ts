// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Context Assembler Domain Engine.
// Single entry point for context assembly reading through queries and running pure assembler.
// Source: Part 2 Layer 2 (Section 1.1, Section 5).

import { fetchContextRawData, type SupabaseClientLike } from "./queries.ts";
import { assembleContextFromRaw, type AssembleContextOptions } from "./assembler.ts";
import type { ContextBundle } from "./types.ts";
import type { WindowName } from "../window-mode/types.ts";

export interface AssembleContextInput {
  userId: string;
  localDate: string;
  windowName: WindowName;
  options?: AssembleContextOptions;
}

export class ContextAssemblerEngine {
  public async assembleContext(
    supabase: SupabaseClientLike,
    input: AssembleContextInput
  ): Promise<ContextBundle> {
    const rawData = await fetchContextRawData(
      supabase,
      input.userId,
      input.localDate,
      input.windowName
    );

    return assembleContextFromRaw(rawData, input.options);
  }
}

export const contextAssemblerEngine = new ContextAssemblerEngine();

export async function assembleContext(
  supabase: SupabaseClientLike,
  input: AssembleContextInput
): Promise<ContextBundle> {
  return contextAssemblerEngine.assembleContext(supabase, input);
}
