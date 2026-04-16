import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Play, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type ProtocolType = 'somatic' | 'mindset';
export type ContentTypeRoute = 'soundbath' | 'guided-practice' | 'micro-practice';

export interface ProtocolCardProps {
  id: string;
  type: ProtocolType;
  title: string;
  duration: number; // in minutes
  thumbnail: string;
  contentType: ContentTypeRoute;
  storyHook?: string;
  className?: string;
  variant?: 'default' | 'onDark';
}

const getRouteForContentType = (contentType: ContentTypeRoute, id: string): string => {
  switch (contentType) {
    case 'soundbath':
      return `/soundscapes/${id}`;
    case 'guided-practice':
      return `/guided-practices/${id}`;
    case 'micro-practice':
      return `/micro-practice/${id}/cards`;
    default:
      return `/micro-practice/${id}/cards`;
  }
};

const getModuleLabel = (type: ProtocolType): string => {
  return type === 'somatic' ? 'REGULATE' : 'REFRAME';
};

const getProtocolTypeLabel = (type: ProtocolType): string => {
  return type === 'somatic' ? 'Somatic Protocol' : 'Mindset Protocol';
};

export const ProtocolCard = ({
  id,
  type,
  title,
  duration,
  thumbnail,
  contentType,
  storyHook,
  className,
  variant = 'default'
}: ProtocolCardProps) => {
  const navigate = useNavigate();
  const route = getRouteForContentType(contentType, id);

  const handleStart = () => {
    // Check if we're in a coach conversation - get session ID from sessionStorage
    const coachSessionId = sessionStorage.getItem('coachSessionId');
    
    // Save current coach state before navigating for session continuity
    if (coachSessionId) {
      sessionStorage.setItem('returnToCoach', 'true');
      sessionStorage.setItem('returnCoachSessionId', coachSessionId);
    }
    
    navigate(route, {
      state: {
        fromCoach: !!coachSessionId,
        coachSessionId: coachSessionId || undefined
      }
    });
  };

  const isOnDark = variant === 'onDark';

  return (
    <div
      className={cn(
        "relative flex h-36 overflow-hidden rounded-xl",
        "transition-all duration-300",
        isOnDark
          ? "bg-white/90 backdrop-blur-sm border border-white/30 shadow-lg"
          : "bg-white/65 dark:bg-black/20 backdrop-blur-[20px] border border-black/[0.06] dark:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]",
        className
      )}
    >
      {/* Thumbnail */}
      <div 
        className="w-28 h-full flex-shrink-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${thumbnail}')` }}
      />
      
      {/* Content */}
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div>
          {/* Module Label + Protocol Type */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn(
              "text-xs font-semibold tracking-wider uppercase",
              isOnDark ? "text-saffron" : "text-saffron"
            )}>
              {getModuleLabel(type)}
            </span>
            <span className={cn(
              "text-xs",
              isOnDark ? "text-muted-foreground/80" : "text-muted-foreground/60"
            )}>
              {getProtocolTypeLabel(type)}
            </span>
          </div>
          
          {/* Title */}
          <h4 className={cn(
            "text-sm font-semibold line-clamp-2 leading-snug",
            isOnDark ? "text-foreground" : "text-foreground"
          )}>
            {title}
          </h4>
          
          {/* Story Hook (optional) */}
          {storyHook && (
            <p className={cn(
              "text-xs line-clamp-1 mt-1",
              isOnDark ? "text-muted-foreground/90" : "text-muted-foreground"
            )}>
              {storyHook}
            </p>
          )}
        </div>
        
        {/* Footer: Duration + Start Button */}
        <div className="flex items-center justify-between">
          <div className={cn(
            "flex items-center gap-1 text-xs",
            isOnDark ? "text-muted-foreground" : "text-muted-foreground"
          )}>
            <Clock className="w-3 h-3" />
            <span>{duration < 1 ? `${Math.round(duration * 60)}s` : `${Math.round(duration)} min`}</span>
          </div>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={handleStart}
            className="h-7 px-3 text-xs font-medium text-saffron hover:text-saffron hover:bg-saffron/10"
          >
            <Play className="w-3 h-3 mr-1 fill-current" />
            Start
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProtocolCard;
