import { useNavigate } from 'react-router-dom';
import { ChatCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface CoachAccessButtonProps {
  surfaceHint?: string;
}

const CoachAccessButton = ({ surfaceHint }: CoachAccessButtonProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-1.5">
      {/* Label — left of button */}
      <div className="flex flex-col items-end sm:hidden">
        {surfaceHint ? (
          <span className="text-[9px] text-saffron/80 font-body text-right max-w-[80px] leading-tight animate-pulse">
            {surfaceHint}
          </span>
        ) : (
          <span className="text-[10px] text-saffron font-body text-right leading-tight">
            Prepare me
          </span>
        )}
      </div>

      {/* Desktop: surfaceHint badge left of button */}
      {surfaceHint && (
        <span className="hidden sm:block text-[9px] text-saffron/80 font-body text-right max-w-[72px] leading-tight animate-pulse">
          {surfaceHint}
        </span>
      )}

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
        <TooltipContent side="left" className="hidden sm:block">
          <p>Mind Performance Coach</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default CoachAccessButton;
