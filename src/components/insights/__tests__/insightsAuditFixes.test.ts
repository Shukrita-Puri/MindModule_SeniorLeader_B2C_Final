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
});
