import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import { useSavedDebriefs } from "@/hooks/useSavedDebriefs";
import { Loader2, FileText, Trash2, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PracticeHistory = () => {
  const navigate = useNavigate();
  const { savedDebriefs, isLoading, fetchSavedDebriefs, deleteDebrief } = useSavedDebriefs();

  useEffect(() => {
    fetchSavedDebriefs();
  }, [fetchSavedDebriefs]);

  const handleDelete = async (id: string) => {
    try {
      await deleteDebrief(id);
      toast.success("Debrief deleted");
    } catch {
      toast.error("Failed to delete debrief");
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  return (
    <div className="relative flex min-h-screen flex-col font-editorial pb-20">
      <TopNavigation backPath="/practice" />
      
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 md:px-8 py-8 space-y-6 max-w-5xl mx-auto">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground">
              Practice History
            </h1>
            <p className="text-muted-foreground">
              Review your saved dialogue sessions and track your progress
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-forest" />
            </div>
          ) : savedDebriefs.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50" />
              <div>
                <p className="text-muted-foreground">No saved sessions yet</p>
                <p className="text-sm text-muted-foreground/70">
                  Complete a dialogue session and save it to see it here
                </p>
              </div>
              <Button onClick={() => navigate('/practice')}>
                Start a Practice Session
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {savedDebriefs.map(debrief => (
                <div 
                  key={debrief.id}
                  className="bg-muted/30 rounded-xl p-4 space-y-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {debrief.title || 'Untitled Session'}
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(debrief.created_at).toLocaleDateString()}
                        </span>
                        {debrief.duration_seconds && (
                          <span className="flex items-center gap-1">
                            <Clock size={14} />
                            {formatDuration(debrief.duration_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(debrief.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>

                  {/* Quick stats */}
                  <div className="flex flex-wrap gap-2">
                    {debrief.strengths.length > 0 && (
                      <span className="text-xs bg-forest/10 text-forest px-2 py-1 rounded-full">
                        {debrief.strengths.length} strength{debrief.strengths.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {debrief.development_areas.length > 0 && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-full">
                        {debrief.development_areas.length} development area{debrief.development_areas.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {debrief.frameworks_used.length > 0 && (
                      <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-1 rounded-full">
                        {debrief.frameworks_used.length} framework{debrief.frameworks_used.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Scenario info */}
                  {debrief.scenario_domain && (
                    <p className="text-sm text-muted-foreground">
                      {debrief.scenario_domain}
                      {debrief.persona_type && ` • with ${debrief.persona_type}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PrivacyFooter />
      <MainNavigation />
    </div>
  );
};

export default PracticeHistory;
