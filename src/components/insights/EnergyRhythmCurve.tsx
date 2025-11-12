import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Sunrise, Zap, Moon } from 'lucide-react';
import { getEngagementsByHour, calculatePeakWindows, generateEnergyInsight, type HourBucket, type PeakWindow } from '@/utils/engagementTracking';

export function EnergyRhythmCurve() {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('energyRhythmCard-collapsed');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [hourlyData, setHourlyData] = useState<HourBucket[]>([]);
  const [peakWindows, setPeakWindows] = useState<PeakWindow[]>([]);
  const [insight, setInsight] = useState('');
  const [totalEngagements, setTotalEngagements] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      const data = await getEngagementsByHour();
      setHourlyData(data);
      
      const total = data.reduce((sum, h) => sum + h.count, 0);
      setTotalEngagements(total);
      
      const windows = await calculatePeakWindows();
      setPeakWindows(windows);
      
      setInsight(generateEnergyInsight(windows));
      setLoading(false);
    };
    
    loadData();
  }, []);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('energyRhythmCard-collapsed', JSON.stringify(newState));
  };

  const maxDensity = Math.max(...hourlyData.map(h => h.smoothed), 1);
  const isEarlyPattern = totalEngagements >= 7 && totalEngagements < 21;
  const hasEnoughData = totalEngagements >= 7;

  const getWindowIcon = (type: string) => {
    switch (type) {
      case 'morning': return <Sunrise className="h-4 w-4" />;
      case 'afternoon': return <Zap className="h-4 w-4" />;
      case 'evening': return <Moon className="h-4 w-4" />;
      default: return null;
    }
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}${period}`;
  };

  return (
    <Card className="bg-card border-border">
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <div className="p-4 md:p-6">
          <CollapsibleTrigger className="w-full flex items-center justify-between group">
            <div className="text-left">
              <h2 className="text-base md:text-lg font-semibold text-foreground">
                Your Energy Rhythm
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                24-hour engagement pattern
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
                    Loading energy pattern...
                  </p>
                </div>
              ) : !hasEnoughData ? (
                <div className="text-center py-8 space-y-4">
                  <p className="text-sm md:text-base text-muted-foreground">
                    Complete 7 sessions to see your energy curve
                  </p>
                  <div className="max-w-md mx-auto">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>{totalEngagements}/7 sessions</span>
                      <span>{Math.round((totalEngagements / 7) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.min(100, (totalEngagements / 7) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chart */}
                  <div className="space-y-2">
                    {isEarlyPattern && (
                      <p className="text-xs text-muted-foreground text-center">
                        Early pattern emerging... ({totalEngagements} sessions)
                      </p>
                    )}
                    
                    <div className="relative h-48 md:h-64 bg-background/30 rounded-lg border border-border/30 p-4">
                      {/* Y-axis labels */}
                      <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between text-xs text-muted-foreground">
                        <span>High</span>
                        <span>Low</span>
                      </div>
                      
                      {/* Chart area */}
                      <div className="ml-10 h-full relative">
                        {/* SVG Line Chart */}
                        <svg className="w-full h-full" viewBox="0 0 1000 200" preserveAspectRatio="none">
                          {/* Grid lines */}
                          <line x1="0" y1="50" x2="1000" y2="50" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
                          <line x1="0" y1="100" x2="1000" y2="100" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
                          <line x1="0" y1="150" x2="1000" y2="150" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3" />
                          
                          {/* Area under curve */}
                          <path
                            d={`M 0 200 ${hourlyData.map((h, i) => {
                              const x = (i / 23) * 1000;
                              const y = 200 - (h.smoothed / maxDensity) * 180;
                              return `L ${x} ${y}`;
                            }).join(' ')} L 1000 200 Z`}
                            fill="hsl(var(--primary))"
                            opacity="0.1"
                          />
                          
                          {/* Line */}
                          <path
                            d={`M ${hourlyData.map((h, i) => {
                              const x = (i / 23) * 1000;
                              const y = 200 - (h.smoothed / maxDensity) * 180;
                              return `${i === 0 ? '' : 'L'} ${x} ${y}`;
                            }).join(' ')}`}
                            fill="none"
                            stroke="hsl(var(--primary))"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={isEarlyPattern ? "5,5" : "none"}
                          />
                          
                          {/* Data points */}
                          {hourlyData.map((h, i) => {
                            if (h.count === 0) return null;
                            const x = (i / 23) * 1000;
                            const y = 200 - (h.smoothed / maxDensity) * 180;
                            return (
                              <circle
                                key={i}
                                cx={x}
                                cy={y}
                                r="4"
                                fill="hsl(var(--primary))"
                              />
                            );
                          })}
                        </svg>
                      </div>
                      
                      {/* X-axis labels */}
                      <div className="ml-10 mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>12am</span>
                        <span>6am</span>
                        <span>12pm</span>
                        <span>6pm</span>
                        <span>11pm</span>
                      </div>
                    </div>
                  </div>

                  {/* Peak Windows */}
                  {peakWindows.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs md:text-sm font-medium text-foreground">
                        Peak Activity Windows
                      </p>
                      {peakWindows.map((window, index) => (
                        <div 
                          key={index}
                          className="bg-background/50 rounded-lg p-3 border border-border/50 flex items-start gap-3"
                        >
                          <div className="text-primary mt-0.5">
                            {getWindowIcon(window.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm md:text-base font-medium text-foreground">
                                {formatHour(window.startHour)}-{formatHour(window.endHour)}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {window.label}
                              </span>
                            </div>
                            <p className="text-xs md:text-sm text-muted-foreground">
                              {window.sessionCount} sessions ({window.percentage}% of total)
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actionable Insight */}
                  {insight && (
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                      <p className="text-xs md:text-sm text-foreground leading-relaxed">
                        💡 {insight}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </Card>
  );
}
