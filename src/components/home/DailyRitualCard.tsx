import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Target, Zap, Waves } from 'lucide-react';
import { getDailyRitualRecommendation } from '@/utils/intelligenceEngine';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { useAuth } from '@/hooks/useAuth';

const DailyRitualCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Get energy state
  const { data: energyState } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: () => computeEnergyState(user?.id),
    enabled: !!user?.id,
  });
  
  const ritual = getDailyRitualRecommendation(energyState);
  
  const IconComponent = ritual.icon === 'Target' ? Target : 
                        ritual.icon === 'Zap' ? Zap : Waves;
  
  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <IconComponent size={20} className="text-primary" />
        </div>
        
        {/* Content */}
        <div className="flex-1">
          <h3 className="text-base font-headline font-medium text-foreground mb-1">
            {ritual.title}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {ritual.subtitle}
          </p>
          
          {/* Action Button */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate(ritual.route)}
            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground w-full"
          >
            {ritual.ctaLabel}
            <ArrowRight size={14} className="ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DailyRitualCard;
