import { Download, Calendar, Save, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SimulationHeaderProps {
  contextType?: string;
  sessionDuration?: number;
  onDownload: () => void;
  onScheduleFollowup?: () => void;
  onSaveToArchive?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
}

const SimulationHeader = ({ 
  contextType, 
  sessionDuration, 
  onDownload, 
  onScheduleFollowup,
  onSaveToArchive,
  isSaving,
  isSaved
}: SimulationHeaderProps) => {
  return (
    <div className="px-6 md:px-8 pt-24 pb-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-xl md:text-2xl font-heading font-medium text-foreground mb-4">
            Dialogue Debrief
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground font-body leading-relaxed mx-auto mb-6 px-4">
            Curated reflection from your practice session—highlighting strengths, blind spots, and frameworks to accelerate your growth
          </p>
          
          <TooltipProvider>
            <div className="flex items-center justify-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={onDownload}
                    className="hover:bg-gold/10 rounded-full bg-gold/10 shadow-md"
                  >
                    <Download size={20} strokeWidth={3} className="text-forest" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export Full PDF</p>
                </TooltipContent>
              </Tooltip>

              {onSaveToArchive && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={onSaveToArchive}
                      disabled={isSaving || isSaved}
                      className="hover:bg-gold/10 rounded-full bg-gold/10 shadow-md"
                    >
                      {isSaving ? (
                        <Loader2 size={20} strokeWidth={3} className="text-forest animate-spin" />
                      ) : isSaved ? (
                        <Check size={20} strokeWidth={3} className="text-forest" />
                      ) : (
                        <Save size={20} strokeWidth={3} className="text-forest" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isSaved ? 'Saved to Archive' : 'Save to Archive'}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {onScheduleFollowup && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={onScheduleFollowup}
                      className="hover:bg-gold/10 rounded-full bg-gold/10 shadow-md"
                    >
                      <Calendar size={20} strokeWidth={3} className="text-forest" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Schedule Follow-up</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default SimulationHeader;