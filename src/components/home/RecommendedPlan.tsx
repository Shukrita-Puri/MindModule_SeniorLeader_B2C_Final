import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Sparkles } from 'lucide-react';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';

const RecommendedPlan = () => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<{
    practices: Recommendation[];
    recommendedCount: number;
    reasoning: string;
  }>({ practices: [], recommendedCount: 0, reasoning: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    setLoading(true);
    const energyState = await computeEnergyState();
    const recs = await generateRecommendations(energyState);
    setRecommendations(recs);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground animate-pulse">
          Analyzing your energy state...
        </p>
      </div>
    );
  }

  if (recommendations.practices.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Complete your daily check-in to see personalized recommendations.
        </p>
      </div>
    );
  }

  const handleItemClick = (rec: Recommendation) => {
    if (rec.contentType === 'soundbath') {
      navigate(`/soundscapes/${rec.id}`, { state: { category: rec.category } });
    } else if (rec.contentType === 'guided-practice') {
      navigate(`/guided-practices/${rec.id}`, { state: { category: rec.category } });
    } else if (rec.contentType === 'micro-practice') {
      navigate(`/micro-practice/${rec.id}`, { state: { category: rec.category } });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
        <Sparkles className="w-4 h-4 text-saffron flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">{recommendations.reasoning}</p>
      </div>

      <div className="space-y-3">
        {recommendations.practices.map((rec) => (
          <Card
            key={rec.id}
            className="cursor-pointer group hover:bg-card/50 transition-all"
            onClick={() => handleItemClick(rec)}
          >
            <div className="flex items-center gap-3 p-4">
              <div
                className="w-16 h-16 rounded-lg bg-cover bg-center flex-shrink-0"
                style={{ backgroundImage: `url('${rec.thumbnail}')` }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-foreground line-clamp-1">
                    {rec.title}
                  </h4>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {rec.contentType === 'soundbath' ? 'Soundbath' : rec.contentType === 'guided-practice' ? 'Practice' : 'Micro'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">
                  {rec.whyNow}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{rec.duration} min</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-saffron hover:text-saffron"
        onClick={() => navigate('/recalibrate')}
      >
        View All Sanctuary Content →
      </Button>
    </div>
  );
};

export default RecommendedPlan;
