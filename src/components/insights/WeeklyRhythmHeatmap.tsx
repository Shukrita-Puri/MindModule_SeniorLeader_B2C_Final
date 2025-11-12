import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { getWeeklyRitualCompletion, generateWeeklyInsight } from '@/utils/engagementTracking';

type WeeklyData = Array<{
  day: string;
  date: string;
  status: 'full' | 'partial' | 'skipped';
  componentsCompleted: number;
}>;

export function WeeklyRhythmHeatmap() {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('weeklyRhythmCard-collapsed');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [weeklyData, setWeeklyData] = useState<WeeklyData>([]);
  const [insight, setInsight] = useState('');
  const [stats, setStats] = useState({ completed: 0, total: 7, percentage: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await getWeeklyRitualCompletion();
      setWeeklyData(data);
      
      const completed = data.filter(d => d.status === 'full').length;
      const percentage = Math.round((completed / 7) * 100);
      setStats({ completed, total: 7, percentage });
      
      setInsight(generateWeeklyInsight(data));
      setLoading(false);
    };
    
    loadData();
  }, []);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('weeklyRhythmCard-collapsed', JSON.stringify(newState));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'full':
        return 'bg-green-500';
      case 'partial':
        return 'bg-amber-500';
      default:
        return 'bg-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'full':
        return 'Completed';
      case 'partial':
        return 'Partial';
      default:
        return 'Skipped';
    }
  };

  return (
    <Card className="bg-card border-border">
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <div className="p-4 md:p-6">
          <CollapsibleTrigger className="w-full flex items-center justify-between group">
            <div className="text-left">
              <h2 className="text-base md:text-lg font-semibold text-foreground">
                Weekly Rhythm
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Your daily ritual consistency
              </p>
            </div>
            <ChevronDown 
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="mt-6 space-y-6">
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Loading weekly rhythm...
                  </p>
                </div>
              ) : (
                <>
                  {/* 7-Day Heatmap */}
              <div className="space-y-3">
                <div className="grid grid-cols-7 gap-2">
                  {weeklyData.map((day, index) => (
                    <div key={index} className="text-center space-y-2">
                      <div
                        className={`aspect-square rounded-lg ${getStatusColor(day.status)} transition-colors duration-200`}
                        title={`${day.day} - ${getStatusLabel(day.status)} (${day.componentsCompleted}/3 components)`}
                      />
                      <p className="text-xs text-muted-foreground">
                        {day.day}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-green-500" />
                    <span>Full</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-amber-500" />
                    <span>Partial</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-muted" />
                    <span>Skipped</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="bg-background/50 rounded-lg p-4 border border-border/50">
                <div className="text-center space-y-2">
                  <p className="text-2xl md:text-3xl font-headline text-foreground">
                    {stats.completed}/{stats.total}
                  </p>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    completed this week ({stats.percentage}%)
                  </p>
                </div>
              </div>

              {/* Actionable Insight */}
              {insight && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-xs md:text-sm text-foreground leading-relaxed">
                    💡 {insight}
                  </p>
                </div>
              )}

              {/* Detailed Breakdown */}
              <div className="space-y-2">
                <p className="text-xs md:text-sm font-medium text-foreground">
                  Daily Breakdown
                </p>
                <div className="space-y-2">
                  {weeklyData.map((day, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-background/30 border border-border/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded ${getStatusColor(day.status)}`} />
                        <span className="text-sm text-foreground">{day.day}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {day.componentsCompleted}/3 components
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </Card>
  );
}
