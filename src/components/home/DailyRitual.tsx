import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowDown, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { submitRelevanceFeedback } from '@/utils/relevanceFeedback';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const DailyRitual = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<{
    practices: Recommendation[];
    recommendedCount: number;
    reasoning: string;
  }>({ practices: [], recommendedCount: 0, reasoning: '' });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});
  const [ritualStatus, setRitualStatus] = useState<{
    status: 'not_started' | 'partial' | 'completed';
    completedCount: number;
    totalCount: number;
  }>({
    status: 'not_started',
    completedCount: 0,
    totalCount: 0
  });

  useEffect(() => {
    loadRecommendations();
    checkRitualCompletion();
    
    const interval = setInterval(() => {
      checkRitualCompletion();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [user?.id]);

  const checkRitualCompletion = async () => {
    if (!user?.id) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .select('*')
      .eq('user_id', user.id)
      .eq('ritual_date', today)
      .single();
    
    if (error || !data) {
      const actualCount = recommendations.practices.length || 0;
      setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: actualCount });
      return;
    }
    
    const completedIds = data.completed_practice_ids || [];
    const totalRecommended = data.recommended_practices_count || recommendations.recommendedCount || 0;
    
    let status: 'not_started' | 'partial' | 'completed' = 'not_started';
    
    if (data.completion_status === 'full') {
      status = 'completed';
    } else if (completedIds.length >= totalRecommended && completedIds.length > 0) {
      status = 'completed';
      
      await supabase
        .from('daily_ritual_completions')
        .update({ completion_status: 'full' })
        .eq('user_id', user.id)
        .eq('ritual_date', today);
    } else if (completedIds.length > 0) {
      status = 'partial';
    }
    
    setRitualStatus({
      status,
      completedCount: completedIds.length,
      totalCount: totalRecommended
    });
  };

  const loadRecommendations = async () => {
    setLoading(true);
    const energyState = await computeEnergyState();
    const recs = await generateRecommendations(energyState);
    
    console.log('🎯 Daily Ritual Recommendations:', {
      practices: recs.practices.map(p => p.title),
      recommendedCount: recs.recommendedCount,
      actualCount: recs.practices.length
    });
    
    setRecommendations(recs);
    setRitualStatus(prev => ({
      ...prev,
      totalCount: recs.recommendedCount
    }));
    setLoading(false);
  };

  const handleFeedback = async (contentId: string, feedbackType: 'thumbs_up' | 'thumbs_down') => {
    if (!user?.id || feedback[contentId]) return;

    setFeedback(prev => ({ ...prev, [contentId]: feedbackType }));

    const practice = recommendations.practices.find(p => p.id === contentId);
    if (!practice) return;

    await submitRelevanceFeedback({
      contentId,
      contentType: practice.contentType,
      feedbackType,
      triggerContext: 'daily_ritual_recommendation',
      contextData: {
        energyState: 'computed',
        recommendationReasoning: recommendations.reasoning
      }
    });

    toast({
      title: "Thank you!",
      description: "Your feedback helps us improve recommendations",
      duration: 2000
    });
  };

  const navigateToPractice = (practice: Recommendation) => {
    const baseRoute = practice.contentType === 'soundbath' 
      ? '/soundscapes'
      : practice.contentType === 'guided-practice'
      ? '/guided-practices'
      : '/micro-practice';
    
    navigate(`${baseRoute}/${practice.id}`, { 
      state: { 
        category: practice.category,
        fromRitual: true 
      } 
    });
  };

  const handleStartRitual = async () => {
    const practices = recommendations.practices;
    if (practices.length === 0) return;

    localStorage.setItem('practice_queue', JSON.stringify(practices.map(r => ({
      id: r.id,
      title: r.title,
      type: r.contentType,
      category: r.category
    }))));
    localStorage.setItem('queue_index', '0');
    localStorage.setItem('ritual_mode', 'true');

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_ritual_completions')
        .upsert({
          user_id: user.id,
          ritual_date: today,
          completion_status: 'partial',
          recommended_practices_count: recommendations.recommendedCount,
          recommended_practice_ids: practices.map(r => r.id),
          completed_practice_ids: []
        }, {
          onConflict: 'user_id,ritual_date'
        });
    }

    navigateToPractice(practices[0]);
  };

  const handleContinueRitual = async () => {
    const queue = localStorage.getItem('practice_queue');
    if (!queue) {
      handleStartRitual();
      return;
    }

    const queueData = JSON.parse(queue);
    const currentIndex = parseInt(localStorage.getItem('queue_index') || '0');
    
    if (currentIndex < queueData.length) {
      const nextPractice = queueData[currentIndex];
      const practice = recommendations.practices.find(p => p.id === nextPractice.id);
      if (practice) {
        navigateToPractice(practice);
      }
    } else {
      handleStartRitual();
    }
  };

  const handleRestartRitual = async () => {
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('daily_ritual_completions')
        .delete()
        .eq('user_id', user.id)
        .eq('ritual_date', today);
    }
    
    localStorage.removeItem('practice_queue');
    localStorage.removeItem('queue_index');
    localStorage.removeItem('ritual_mode');
    
    setRitualStatus({
      status: 'not_started',
      completedCount: 0,
      totalCount: recommendations.recommendedCount
    });
    await loadRecommendations();
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="space-y-3">
          <div className="h-4 bg-muted animate-pulse rounded" />
          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
        </div>
      </Card>
    );
  }

  if (recommendations.practices.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Unable to generate recommendations. Please complete your daily check-in.
        </p>
      </Card>
    );
  }

  const practices = recommendations.practices;
  const totalDuration = practices.reduce((sum, rec) => sum + rec.duration, 0);

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-foreground">Today's Ritual</h3>
            <Badge variant="secondary">
              {Math.floor(totalDuration / 60)} min
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{recommendations.reasoning}</p>
          {ritualStatus.totalCount > 0 && (
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                {ritualStatus.completedCount} of {ritualStatus.totalCount} completed
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {practices.map((practice, index) => (
            <div
              key={practice.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground text-sm">{practice.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{practice.whyNow}</p>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {practice.duration} min
                  </Badge>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleFeedback(practice.id, 'thumbs_up')}
                    disabled={!!feedback[practice.id]}
                    className="h-7 text-xs"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleFeedback(practice.id, 'thumbs_down')}
                    disabled={!!feedback[practice.id]}
                    className="h-7 text-xs"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {ritualStatus.status === 'completed' ? (
            <Button 
              className="w-full" 
              disabled
              variant="outline"
            >
              <Clock className="mr-2 h-4 w-4" />
              Today's Ritual Completed ✓
            </Button>
          ) : ritualStatus.status === 'partial' ? (
            <>
              <Button 
                className="w-full"
                onClick={handleContinueRitual}
              >
                Continue Your Ritual
                <ArrowDown className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={handleRestartRitual}
              >
                <RotateCcw className="mr-2 h-3 w-3" />
                Restart Ritual
              </Button>
            </>
          ) : (
            <Button 
              className="w-full"
              onClick={handleStartRitual}
            >
              Start Your Ritual
              <ArrowDown className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default DailyRitual;
