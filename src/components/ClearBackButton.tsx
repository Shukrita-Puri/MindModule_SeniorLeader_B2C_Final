import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ClearBackButton = () => {
  const navigate = useNavigate();

  return (
    <div className="fixed top-4 left-4 z-50">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="bg-background/80 backdrop-blur-sm border border-border shadow-lg hover:bg-background/90"
      >
        <ArrowLeft size={16} />
      </Button>
    </div>
  );
};

export default ClearBackButton;