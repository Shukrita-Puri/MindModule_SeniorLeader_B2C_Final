import { useNavigate } from 'react-router-dom';

type StepKey = 1 | 2 | 3;

const STEPS: Array<{ key: StepKey; label: string; path: string }> = [
  { key: 1, label: 'Assessment', path: '/daily-check-in' },
  { key: 2, label: 'Brief', path: '/executive-home' },
  { key: 3, label: 'Plan', path: '/plan' },
];

interface TodayStepperProps {
  current: StepKey;
  /**
   * Optional: highlight a step as the next suggested action.
   * When set (and different from `current`), the connector leading
   * to it animates as a dashed shimmer and the dot gets a soft pulse.
   */
  nextHint?: StepKey;
}

/**
 * Presentational-only step indicator that visually links the
 * Assessment → Brief → Plan pages under a shared "Today" flow.
 * Each dot navigates to the existing route — no logic or guarding.
 */
const TodayStepper = ({ current, nextHint }: TodayStepperProps) => {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-lg mx-auto px-4 pt-1 pb-2">
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((step, idx) => {
          const isActive = step.key === current;
          const isPast = step.key < current;
          const isHinted = nextHint === step.key && !isActive;
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => navigate(step.path)}
                className="flex flex-col items-center gap-1 group focus:outline-none relative"
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="relative inline-flex items-center justify-center">
                  {isHinted && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full motion-safe:animate-ping"
                      style={{
                        backgroundColor: 'hsl(var(--taupe) / 0.35)',
                      }}
                    />
                  )}
                  <span
                  className={`flex items-center justify-center rounded-full transition-all duration-200 font-headline text-[11px] font-semibold ${
                    isActive
                      ? 'bg-saffron text-saffron-foreground w-7 h-7 shadow-sm'
                      : isPast
                        ? 'bg-taupe/70 text-taupe-foreground w-6 h-6'
                        : isHinted
                          ? 'bg-taupe/20 text-foreground border w-7 h-7 shadow-sm'
                          : 'bg-transparent text-taupe border border-taupe/40 w-6 h-6'
                  }`}
                  style={isHinted ? { borderColor: 'hsl(var(--taupe) / 0.5)' } : undefined}
                >
                  {step.key}
                  </span>
                </span>
                <span
                  className={`text-[10px] tracking-[0.12em] uppercase font-body leading-none ${
                    isActive ? 'text-foreground' : isHinted ? 'text-foreground' : 'text-taupe'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                (() => {
                  const nextStepKey = (step.key + 1) as StepKey;
                  const connectorHinted = nextHint === nextStepKey && nextStepKey !== current;
                  if (connectorHinted) {
                    return (
                      <div
                        className="flex-1 h-px mx-2 mb-4 motion-safe:animate-stepper-shimmer"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(to right, hsl(var(--taupe) / 0.5) 0 6px, transparent 6px 10px)',
                          backgroundSize: '20px 1px',
                          backgroundRepeat: 'repeat-x',
                        }}
                        aria-hidden="true"
                      />
                    );
                  }
                  return (
                    <div
                      className={`flex-1 h-px mx-2 mb-4 ${
                        isPast || isActive ? 'bg-taupe/50' : 'bg-taupe/20'
                      }`}
                    />
                  );
                })()
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodayStepper;