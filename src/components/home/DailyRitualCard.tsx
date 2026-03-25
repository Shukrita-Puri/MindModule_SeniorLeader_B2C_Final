import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Target, Zap, Waves, Play } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { getRecommendedContent } from '@/utils/contentRecommendationEngine';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

const DailyRitualCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Get energy state
  const { data: energyState, isLoading } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: () => computeEnergyState(user?.id),
    enabled: !!user?.id,
  });
  
  if (isLoading || !energyState) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }
  
  const recommendation = energyState.recommendation;
  if (!recommendation) return null;
  
  // Get recommended content based on primary mastery type and subtype
  const recommendedContent = getRecommendedContent(
    recommendation.primary,
    recommendation.primarySubtype,
    3
  );
  
  // Icon based on primary mastery type
  const IconComponent = recommendation.primary === 'pause' ? Target : 
                        recommendation.primary === 'flow' ? Zap : Waves;
  
  // Title based on primary mastery type
  const masteryTitle = recommendation.primary === 'pause' ? 'Pause Mastery' :
                       recommendation.primary === 'flow' ? 'Flow Mastery' : 'Recharge Mastery';
  
  // Subtitle - capitalize first letter of each word in subtype
  const masterySubtitle = recommendation.primarySubtype
    ?.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || '';
  
  return (
    <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
      {/* Header: Primary Mastery Type */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <IconComponent size={24} className="text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-headline font-semibold text-foreground">
            {masteryTitle}
          </h3>
          <p className="text-sm text-muted-foreground">
            {masterySubtitle}
          </p>
        </div>
      </div>
      
      {/* Recommended Content */}
      <div className="space-y-2">
        {recommendedContent.length > 0 ? (
          recommendedContent.map((content) => (
            <button
              key={content.contentId}
              onClick={() => navigate(content.route)}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors border border-transparent hover:border-border group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Play size={14} className="text-primary ml-0.5" />
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {content.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs px-2 py-0">
                      {content.duration}m
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={`text-xs px-2 py-0 ${
                        content.intensity === 'gentle' ? 'border-green-500/30 text-green-600' :
                        content.intensity === 'moderate' ? 'border-blue-500/30 text-blue-600' :
                        'border-orange-500/30 text-orange-600'
                      }`}
                    >
                      {content.intensity}
                    </Badge>
                  </div>
                </div>
              </div>
              <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          ))
        ) : (
          <div className="text-center py-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/recalibrate')}
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              Explore Recalibrate
              <ArrowRight size={14} className="ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyRitualCard;
