import { lazy, Suspense, useRef } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import ShareCardButton from '@/components/insights/ShareCardButton';

const LeadershipPatternsCard = lazy(() => import('@/components/insights/LeadershipPatternsCard'));
const PerformanceRhythmCard = lazy(() => import('@/components/insights/PerformanceRhythmCard'));
const PerformanceCausalityCard = lazy(() => import('@/components/insights/PerformanceCausalityCard'));
const PracticeEffectiveness = lazy(() => import('@/components/insights/PracticeEffectiveness'));

interface CardDef {
  title: string;
  render: (userId?: string) => JSX.Element;
}

const CARDS: Record<string, CardDef> = {
  'leadership-patterns': {
    title: 'Your Performance Trajectory',
    render: (userId) => <LeadershipPatternsCard userId={userId} />,
  },
  'performance-rhythm': {
    title: 'When You Perform Best',
    render: (userId) => <PerformanceRhythmCard userId={userId} />,
  },
  'performance-causality': {
    title: 'What Drains Your Performance',
    render: (userId) => <PerformanceCausalityCard userId={userId} />,
  },
  'practice-effectiveness': {
    title: 'What Restores Your Performance',
    render: (userId) => (
      <div className="rounded-2xl bg-card/80 backdrop-blur-md border border-border/40 p-4">
        <PracticeEffectiveness userId={userId} />
      </div>
    ),
  },
};

const InsightDetail = () => {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const captureRef = useRef<HTMLDivElement>(null);

  if (!cardId || !CARDS[cardId]) {
    return <Navigate to="/insights" replace />;
  }
  const card = CARDS[cardId];

  return (
    <div
      className="min-h-[100dvh] w-full bg-[radial-gradient(ellipse_120%_80%_at_15%_-10%,hsl(0_0%_100%/0.55)_0%,hsl(0_0%_100%/0.16)_30%,transparent_58%),radial-gradient(ellipse_90%_60%_at_110%_110%,hsl(122_22%_35%/0.32)_0%,transparent_60%),linear-gradient(165deg,hsl(122_22%_41%/0.22)_0%,hsl(122_18%_50%/0.10)_55%,hsl(122_22%_41%/0.24)_100%)]"
    >
      {/* Header — back only; title moved out, share lives inside each card */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-3 backdrop-blur-md bg-background/40 border-b border-border/30"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)', paddingBottom: '0.5rem' }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/insights')}
          className="h-10 w-10 rounded-full"
          aria-label="Back to insights"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="w-10" aria-hidden />
      </header>

      <div
        className="px-4 max-w-lg mx-auto pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)' }}
      >
        {/* Share lives INSIDE the card frame (top-right, left of each card's
            info "i" tooltip). It carries data-share-hide so the snapshot
            taken by shareInsightCard excludes the share affordance itself.
            captureRef wraps the card so any toggle / tab state currently
            visible is what gets exported. */}
        <div ref={captureRef} className="relative">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            {card.render(user?.id)}
          </Suspense>
          <div
            data-share-hide
            className="absolute top-2 right-12 z-20"
          >
            <ShareCardButton
              targetRef={captureRef}
              title={card.title}
              fileName={`mind-module-${cardId}.png`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightDetail;