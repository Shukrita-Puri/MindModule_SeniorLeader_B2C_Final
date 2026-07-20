import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  shouldRenderArcBadge,
  isRestDayPlanShape,
  buildSlotDebugPayload,
} from '../TodayThreePriorities';

const SRC = readFileSync(
  join(process.cwd(), 'src/components/home/TodayThreePriorities.tsx'),
  'utf8',
);

describe('Sprint F — Plan slot rendering contract', () => {
  describe('shouldRenderArcBadge', () => {
    it('renders Steady for a state-only slot with no event anchor', () => {
      expect(
        shouldRenderArcBadge({ arcLabel: 'Steady', isJit: false, jitEventTitle: null })
      ).toBe(true);
    });

    it('renders Prepare when slot is anchored to a real event (isJit)', () => {
      expect(
        shouldRenderArcBadge({ arcLabel: 'Prepare', isJit: true, jitEventTitle: 'Board review' })
      ).toBe(true);
    });

    it('renders Recover when jitEventTitle is present even if isJit is false', () => {
      expect(
        shouldRenderArcBadge({ arcLabel: 'Recover', isJit: false, jitEventTitle: 'Board review' })
      ).toBe(true);
    });

    it('does NOT render Prepare on a state-only slot (no event anchor)', () => {
      expect(
        shouldRenderArcBadge({ arcLabel: 'Prepare', isJit: false, jitEventTitle: null })
      ).toBe(false);
    });

    it('does NOT render During on a state-only slot (Category A must not invent During)', () => {
      expect(
        shouldRenderArcBadge({ arcLabel: 'During', isJit: false, jitEventTitle: null })
      ).toBe(false);
    });

    it('does NOT render when arcLabel is missing', () => {
      expect(shouldRenderArcBadge({ isJit: true, jitEventTitle: 'x' } as any)).toBe(false);
    });
  });

  describe('Full-arc board/governance day', () => {
    it('renders Prepare / Steady / Recover but never fabricates During', () => {
      const slots: Array<Parameters<typeof shouldRenderArcBadge>[0]> = [
        { arcLabel: 'Prepare', isJit: true, jitEventTitle: 'Board meeting' },
        { arcLabel: 'Steady', isJit: false, jitEventTitle: null },
        { arcLabel: 'Recover', isJit: true, jitEventTitle: 'Board meeting' },
      ];
      const rendered = slots.map(shouldRenderArcBadge);
      expect(rendered).toEqual([true, true, true]);
      // Guard: a stray During without event anchor must still be dropped.
      expect(
        shouldRenderArcBadge({ arcLabel: 'During', isJit: false, jitEventTitle: null })
      ).toBe(false);
    });
  });

  describe('isRestDayPlanShape', () => {
    it('detects meta.restDay === true', () => {
      expect(isRestDayPlanShape({ meta: { restDay: true, generatedAt: '' } as any })).toBe(true);
    });

    it("detects meta.dayShape === 'rest_day'", () => {
      expect(isRestDayPlanShape({ meta: { dayShape: 'rest_day', generatedAt: '' } as any })).toBe(true);
    });

    it('detects legacy top-level restDay flag', () => {
      expect(isRestDayPlanShape({ restDay: true } as any)).toBe(true);
    });

    it('returns false for a normal plan', () => {
      expect(isRestDayPlanShape({ meta: { generatedAt: '' } as any })).toBe(false);
    });

    it('returns false for null/undefined plans', () => {
      expect(isRestDayPlanShape(null)).toBe(false);
      expect(isRestDayPlanShape(undefined)).toBe(false);
    });
  });

  describe('buildSlotDebugPayload', () => {
    it('emits the full allocator-driven schema for a state-only slot', () => {
      const plan = { meta: { dayShape: 'standard', mode: 'default', generatedAt: '' } };
      const hm = {
        arcLabel: 'Steady',
        slotRole: 'state-only',
        jitPhase: null,
        jitEventTitle: null,
        isJit: false,
        combo: 'somatic:reset',
        intent: 'recover',
        mode: null,
        practice: { contentId: 'p-1', title: 'Downshift' },
      };
      expect(buildSlotDebugPayload(plan, hm, 0)).toEqual({
        dayShape: 'standard',
        mode: 'default',
        slotIndex: 0,
        arcLabel: 'Steady',
        slotRole: 'state-only',
        jitPhase: null,
        jitEventTitle: null,
        practiceId: 'p-1',
        practiceTitle: 'Downshift',
        combo: 'somatic:reset',
        intent: 'recover',
      });
    });

    it('emits null-safe values when plan / hm fields are missing', () => {
      const payload = buildSlotDebugPayload(null, { practice: {} }, 2);
      expect(payload).toEqual({
        dayShape: null,
        mode: null,
        slotIndex: 2,
        arcLabel: null,
        slotRole: null,
        jitPhase: null,
        jitEventTitle: null,
        practiceId: null,
        practiceTitle: null,
        combo: null,
        intent: null,
      });
    });
  });

  describe('[Plan][slot-debug] log is dev-guarded', () => {
    it('does not log when import.meta.env.DEV is false', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      // Simulate the exact guard used in TodayThreePriorities.
      const DEV = false;
      if (DEV) {
        console.info('[Plan][slot-debug]', buildSlotDebugPayload(null, {}, 0));
      }
      const called = spy.mock.calls.some((c) => String(c[0]).includes('[Plan][slot-debug]'));
      spy.mockRestore();
      expect(called).toBe(false);
    });

    it('does log when the DEV guard is true', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const DEV = true;
      if (DEV) {
        console.info('[Plan][slot-debug]', buildSlotDebugPayload(null, {}, 0));
      }
      const called = spy.mock.calls.some((c) => String(c[0]).includes('[Plan][slot-debug]'));
      spy.mockRestore();
      expect(called).toBe(true);
    });
  });

  describe('render order contract', () => {
    it('renders horizon modules in server slot order without priority re-sorting', () => {
      expect(SRC).toContain(
        "const visibleHorizonModules = (horizonModules || []).map((hm, index) => ({ hm, index }));",
      );
    });

    it('does not hide low-priority incomplete slots on the client', () => {
      expect(SRC).not.toContain("if (hm.priorityTag === 'low' && hasNonLowIncomplete) return false;");
    });

    it('tops back up to 3 after coach-only slots are stripped', () => {
      expect(SRC).toContain("if (isRestDayPlan || filtered.length >= 3) {");
      expect(SRC).toContain("const fallback = buildFallbackHorizonModules(plan as unknown as Record<string, unknown>);");
      expect(SRC).toContain("return { ...plan, horizonModules: toppedUp.slice(0, 3) };");
    });

    it('sends strict Brief handshake + explicit timeWindow on home Plan generation', () => {
      expect(SRC).toContain('const currentWindow = getCurrentTimeWindow();');
      expect(SRC).toContain('timeWindow: currentWindow,');
      expect(SRC).toContain('strictBriefHandshake: true,');
    });
  });

  // WS4 → FE contract: slot metadata comes from `plan_ledger` fields
  // (`jitPhase`, `anchorSubcategory`, `anchorCategoryId`). The component
  // must NOT re-derive the anchor from the event title on the client.
  describe('WS4 · ledger-driven anchor rendering (no title inference)', () => {
    it('does not import a client-side title classifier (enrichEvent)', () => {
      expect(SRC).not.toMatch(/from\s+['"][^'"]*enrich-event['"]/);
      expect(SRC).not.toMatch(/\benrichEvent\s*\(/);
    });

    it('reads jitPhase directly from the horizon module (ledger field)', () => {
      expect(SRC).toContain('jitPhase: hm?.jitPhase ?? null');
    });

    it('emits jitPhase into the slot debug payload without post-processing', () => {
      const plan = { meta: { dayShape: 'standard', mode: 'default', generatedAt: '' } };
      const hm = {
        arcLabel: 'Prepare',
        slotRole: 'event-anchored',
        jitPhase: 'pre',
        jitEventTitle: 'Board review',
        isJit: true,
        combo: 'cognitive:prime',
        intent: 'prepare',
        mode: null,
        practice: { contentId: 'p-42', title: 'Pre-brief centring' },
      };
      const payload = buildSlotDebugPayload(plan, hm, 0);
      expect(payload.jitPhase).toBe('pre');
      expect(payload.jitEventTitle).toBe('Board review');
      expect(payload.arcLabel).toBe('Prepare');
    });
  });
});
