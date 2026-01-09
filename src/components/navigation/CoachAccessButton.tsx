import { useNavigate } from 'react-router-dom';
import { ChatCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const CoachAccessButton = () => {
  const navigate = useNavigate();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/coach')}
          className="h-10 w-10 rounded-full text-saffron icon-luxury"
        >
          <ChatCircle size={20} weight="duotone" className="icon-duotone-luxury" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Self Mastery Coach</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default CoachAccessButton;
