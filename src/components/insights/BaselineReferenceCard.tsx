import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { format } from 'date-fns';
import InsightInfoModal from './InsightInfoModal';
import { getArchetypeDisplay, PRACTICE_PRIORITY_LABELS } from '@/utils/innerWorldArchetypes';

interface ProfileBaseline {
  mentalFitnessBaseline?: number;
  componentScores?: Record<string, number>;
  userArchetype?: string;
  onboardingCompletedAt?: string;
  growthPriority?: string;
  practicePriorityTag?: string;
}

interface BaselineReferenceCardProps {
  profile: ProfileBaseline | null;
}

const BaselineReferenceCard = ({ profile }: BaselineReferenceCardProps) => {
  if (!profile?.mentalFitnessBaseline) {
    return null;
  }

  const baselineScore = profile.mentalFitnessBaseline;
  const archetypeInfo = getArchetypeDisplay(profile.userArchetype);
  const establishedDate = profile.onboardingCompletedAt 
    ? format(new Date(profile.onboardingCompletedAt), 'MMM d, yyyy')
    : 'Recently';

  const focusLabel = profile.practicePriorityTag
    ? PRACTICE_PRIORITY_LABELS[profile.practicePriorityTag]
    : profile.growthPriority
      ? profile.growthPriority.replace(/-/g, ' ').replace(/_/g, ' ')
      : null;

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-card via-card to-card/95 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
      {/* Top glass highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {/* Subtle saffron glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,140,66,0.05)_0%,transparent_50%)] pointer-events-none" />
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
            Your Leadership Blueprint
          </span>
          <InsightInfoModal
            title="Your Leadership Blueprint"
            explanation="Your foundation. This is who you are based on your onboarding assessment – your mental fitness baseline, your archetype, and the component scores that define how you regulate, focus, and recover. Every other insight on this page is measured against this."
          />
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex items-center gap-5">
          {/* Baseline score with luxury ring */}
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg className="absolute inset-0 w-full h-full drop-shadow-lg" viewBox="0 0 80 80">
              <defs>
                <linearGradient id="baselineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--saffron))" stopOpacity="1" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                </linearGradient>
                <filter id="baselineGlow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" />
                </filter>
              </defs>
              {/* Background track */}
              <circle 
                cx="40" cy="40" r="32" 
                fill="none" 
                stroke="hsl(var(--muted))"
                strokeWidth="5"
                strokeOpacity="0.3"
              />
              {/* Progress arc */}
              <circle 
                cx="40" cy="40" r="32" 
                fill="none" 
                stroke="url(#baselineGradient)"
                strokeWidth="5"
                strokeDasharray={`${(baselineScore / 100) * 201} 201`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                filter="url(#baselineGlow)"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-saffron">{baselineScore}</span>
            </div>
          </div>
          
          {/* Archetype info */}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-foreground truncate">
              {archetypeInfo.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assessed {establishedDate}
            </p>
            {focusLabel && (
              <p className="text-xs text-saffron/80 mt-2 capitalize">
                Focus: {focusLabel}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BaselineReferenceCard;
