import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowDown, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { trackEngagement } from '@/utils/engagementTracking';
import { submitRelevanceFeedback } from '@/utils/relevanceFeedback';
import { useToast } from '@/hooks/use-toast';
import { useMentalFitnessTracking } from '@/hooks/useMentalFitnessTracking';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const DailyRitual = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { updateRitualCompletion, trackEngagement } = useMentalFitnessTracking();
  const [recommendations, setRecommendations] = useState<{
    soundbath: Recommendation | null;
    guidedPractice: Recommendation | null;
    microPractice: Recommendation | null;
    reasoning: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, 'thumbs_up' | 'thumbs_down' | null>>({});
  const [ritualStatus, setRitualStatus] = useState<{
    status: 'not_started' | 'partial' | 'completed';
    completedCount: number;
    totalCount: number;
  }>({
    status: 'not_started',
    completedCount: 0,
    totalCount: 3
  });

  useEffect(() => {
    loadRecommendations();
    checkRitualCompletion();
    
    // Poll for completion updates every 15 seconds
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
      // No ritual record - not started
      const actualCount = recommendations ? [
        recommendations.soundbath,
        recommendations.guidedPractice,
        recommendations.microPractice
      ].filter(Boolean).length : 3;
      setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: actualCount });
      return;
    }
    
    // Count actual completions
    const completed = [
      data.soundscape_completed,
      data.guided_practice_completed,
      data.micro_exercise_completed
    ].filter(Boolean).length;
    
    const totalRecommended = data.recommended_practices_count || 3;
    
    // Calculate status based on BOTH completion_status field AND actual count
    let status: 'not_started' | 'partial' | 'completed' = 'not_started';
    
    // Trust the database completion_status as primary source
    if (data.completion_status === 'full') {
      status = 'completed';
    } else if (completed === totalRecommended && completed > 0) {
      // Double-check: if actual count equals total, should be complete
      status = 'completed';
      
      // Fix inconsistent state in database
      console.log('🔧 Fixing inconsistent ritual status:', {
        completedCount: completed,
        totalRecommended,
        currentStatus: data.completion_status,
        fixingTo: 'full'
      });
      
      await supabase
        .from('daily_ritual_completions')
        .update({ completion_status: 'full' })
        .eq('user_id', user.id)
        .eq('ritual_date', today);
    } else if (completed > 0) {
      status = 'partial';
    }
    
    setRitualStatus({
      status,
      completedCount: completed,
      totalCount: totalRecommended
    });
  };

  const loadRecommendations = async () => {
    setLoading(true);
    const energyState = await computeEnergyState();
    const recs = await generateRecommendations(energyState);
    
    console.log('🎯 Daily Ritual Recommendations:', {
      soundbath: recs.soundbath?.title || 'NULL',
      guidedPractice: recs.guidedPractice?.title || 'NULL',
      microPractice: recs.microPractice?.title || 'NULL',
      totalRecommended: [recs.soundbath, recs.guidedPractice, recs.microPractice].filter(Boolean).length
    });
    
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

  const navigateToPractice = (practice: Recommendation) => {
    if (practice.contentType === 'soundbath') {
      navigate(`/soundscapes/${practice.id}`, { state: { category: practice.category } });
    } else if (practice.contentType === 'guided-practice') {
      navigate(`/guided-practices/${practice.id}`, { state: { category: practice.category } });
    } else if (practice.contentType === 'micro-practice') {
      navigate(`/micro-practice/${practice.id}`, { state: { category: practice.category } });
    }
  };

  const handleStartRitual = async () => {
    await trackEngagement({ event_type: 'ritual_start', category: 'general' });
    
    // Store ritual queue in localStorage for UI continuity
    localStorage.setItem('practiceQueue', JSON.stringify(allRecs));
    
    // Initialize ritual in database with actual count
    if (user?.id) {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('daily_ritual_completions').upsert({
        user_id: user.id,
        ritual_date: today,
        completion_status: 'partial',
        recommended_practices_count: allRecs.length
      });
    }
    
    // Navigate to first practice
    if (allRecs[0]) {
      navigateToPractice(allRecs[0]);
    }
  };

  const handleContinueRitual = async () => {
    await trackEngagement({ event_type: 'session_start', category: 'general', metadata: { action: 'continue' } });
    
    if (!user?.id) return;
    
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('daily_ritual_completions')
      .select('*')
      .eq('user_id', user.id)
      .eq('ritual_date', today)
      .single();
    
    if (!data) {
      handleStartRitual();
      return;
    }
    
    // Build completion map based on ACTUAL recommendations
    const completionMap = [];
    
    if (recommendations?.soundbath) {
      completionMap.push({ 
        completed: data.soundscape_completed, 
        practice: recommendations.soundbath 
      });
    }
    
    if (recommendations?.guidedPractice) {
      completionMap.push({ 
        completed: data.guided_practice_completed, 
        practice: recommendations.guidedPractice 
      });
    }
    
    if (recommendations?.microPractice) {
      completionMap.push({ 
        completed: data.micro_exercise_completed, 
        practice: recommendations.microPractice 
      });
    }
    
    const nextPractice = completionMap.find(item => !item.completed);
    
    if (nextPractice) {
      navigateToPractice(nextPractice.practice);
    } else {
      // All practices completed, refresh status
      await checkRitualCompletion();
    }
  };

  const handleRestartRitual = async () => {
    await trackEngagement({ event_type: 'session_start', category: 'general', metadata: { action: 'restart' } });
    
    // Reset completion in database
    if (user?.id) {
      await updateRitualCompletion({
        ritual_date: new Date(),
        completion_status: 'skipped',
        soundscape_completed: false,
        guided_practice_completed: false,
        micro_exercise_completed: false
      });
    }
    
    // Clear localStorage queue
    localStorage.removeItem('practiceQueue');
    
    // Refresh and start from beginning
    await loadRecommendations();
    await checkRitualCompletion();
    
    toast({
      description: "Ritual reset. Ready to start fresh!",
      duration: 2000,
    });
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

      {/* Button States: Start / Continue+Restart / Completed */}
      {ritualStatus.status === 'completed' ? (
        <Button
          disabled
          className="w-full bg-emerald-600/50 text-white cursor-default"
        >
          ✓ Today's Ritual Completed
        </Button>
      ) : ritualStatus.status === 'partial' && ritualStatus.completedCount > 0 ? (
        <div className="flex gap-2">
          <Button
            onClick={handleContinueRitual}
            className="flex-1 bg-gradient-to-r from-taupe via-taupe-highlight to-taupe hover:opacity-90 text-white"
          >
            Continue Your Ritual →
          </Button>
          <Button
            onClick={handleRestartRitual}
            variant="outline"
            size="icon"
            className="w-12 h-12 rounded-full border-2 border-taupe hover:bg-taupe/10"
            aria-label="Restart ritual"
          >
            <RotateCcw className="w-5 h-5 text-taupe" />
          </Button>
        </div>
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
