import { ArrowLeft, Download, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SimulationHeaderProps {
  contextType?: string;
  sessionDuration?: string;
  onDownload: () => void;
  onScheduleFollowup?: () => void;
}

const SimulationHeader = ({ contextType, sessionDuration, onDownload, onScheduleFollowup }: SimulationHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between p-6 border-b border-border/10 bg-gradient-to-b from-background to-background/50 backdrop-blur-sm">
      <button
        onClick={() => navigate("/practice/simulation")}
        className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
      >
        <ArrowLeft size={18} className="text-foreground" />
      </button>
      <div className="flex-1 text-center">
        <h1 className="text-3xl font-heading font-medium text-foreground mb-1">
          Dialogue Debrief
        </h1>
        <p className="text-sm text-muted-foreground font-body">
          Curated reflection from your dialogue practice where insight meets mastery
        </p>
      </div>
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                onClick={onDownload}
                variant="ghost"
                size="icon"
                className="text-forest hover:text-forest/80 hover:bg-forest/10"
              >
                <Download size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Export PDF</p>
            </TooltipContent>
          </Tooltip>
          
          {onScheduleFollowup && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  onClick={onScheduleFollowup}
                  variant="ghost"
                  size="icon"
                  className="text-forest hover:text-forest/80 hover:bg-forest/10"
                >
                  <Calendar size={20} />
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
  );
};

export default SimulationHeader;