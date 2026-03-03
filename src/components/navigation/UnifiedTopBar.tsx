import { ArrowLeft } from "lucide-react";
import { ChatCircle } from "@phosphor-icons/react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UnifiedTopBarProps {
  backPath?: string;
  onBack?: () => void;
}

const UnifiedTopBar = ({ backPath, onBack }: UnifiedTopBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isCoachPage = location.pathname === '/coach';

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 safe-area-top bg-white/85 backdrop-blur-[30px] border-b border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: Back Button */}
        <Button variant="glass" size="sm" onClick={handleBack}>
          <ArrowLeft size={20} />
        </Button>

        {/* Right: Coach Button (hidden on coach page) */}
        {!isCoachPage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="glass" 
                size="sm" 
                onClick={() => navigate('/coach')}
              >
                <ChatCircle size={20} weight="duotone" className="icon-duotone-luxury text-saffron" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Inner Mastery Coach</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default UnifiedTopBar;
