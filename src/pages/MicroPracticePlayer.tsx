import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles } from "lucide-react";
import TopNavigation from "@/components/simulation/TopNavigation";
import PracticeRatingModal from "@/components/PracticeRatingModal";
import { getAllContent } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { submitPracticeRating } from "@/utils/relevanceFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import useScrollToTop from "@/hooks/useScrollToTop";

const MicroPracticePlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromRitual = location.state?.fromRitual || false;
  useScrollToTop();
  const allContent = getAllContent();
  const practice = allContent.find(item => item.id === id && item.contentType === 'micro-practice');
  
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  // Track engagement on page load
  useEffect(() => {
    if (practice) {
      const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
      const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
      
      if (isPartOfRitual) {
        trackEngagement('daily_ritual_micro');
      } else if (practice.category === 'pause') {
        trackEngagement('pause_session');
      } else if (practice.category === 'power-up') {
        trackEngagement('renew_session');
      } else if (practice.category === 'presence' || practice.category === 'flow') {
        trackEngagement('flow_session');
      }
    }
  }, [practice, id]);

  if (!practice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Practice not found</p>
      </div>
    );
  }

  // Determine back path based on category and ritual context
  const backPath = fromRitual 
    ? '/executive-home'
    : (practice.category ? `/recalibrate/${practice.category}` : "/micro-practices");

  const handleComplete = async () => {
    if (!practice) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
      const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
      
      // Track practice session
      const { data, error } = await supabase.from('practice_sessions').insert({
        user_id: user.id,
        content_id: practice.id,
        content_type: 'micro',
        category: practice.category,
        duration_seconds: practice.duration * 60,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        completed: true,
        part_of_ritual: isPartOfRitual,
        metadata: { title: practice.title }
      }).select('id').single();

      if (data) {
        setSessionId(data.id);
      }

      // Update ritual completion if part of ritual
      if (isPartOfRitual) {
        const today = new Date().toISOString().split('T')[0];
        
        // First, get existing data to append to completed_practice_ids
        const { data: existingData } = await supabase
          .from('daily_ritual_completions')
          .select('completed_practice_ids, recommended_practices_count')
          .eq('user_id', user.id)
          .eq('ritual_date', today)
          .single();
        
        const existingIds = existingData?.completed_practice_ids || [];
        const newCompletedIds = existingIds.includes(id) ? existingIds : [...existingIds, id || ''];
        
        // Step 1: Upsert the specific completion field with completed_practice_ids
        await supabase
          .from('daily_ritual_completions')
          .upsert({
            user_id: user.id,
            ritual_date: today,
            micro_exercise_completed: true,
            micro_exercise_completed_at: new Date().toISOString(),
            completed_practice_ids: newCompletedIds
          }, {
            onConflict: 'user_id,ritual_date'
          });
        
        // Step 2: Query FRESH data AFTER the upsert
        const { data: freshRitualData } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', user.id)
          .eq('ritual_date', today)
          .single();
        
        // Step 3: Calculate completion using FRESH data
        if (freshRitualData) {
          const completed = [
            freshRitualData.soundscape_completed,
            freshRitualData.guided_practice_completed,
            freshRitualData.micro_exercise_completed
          ].filter(Boolean).length;
          
          const totalRecommended = freshRitualData.recommended_practices_count || 3;
          
          // Step 4: Update status atomically
          const newStatus = completed >= totalRecommended && completed > 0 
            ? 'full' 
            : completed > 0 
              ? 'partial' 
              : 'skipped';
          
          await supabase
            .from('daily_ritual_completions')
            .update({ completion_status: newStatus })
            .eq('user_id', user.id)
            .eq('ritual_date', today);
          
          console.log('🎯 Micro practice completed:', {
            type: 'micro-practice',
            completedCount: completed,
            totalRecommended,
            newStatus,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to save completion:', error);
    }
    
    // Show rating modal
    setShowRatingModal(true);
  };

  const handleRatingSubmit = async (rating: number, feedback?: string) => {
    if (practice) {
      await submitPracticeRating(sessionId, practice.id, 'micro-practice', rating, feedback);
      toast.success("Thank you for your feedback!");
    }
    setShowRatingModal(false);
    // Navigate back to executive home if from ritual, otherwise to category page
    const returnPath = fromRitual ? '/executive-home' : (practice.category ? `/recalibrate/${practice.category}` : '/recalibrate');
    navigate(returnPath);
  };

  const handleRatingSkip = () => {
    setShowRatingModal(false);
    // Navigate back to executive home if from ritual, otherwise to category page
    const returnPath = fromRitual ? '/executive-home' : (practice.category ? `/recalibrate/${practice.category}` : '/recalibrate');
    navigate(returnPath);
  };

  // Handle beginning practice - navigate to cards view for card-based practices
  const handleBeginPractice = () => {
    if (practice.steps) {
      // Card-based practice
      navigate(`/micro-practice/${id}/cards`);
    } else {
      // For non-card practices, mark complete directly
      handleComplete();
    }
  };

  if (showRatingModal && practice) {
    return (
      <PracticeRatingModal
        contentId={practice.id}
        contentType="micro-practice"
        contentTitle={practice.title}
        category={practice.category}
        sessionId={sessionId}
        onSubmit={handleRatingSubmit}
        onSkip={handleRatingSkip}
      />
    );
  }

  return (
    <div className="min-h-screen font-body pb-32">
      <TopNavigation backPath={backPath} />
      
      <div className="px-8 py-20 max-w-lg mx-auto">
        {/* Header with Hero Visual */}
        <div className="text-center mb-10">
          {/* Hero Visual */}
          <div className="w-full max-w-sm mx-auto mb-8 aspect-[4/3] rounded-2xl overflow-hidden shadow-lg">
            <img 
              src={practice.thumbnail} 
              alt={practice.title}
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(1.0) contrast(1.05) saturate(1.15)' }}
            />
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-headline font-medium text-foreground mb-3 leading-tight">
            {practice.title}
          </h2>
          
          {/* Subtitle - Essence */}
          <p className="text-muted-foreground font-body leading-relaxed italic">
            {practice.essence}
          </p>

          {/* Duration/Steps Badges */}
          <div className="flex items-center justify-center gap-4 mt-5">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm text-muted-foreground">
              <Clock size={14} /> {practice.duration} min
            </span>
            {practice.steps && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm text-muted-foreground">
                <Sparkles size={14} /> {practice.steps} Steps
              </span>
            )}
          </div>
        </div>

        {/* Best For & When to Use Sections */}
        <div className="space-y-6 text-left bg-card border border-border rounded-xl p-6 mb-8">
          {practice.storyHook && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Best For</h4>
              <p className="text-foreground leading-relaxed">
                {practice.storyHook}
              </p>
            </div>
          )}
          {practice.usedBy && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">When to Use</h4>
              <p className="text-foreground leading-relaxed">
                {practice.usedBy}
              </p>
            </div>
          )}
        </div>

        {/* Source Attribution */}
        {practice.origin && (
          <p className="text-xs text-muted-foreground text-center italic mb-8">
            {practice.origin}
          </p>
        )}

        {/* Begin Practice Button */}
        <Button 
          className="w-full rounded-xl py-6 text-base font-body"
          onClick={handleBeginPractice}
        >
          Begin Practice
        </Button>
        
        {/* Back to tools */}
        <div className="text-center mt-8">
          <Button 
            variant="ghost"
            onClick={() => navigate(backPath)}
            className="text-muted-foreground hover:text-foreground font-body"
          >
            Choose different tool
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MicroPracticePlayer;