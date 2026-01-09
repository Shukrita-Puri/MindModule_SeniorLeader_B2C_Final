import { ArrowLeft } from "lucide-react";
import { ChatCircle } from "@phosphor-icons/react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TopNavigationProps {
  backPath?: string;
  transparent?: boolean;
}

const TopNavigation = ({ backPath, transparent = false }: TopNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isCoachPage = location.pathname === '/coach';

  const handleBack = () => {
    if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${transparent ? 'bg-gradient-to-b from-black/60 to-transparent backdrop-blur-md border-b border-white/10' : 'bg-background/80 backdrop-blur-sm border-b border-gold/20'} shadow-sm`}>
      <div className="flex items-center justify-between px-5 md:px-8 py-2">
        {/* Left: Back Arrow */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className={transparent ? "hover:bg-white/10" : "hover:bg-muted/50"}
        >
          <ArrowLeft size={20} className={transparent ? "text-white" : "text-foreground"} />
        </Button>

        {/* Right: Coach Button (hidden on coach page) */}
        {!isCoachPage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/coach')}
                className={transparent ? "hover:bg-white/10" : "hover:bg-muted/50"}
              >
                <ChatCircle 
                  size={20} 
                  weight="duotone" 
                  className="icon-duotone-luxury text-saffron"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Self Mastery Coach</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default TopNavigation;
