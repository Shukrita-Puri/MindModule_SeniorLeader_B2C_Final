import { useNavigate } from 'react-router-dom';
import { Brain } from 'lucide-react';
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
          className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
        >
          <Brain className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Self Mastery Coach</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default CoachAccessButton;
