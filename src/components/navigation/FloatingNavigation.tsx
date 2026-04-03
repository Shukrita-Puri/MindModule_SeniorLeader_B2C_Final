import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ChatCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface FloatingNavigationProps {
  backPath?: string;
  showCoachButton?: boolean;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

const FloatingNavigation = ({
  backPath = '/executive-home',
  showCoachButton = true,
  centerContent,
  rightContent
}: FloatingNavigationProps) => {
  const navigate = useNavigate();

  return (
    <div className="relative z-40 flex items-center justify-between px-3 md:px-4 py-3">
      {/* Back Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(backPath)}
            className="h-10 w-10 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg shadow-black/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Go Back</p>
        </TooltipContent>
      </Tooltip>

      {/* Center Content (optional) */}
      {centerContent}

      {/* Right Side - Coach Button or Custom Content */}
      {rightContent ? rightContent : showCoachButton ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/coach', { state: { entryContext: { entryPoint: 'direct', lastAction: null, triggeredBy: null } } })}
              className="h-10 w-10 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg shadow-black/20"
            >
              <ChatCircle size={20} weight="duotone" className="text-saffron" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Mind Performance Coach</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="w-10" /> /* Spacer for alignment */
      )}
    </div>
  );
};

export default FloatingNavigation;