import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Sparkles, ArrowDown, ThumbsUp, ThumbsDown } from 'lucide-react';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { trackEngagement } from '@/utils/engagementTracking';
import { submitRelevanceFeedback } from '@/utils/relevanceFeedback';
import { useToast } from '@/hooks/use-toast';

const DailyRitual = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recommendations, setRecommendations] = useState<{
    soundbath: Recommendation | null;
    guidedPractice: Recommendation | null;
    microPractice: Recommendation | null;
    reasoning: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});
  const [isRitualCompleted, setIsRitualCompleted] = useState(false);

  useEffect(() => {
    loadRecommendations();
    checkRitualCompletion();
  }, []);

  const checkRitualCompletion = () => {
    const today = new Date().toISOString().split('T')[0];
    const ritualCompletions = JSON.parse(localStorage.getItem('ritualCompletions') || '{}');
    setIsRitualCompleted(ritualCompletions[today] === true);
  };

  const loadRecommendations = async () => {
    setLoading(true);
    const energyState = computeEnergyState();
    const recs = await generateRecommendations(energyState);
    setRecommendations(recs);
    setLoading(false);
  };

  if (loading || !recommendations) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground animate-pulse">
          Creating your ritual...
        </p>
      </div>
    );
  }

  const allRecs = [
    recommendations.soundbath,
    recommendations.guidedPractice,
    recommendations.microPractice
  ].filter(Boolean) as Recommendation[];

  const totalDuration = allRecs.reduce((sum, rec) => sum + rec.duration, 0);

  const handleStartRitual = async () => {
    // Track ritual start engagement
    await trackEngagement('daily_ritual_start');
    
    // Store ritual queue in localStorage for UI continuity
    localStorage.setItem('practiceQueue', JSON.stringify(allRecs));
    
    // Navigate to first practice
    if (allRecs[0]) {
      const first = allRecs[0];
      if (first.contentType === 'soundbath') {
        navigate(`/soundscapes/${first.id}`, { state: { category: first.category } });
      } else if (first.contentType === 'guided-practice') {
        navigate(`/guided-practices/${first.id}`, { state: { category: first.category } });
      } else if (first.contentType === 'micro-practice') {
        navigate(`/micro-practice/${first.id}`, { state: { category: first.category } });
      }
    }
  };

  const handleFeedback = async (rec: Recommendation, type: 'thumbs_up' | 'thumbs_down', position: number) => {
    setFeedback(prev => ({ ...prev, [rec.id]: type }));
    
    await submitRelevanceFeedback({
      contentId: rec.id,
      contentType: rec.contentType,
      feedbackType: type,
      triggerContext: 'daily_ritual_recommendation',
      contextData: { position, totalSteps: allRecs.length }
    });

    toast({
      description: "Thanks for your feedback",
      duration: 2000,
    });
  };

  return (
    <div className="space-y-4">
      {/* Reasoning */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
        <Sparkles className="w-4 h-4 text-saffron flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">{recommendations.reasoning}</p>
      </div>

      {/* Sequential Flow */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">Your Complete Ritual</h4>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{totalDuration} min total</span>
          </div>
        </div>

        {allRecs.map((rec, index) => (
          <div key={rec.id}>
            {/* Step Card */}
            <div className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-saffron/10 text-saffron flex items-center justify-center text-sm font-semibold">
                {index + 1}
              </div>
              
              <div
                className="w-14 h-14 rounded-lg bg-cover bg-center flex-shrink-0"
                style={{ backgroundImage: `url('${rec.thumbnail}')` }}
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h5 className="text-sm font-semibold text-foreground line-clamp-1">
                    {rec.title}
                  </h5>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {rec.duration}m
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">
                  {rec.whyNow}
                </p>
                
                {/* Feedback buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFeedback(rec, 'thumbs_up', index + 1)}
                    className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-600 transition-colors"
                    aria-label="This is helpful"
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${feedback[rec.id] === 'thumbs_up' ? 'fill-emerald-600 text-emerald-600' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleFeedback(rec, 'thumbs_down', index + 1)}
                    className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-600 transition-colors"
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className={`w-3.5 h-3.5 ${feedback[rec.id] === 'thumbs_down' ? 'fill-orange-600 text-orange-600' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Arrow between steps */}
            {index < allRecs.length - 1 && (
              <div className="flex justify-center py-2">
                <ArrowDown className="w-4 h-4 text-muted-foreground/50" />
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* Start/Complete Button */}
      {isRitualCompleted ? (
        <Button
          disabled
          className="w-full bg-emerald-600/50 text-white cursor-default"
        >
          ✓ Daily Ritual Completed
        </Button>
      ) : (
        <Button
          onClick={handleStartRitual}
          className="w-full bg-gradient-to-r from-taupe via-taupe-highlight to-taupe hover:opacity-90 text-white"
        >
          Start Your Ritual →
        </Button>
      )}
    </div>
  );
};

export default DailyRitual;
