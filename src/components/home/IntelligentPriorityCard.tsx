import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, BookOpen, Target, MessageSquare, Calendar } from 'lucide-react';

interface IntelligentPriority {
  title: string;
  subtitle?: string;
  icon: string;
  route: string;
  whyThisMatters: string;
  ctaLabel: string;
  timeHorizon?: string;
}

interface Props {
  priority: IntelligentPriority;
}

const IntelligentPriorityCard = ({ priority }: Props) => {
  const navigate = useNavigate();
  
  const IconComponent = priority.icon === 'BookOpen' ? BookOpen : 
                        priority.icon === 'Target' ? Target : MessageSquare;
  
  return (
    <div className="bg-card border border-gold/10 rounded-lg p-4 shadow-sm hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <IconComponent size={18} className="text-primary" />
        </div>
        
        <div className="flex-1">
          <h3 className="text-[15px] font-editorial font-medium text-foreground mb-1">
            {priority.title}
          </h3>
          
          {priority.subtitle && (
            <p className="text-xs text-muted-foreground mb-2">
              {priority.subtitle}
            </p>
          )}
          
          {priority.timeHorizon && (
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              <Calendar size={10} className="mr-1" />
              {priority.timeHorizon}
            </Badge>
          )}
        </div>
      </div>
      
      {/* Why This Matters */}
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
          Why This Matters
        </p>
        <p className="text-sm font-body leading-relaxed text-foreground/90">
          {priority.whyThisMatters}
        </p>
      </div>
      
      {/* Action Button */}
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => navigate(priority.route)}
        className="border-primary text-primary hover:bg-primary hover:text-primary-foreground w-full"
      >
        {priority.ctaLabel}
        <ArrowRight size={14} className="ml-2" />
      </Button>
    </div>
  );
};

export default IntelligentPriorityCard;
