import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ClearBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  const handleBack = () => {
    // For flow state lab, handle step-by-step navigation
    if (location.pathname === '/flow-state-lab') {
      const urlParams = new URLSearchParams(location.search);
      const currentStep = urlParams.get('step') || 'hero';
      const stepOrder = ['hero', 'choose-task', 'add-context', 'choose-duration', 'technique-matched', 'session-setup', 'session-active', 'session-complete', 'flow-log'];
      const currentIndex = stepOrder.indexOf(currentStep);
      
      if (currentIndex > 0) {
        setSearchParams({ step: stepOrder[currentIndex - 1] });
      } else {
        navigate('/inner-architect');
      }
    }
    // For flow session pages, handle step-by-step navigation
    else if (location.pathname === '/flow-session') {
      const urlParams = new URLSearchParams(location.search);
      const currentStep = parseInt(urlParams.get('step') || '1');
      
      if (currentStep === 1) {
        navigate('/flow-state-lab');
      } else {
        setSearchParams({ step: (currentStep - 1).toString() });
      }
    }
    // For recalibrate sub-pages, navigate to main recalibrate page
    else if (location.pathname.startsWith('/recalibrate/')) {
      navigate('/recalibrate');
    }
    // For main recalibrate page, navigate to inner-architect
    else if (location.pathname === '/recalibrate') {
      navigate('/inner-architect');
    }
    // For clarity sub-pages, navigate to main clarity page
    else if (location.pathname.startsWith('/clarity/')) {
      navigate('/clarity');
    }
    // For older path patterns (backwards compatibility)
    else if (location.pathname.includes('/breathwork') || 
        location.pathname.includes('/power-up') || 
        location.pathname.includes('/emergency-reset') ||
        location.pathname.includes('/pause')) {
      navigate('/inner-architect');
    } else if (location.pathname.includes('/clarity')) {
      navigate('/clarity');
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