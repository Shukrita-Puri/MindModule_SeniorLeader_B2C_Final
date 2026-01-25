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
  className
}: ProtocolCardProps) => {
  const navigate = useNavigate();
  const route = getRouteForContentType(contentType, id);

  const handleStart = () => {
    navigate(route);
  };

  return (
    <div
      className={cn(
        "relative flex h-36 overflow-hidden rounded-xl",
        "bg-white/65 dark:bg-black/20 backdrop-blur-[20px]",
        "border border-black/[0.06] dark:border-white/10",
        "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
        "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]",
        "transition-all duration-300",
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
            <span className="text-[10px] font-semibold tracking-wider uppercase text-saffron">
              {getModuleLabel(type)}
            </span>
            <span className="text-[9px] text-muted-foreground/60">
              {getProtocolTypeLabel(type)}
            </span>
          </div>
          
          {/* Title */}
          <h4 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
            {title}
          </h4>
          
          {/* Story Hook (optional) */}
          {storyHook && (
            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-1">
              {storyHook}
            </p>
          )}
        </div>
        
        {/* Footer: Duration + Start Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
