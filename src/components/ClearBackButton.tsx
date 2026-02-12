import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ClearBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  const handleBack = () => {
    // For recalibrate sub-pages, navigate to main recalibrate page
    if (location.pathname.startsWith('/recalibrate/')) {
      navigate('/recalibrate');
    }
    // For main recalibrate page, navigate to executive-home
    else if (location.pathname === '/recalibrate') {
      navigate('/executive-home');
    }
    else {
      navigate(-1);
    }
  };

  return (
    <div className="fixed left-4 z-50" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
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