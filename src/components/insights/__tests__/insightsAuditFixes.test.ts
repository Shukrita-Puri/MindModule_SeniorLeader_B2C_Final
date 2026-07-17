import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRACTICE_SRC = readFileSync(
  join(process.cwd(), 'src/components/insights/PracticeEffectiveness.tsx'),
  'utf8',
);
const CAUSALITY_SRC = readFileSync(
  join(process.cwd(), 'src/components/insights/PerformanceCausalityCard.tsx'),
  'utf8',
);
const RHYTHM_SRC = readFileSync(
  join(process.cwd(), 'src/components/insights/PerformanceRhythmCard.tsx'),
  'utf8',
);
const ENGINE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/cause-effect-engine/index.ts'),
  'utf8',
);
const CONTENT_FEEDBACK_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/content-feedback/index.ts'),
  'utf8',
);
const SMART_NUDGES_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/smart-nudges/index.ts'),
  'utf8',
);

describe('Insights audit fixes', () => {
  it('renders box3 physiology rows in Practice Effectiveness', () => {
    expect(PRACTICE_SRC).toContain('What&apos;s measurably shifting');
    expect(PRACTICE_SRC).toContain('function PhysiologyRow');
    expect(PRACTICE_SRC).toContain('const measurableShiftRows = useMemo(');
  });

  it('uses HRV and intraday HR sample counts for tab unlocks', () => {
    expect(CAUSALITY_SRC).toContain("const hrvDays = data?.diagnostics?.counts?.hrvDays ?? wearableDays;");
    expect(CAUSALITY_SRC).toContain("const hrSamplesDays = data?.diagnostics?.counts?.hrSamplesDays ?? wearableDays;");
    expect(CAUSALITY_SRC).toContain('checkinCount >= 7 && hrSamplesDays >= 5');
    expect(CAUSALITY_SRC).toContain('cov?.hasWearable && hrvDays >= 7');
  });

  it('keeps the burnout chart historical with an inline reading guide', () => {
    expect(CAUSALITY_SRC).toContain('Each column is a past week, not a forecast.');
  });

  it('shows an explicit error block for rhythm-card failures', () => {
    expect(RHYTHM_SRC).toContain("const [errored, setErrored] = useState(false);");
    expect(RHYTHM_SRC).toContain("Couldn&rsquo;t load this card. Try refreshing.");
  });

  it('extends recovery lookahead to 7 days on the server', () => {
    expect(ENGINE_SRC).toContain('const RECOVERY_LOOKAHEAD_DAYS = 7;');
  });

  it('uses session-based stage keys for Practice Effectiveness', () => {
    expect(PRACTICE_SRC).toContain("type Stage = 'early' | 'building' | 'deepening';");
    expect(PRACTICE_SRC).toContain('function normalizeStage');
    expect(CONTENT_FEEDBACK_SRC).toContain("totalPractices < 3 ? 'early' : totalPractices < 10 ? 'building' : 'deepening';");
  });

  it('makes burnout trajectory banner copy self-explanatory', () => {
    expect(ENGINE_SRC).toContain('Risk trajectory: escalating - load is building');
    expect(ENGINE_SRC).toContain('Risk trajectory: improving - recovery is gaining');
    expect(ENGINE_SRC).toContain('Risk trajectory: stable - holding consistent');
  });

  it('implements the dormant pattern-alert evaluator without enabling the global flag', () => {
    expect(SMART_NUDGES_SRC).toContain("const MVP_POST_LAUNCH = false;");
    expect(SMART_NUDGES_SRC).toContain("const PATTERN_ALERT_ENABLED = false;");
    expect(SMART_NUDGES_SRC).toContain("if (!MVP_POST_LAUNCH || !PATTERN_ALERT_ENABLED) return null;");
    expect(SMART_NUDGES_SRC).toContain('type: "pattern_alert"');
    expect(SMART_NUDGES_SRC).toContain('deepLinkRoute: "/insights/performance-causality"');
    expect(SMART_NUDGES_SRC).toContain('variantId: "FB-PATTERN"');
  });
});
