import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import { getAllContent } from "@/data/practicesAndSoundscapes";
import { trackEngagement } from "@/utils/engagementTracking";
import { supabase } from "@/integrations/supabase/client";

const MicroPracticePlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const allContent = getAllContent();
  const practice = allContent.find(item => item.id === id && item.contentType === 'micro-practice');

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

  // Determine back path based on category
  const backPath = practice.category 
    ? `/recalibrate/${practice.category}` 
    : "/micro-practices";

  const handleComplete = async () => {
    if (!practice) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const practiceQueue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
      const isPartOfRitual = practiceQueue && practiceQueue.some((p: any) => p.id === id);
      
      // Track practice session
      await supabase.from('practice_sessions').insert({
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
      });

      // Update ritual completion if part of ritual
      if (isPartOfRitual) {
        const today = new Date().toISOString().split('T')[0];
        
        await supabase
          .from('daily_ritual_completions')
          .upsert({
            user_id: user.id,
            ritual_date: today,
            micro_exercise_completed: true,
            micro_exercise_completed_at: new Date().toISOString(),
            completion_status: 'partial'
          }, {
            onConflict: 'user_id,ritual_date'
          });
      }
    } catch (error) {
      console.error('Failed to save completion:', error);
    }
    
    navigate("/recalibrate");
  };

  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar backPath={backPath} />
      
      <div className="pt-20 px-6 max-w-4xl mx-auto pb-12">
        {/* Hero Image - FIXED OVERFLOW */}
        <div className="relative h-56 md:h-64 rounded-xl overflow-hidden mb-6 md:mb-8 bg-muted">
          <img 
            src={practice.thumbnail} 
            alt={practice.title}
            className="w-full h-full object-contain"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-mocha/80" />
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-cream">
                {practice.duration} min
              </span>
              {practice.subType && (
                <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-cream capitalize">
                  {practice.subType}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-serif text-cream mb-1 md:mb-2">{practice.title}</h1>
            <p className="text-cream/80 text-xs md:text-sm">{practice.creator}</p>
          </div>
        </div>

        {/* Origin Quote */}
        {practice.origin && (
          <Card className="mb-4 md:mb-6 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-4 md:pt-6">
              <p className="text-xs md:text-sm leading-relaxed italic text-foreground">{practice.origin}</p>
            </CardContent>
          </Card>
        )}

        {/* Essence, Parallel, Cue, Used For */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
          {practice.essence && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-4 md:pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Essence</h3>
                <p className="text-xs md:text-sm text-foreground">{practice.essence}</p>
              </CardContent>
            </Card>
          )}
          {practice.parallel && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-4 md:pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Parallel</h3>
                <p className="text-xs md:text-sm text-foreground">{practice.parallel}</p>
              </CardContent>
            </Card>
          )}
          {practice.cue && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-4 md:pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cue</h3>
                <p className="text-xs md:text-sm font-medium text-foreground">{practice.cue}</p>
              </CardContent>
            </Card>
          )}
          {practice.usedBy && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-4 md:pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Used For</h3>
                <p className="text-xs md:text-sm text-foreground">{practice.usedBy}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* What to Actually Do */}
        {practice.instructions && practice.instructions.length > 0 && (
          <Card className="mb-4 md:mb-6 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-4 md:pt-6 space-y-3 md:space-y-4">
              <h2 className="text-base md:text-lg font-semibold">What to Actually Do</h2>
              <ol className="space-y-3 md:space-y-4">
                {practice.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-2 md:gap-3">
                    <span className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs md:text-sm font-semibold">
                      {index + 1}
                    </span>
                    <p className="text-xs md:text-sm text-foreground pt-1">{instruction}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Real Examples */}
        {practice.realExamples && practice.realExamples.length > 0 && (
          <Card className="mb-4 md:mb-6 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-4 md:pt-6 space-y-4 md:space-y-6">
              <h2 className="text-base md:text-lg font-semibold">Real Examples</h2>
              {practice.realExamples.map((example, index) => (
                <div key={index} className="space-y-2 md:space-y-3 pb-4 md:pb-6 border-b last:border-b-0 last:pb-0">
                  <h3 className="text-xs md:text-sm font-semibold text-foreground">Scenario {index + 1}: {example.scenario}</h3>
                  <div className="space-y-1.5 md:space-y-2 pl-3 md:pl-4 border-l-2 border-muted">
                    <p className="text-xs md:text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">The trigger:</span> {example.trigger}
                    </p>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Use the space:</span> {example.response}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Why This Works */}
        {practice.whyThisWorks && (
          <Card className="mb-6 md:mb-8 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-4 md:pt-6">
              <h2 className="text-base md:text-lg font-semibold mb-2 md:mb-3">Why This Works</h2>
              <p className="text-xs md:text-sm leading-relaxed text-foreground">{practice.whyThisWorks}</p>
            </CardContent>
          </Card>
        )}

        {/* Complete Button */}
        <Button 
          onClick={handleComplete}
          className="w-full"
          size="lg"
        >
          <CheckCircle2 className="h-5 w-5 mr-2" />
          Mark Complete
        </Button>
      </div>
    </div>
  );
};

export default MicroPracticePlayer;
