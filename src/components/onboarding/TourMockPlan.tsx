/**
 * TourMockPlan — read-only static rendering of best-in-class priorities
 * shown to GENUINE first-time users during the App Tour, so the spotlight
 * on the Plan card highlights a realistic, fully populated layout instead
 * of an empty awaiting state.
 *
 * Gating is owned by useTourMock (triple-AND). This component is purely
 * presentational — no DB writes, no completion logic, no Start button
 * navigation. Visual style mirrors TodayThreePriorities so the spotlight
 * frames the same container shape the real user sees post-check-in.
 */

import { MOCK_PLAN_PRIORITIES } from './tourMockData';

const HORIZON_LABELS: Record<string, string> = {
  immediate: 'Immediate · next hour',
  tactical: 'Tactical · today',
  strategic: 'Strategic · tomorrow',
};

const TourMockPlan = () => {
  return (
    <div className="space-y-3 px-3 pb-1">
      {MOCK_PLAN_PRIORITIES.map((p, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-[#cfc7b8] bg-white
                     shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 py-3.5"
        >
          <div className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-full bg-foreground/5 flex items-center
                         justify-center text-xs font-semibold text-foreground/70 flex-shrink-0"
            >
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.08em] uppercase text-[hsl(var(--muted-foreground-v2))] mb-0.5">
                {HORIZON_LABELS[p.horizon] ?? p.horizon}
              </div>
              <div className="font-headline text-[15px] font-medium text-foreground leading-snug">
                {p.title}
              </div>
              <div className="italic text-[12px] text-[hsl(var(--muted-foreground-v2))] mt-0.5">
                {p.subLine}
              </div>
              <p className="text-[13px] text-foreground/75 leading-relaxed mt-2">
                {p.whyLine}
              </p>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground-v2))]">
                <span className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-0.5">
                  {p.practice.title}
                </span>
                <span>· {p.practice.duration} min</span>
              </div>
            </div>
          </div>
        </div>
      ))}
      <p className="text-center text-[10px] text-[hsl(var(--muted-foreground-v2))] pt-1 opacity-70">
        Sample plan · your real plan generates after your first check-in
      </p>
    </div>
  );
};

export default TourMockPlan;