import { lazy, Suspense, useRef } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { InsightShareProvider } from '@/components/insights/InsightShareSlot';

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
      <div className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4">
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
    <div className="min-h-[100dvh] w-full bg-transparent">
      {/* Header — back only; title moved out, share lives inside each card */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-3 backdrop-blur-md bg-background/40"
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
          <InsightShareProvider
            value={{ targetRef: captureRef, title: card.title, fileName: `mind-module-${cardId}.png` }}
          >
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            {card.render(user?.id)}
          </Suspense>
          </InsightShareProvider>
          <div
            data-share-only
            style={{ display: 'none' }}
            className="mt-3 pt-2 flex items-center justify-between"
          >
            <span className="text-[10px] text-muted-foreground font-body">Mind Module</span>
            <span className="text-[10px] text-muted-foreground font-body">mindmodule.me</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightDetail;
