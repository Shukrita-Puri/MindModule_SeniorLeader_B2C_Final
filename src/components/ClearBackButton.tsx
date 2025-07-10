import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ClearBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // For sub-pages, navigate to their main page
    if (location.pathname.includes('/breathwork') || 
        location.pathname.includes('/power-up') || 
        location.pathname.includes('/emergency-reset') ||
        location.pathname.includes('/pause')) {
      navigate('/recalibrate');
    } else if (location.pathname.includes('/clarity')) {
      navigate('/inner-architect');
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="fixed top-4 left-4 z-50">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="bg-background/80 backdrop-blur-sm border border-border shadow-lg hover:bg-background/90"
      >
        <ArrowLeft size={16} />
      </Button>
    </div>
  );
};

export default ClearBackButton;