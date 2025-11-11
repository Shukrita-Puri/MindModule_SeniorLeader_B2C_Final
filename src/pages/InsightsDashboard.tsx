import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Clock, Calendar, Activity, Zap } from "lucide-react";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import MainNavigation from "@/components/MainNavigation";
import EnergyGauge from "@/components/insights/EnergyGauge";
import EnergyDistributionChart from "@/components/insights/EnergyDistributionChart";
import CircadianGraph from "@/components/insights/CircadianGraph";
import AlignmentTimeline from "@/components/insights/AlignmentTimeline";
import ElementalMandala from "@/components/insights/ElementalMandala";
import DecisionQualityChart from "@/components/insights/DecisionQualityChart";
import ContentTypeAnalysis from "@/components/insights/ContentTypeAnalysis";
import { computeEnergyState } from "@/utils/energyStateEngine";
import { calculateMentalFitnessScore } from "@/utils/intelligenceEngine";

const InsightsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [energyState, setEnergyState] = useState<any>(null);
  const [fitnessScore, setFitnessScore] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<"week" | "month" | "quarter">("week");
  const [comparisonMode, setComparisonMode] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      // Load energy state
      const state = computeEnergyState();
      setEnergyState(state);
      
      // Load mental fitness score
      const score = calculateMentalFitnessScore();
      setFitnessScore(score.currentScore);
      
      setLoading(false);
    };
    
    loadData();
  }, []);

  const handleExport = () => {
    const data = {
      timestamp: new Date().toISOString(),
      energyState,
      fitnessScore,
      exportedBy: "Mind Module Insights"
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mind-module-insights-${Date.now()}.json`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <UnifiedTopBar backPath="/executive-home" />
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Loading insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <UnifiedTopBar backPath="/executive-home" />
      
      {/* Header Section - Clean and minimal */}
      <div className="relative pt-16 pb-8 px-4">
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div>
              <h1 className="text-2xl md:text-4xl font-headline mb-2 text-foreground tracking-tight">Your Energy Intelligence</h1>
              <p className="text-sm md:text-base text-muted-foreground font-body">Understand your cognitive energy performance</p>
            </div>
          </div>

          {/* Time Range & Export Section */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex gap-2">
              <Button
                variant={timeRange === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange("week")}
              >
                Week
              </Button>
              <Button
                variant={timeRange === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange("month")}
              >
                Month
              </Button>
              <Button
                variant={timeRange === "quarter" ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange("quarter")}
              >
                Quarter
              </Button>
            </div>
            
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
              >
                <Download size={16} className="mr-1" />
                Export
              </Button>
              <Button
                variant={comparisonMode ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonMode(!comparisonMode)}
              >
                <TrendingUp size={16} className="mr-1" />
                Compare
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-8 mb-8">
        
        {/* Section 1: Mental Fitness Score - Prominent at top */}
        <section>
          <Card className="bg-gradient-to-br from-card to-card/50 border-2 border-gold/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-6 w-6 text-saffron" />
                <CardTitle className="text-xl md:text-2xl">Mental Fitness Score</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
                <div className="text-5xl md:text-7xl font-bold text-saffron">{fitnessScore}</div>
                <div className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
                  <p className="leading-relaxed">Based on practice consistency, breakthroughs, and active days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-border" />

        {/* Section 2: Current Energy State */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-headline font-semibold flex items-center gap-2 tracking-tight">
            <Activity className="h-5 w-5 text-saffron" />
            Current Energy State
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <EnergyGauge currentBalance={energyState?.overallBalance || 50} />
            <EnergyDistributionChart timeRange={timeRange} comparisonMode={comparisonMode} />
          </div>
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-border" />

        {/* Section 3: Practice Patterns */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-headline font-semibold flex items-center gap-2 tracking-tight">
            <TrendingUp className="h-5 w-5 text-saffron" />
            Practice Patterns
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <ContentTypeAnalysis />
            <div className="space-y-4">
              <ElementalMandala />
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-border" />

        {/* Section 4: Temporal Intelligence */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-headline font-semibold flex items-center gap-2 tracking-tight">
            <Clock className="h-5 w-5 text-saffron" />
            Temporal Intelligence
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <CircadianGraph timeRange={timeRange} />
            <AlignmentTimeline timeRange={timeRange} comparisonMode={comparisonMode} />
          </div>
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-border" />

        {/* Section 5: Deeper Analysis */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-headline font-semibold flex items-center gap-2 tracking-tight">
            <Calendar className="h-5 w-5 text-saffron" />
            Deeper Analysis
          </h2>
          <DecisionQualityChart timeRange={timeRange} comparisonMode={comparisonMode} />
        </section>

      </div>

      <MainNavigation />
    </div>
  );
};

export default InsightsDashboard;
