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
    <div className="flex items-center gap-2">
      {/* Label — left of button (mobile) */}
      <div className="flex flex-col items-end sm:hidden">
        {surfaceHint ? (
          <span className="bg-saffron/80 backdrop-blur-sm text-white text-[10px] font-medium font-body rounded-full px-2.5 py-0.5 text-right max-w-[100px] leading-tight animate-pulse">
            {surfaceHint}
          </span>
        ) : (
          <span className="bg-black/50 backdrop-blur-sm text-white text-[11px] font-medium font-body rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-saffron animate-pulse" />
            Prepare me
          </span>
        )}
      </div>

      {/* Desktop: surfaceHint badge left of button */}
      {surfaceHint && (
        <span className="hidden sm:flex items-center bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium font-body rounded-full px-2.5 py-0.5 max-w-[100px] leading-tight animate-pulse">
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
