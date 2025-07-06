import { ArrowLeft, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface SimulationHeaderProps {
  contextType?: string;
  sessionDuration?: string;
  onDownload: () => void;
}

const SimulationHeader = ({ contextType, sessionDuration, onDownload }: SimulationHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between p-6 border-b border-border">
      <button
        onClick={() => navigate("/simulation")}
        className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
      >
        <ArrowLeft size={18} className="text-foreground" />
      </button>
      <div className="flex-1 text-center">
        <h1 className="text-2xl font-heading font-medium text-foreground">
          Student Debrief
        </h1>
        <p className="text-sm text-muted-foreground">
          {contextType} · {sessionDuration}
        </p>
      </div>
      <Button 
        onClick={onDownload}
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
      >
        <Download size={16} />
        Export
      </Button>
    </div>
  );
};

export default SimulationHeader;