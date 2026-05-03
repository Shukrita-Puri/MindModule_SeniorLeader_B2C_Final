import { useNavigate } from 'react-router-dom';

type StepKey = 1 | 2 | 3;

const STEPS: Array<{ key: StepKey; label: string; path: string }> = [
  { key: 1, label: 'Assessment', path: '/daily-check-in' },
  { key: 2, label: 'Brief', path: '/executive-home' },
  { key: 3, label: 'Plan', path: '/plan' },
];

interface TodayStepperProps {
  current: StepKey;
}

/**
 * Presentational-only step indicator that visually links the
 * Assessment → Brief → Plan pages under a shared "Today" flow.
 * Each dot navigates to the existing route — no logic or guarding.
 */
const TodayStepper = ({ current }: TodayStepperProps) => {
  const navigate = useNavigate();

  return (
    <div className="w-full max-w-lg mx-auto px-4 pt-1 pb-2">
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((step, idx) => {
          const isActive = step.key === current;
          const isPast = step.key < current;
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => navigate(step.path)}
                className="flex flex-col items-center gap-1 group focus:outline-none"
                aria-current={isActive ? 'step' : undefined}
              >
                <span
                  className={`flex items-center justify-center rounded-full transition-all duration-200 font-headline text-[11px] font-semibold ${
                    isActive
                      ? 'bg-foreground text-background w-7 h-7 shadow-sm'
                      : isPast
                        ? 'bg-foreground/70 text-background w-6 h-6'
                        : 'bg-transparent text-muted-foreground/70 border border-muted-foreground/30 w-6 h-6'
                  }`}
                >
                  {step.key}
                </span>
                <span
                  className={`text-[10px] tracking-[0.12em] uppercase font-body leading-none ${
                    isActive ? 'text-foreground' : 'text-muted-foreground/70'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 mb-4 ${
                    isPast || isActive ? 'bg-foreground/40' : 'bg-muted-foreground/20'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodayStepper;