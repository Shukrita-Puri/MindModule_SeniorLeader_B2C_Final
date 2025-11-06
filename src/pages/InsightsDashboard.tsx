import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Clock, Calendar } from "lucide-react";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import MainNavigation from "@/components/MainNavigation";
import EnergyGauge from "@/components/insights/EnergyGauge";
import EnergyDistributionChart from "@/components/insights/EnergyDistributionChart";
import CircadianGraph from "@/components/insights/CircadianGraph";
import AlignmentTimeline from "@/components/insights/AlignmentTimeline";
import ElementalMandala from "@/components/insights/ElementalMandala";
import DecisionQualityChart from "@/components/insights/DecisionQualityChart";
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-headline mb-2 text-foreground tracking-tight">Your Intelligence</h1>
              <p className="text-muted-foreground font-body">Track your cognitive performance</p>
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

        {/* Section 1: Weekly Energy Summary */}
        <section className="mb-12 max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-2 tracking-tight">
            <TrendingUp className="h-5 w-5 text-primary" />
            Weekly Energy Summary
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EnergyGauge currentBalance={energyState?.overallBalance || 50} />
            <EnergyDistributionChart timeRange={timeRange} comparisonMode={comparisonMode} />
          </div>
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-black/[0.08] mb-12 max-w-7xl mx-auto px-6" />

        {/* Section 2: Circadian Pattern Analysis */}
        <section className="mb-12 max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-2 tracking-tight">
            <Clock className="h-5 w-5 text-primary" />
            Your Natural Rhythms
          </h2>
          <CircadianGraph timeRange={timeRange} />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-black/[0.08] mb-12 max-w-7xl mx-auto px-6" />

        {/* Section 3: Alignment Timeline */}
        <section className="mb-12 max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-2 tracking-tight">
            <Calendar className="h-5 w-5 text-primary" />
            Alignment Over Time
          </h2>
          <AlignmentTimeline timeRange={timeRange} comparisonMode={comparisonMode} />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-black/[0.08] mb-12 max-w-7xl mx-auto px-6" />

        {/* Section 4: Elemental Balance */}
        <section className="mb-12 max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-headline font-semibold mb-6 tracking-tight">Elemental Balance</h2>
          <ElementalMandala />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-black/[0.08] mb-12 max-w-7xl mx-auto px-6" />

        {/* Section 5: Decision Quality Trends */}
        <section className="mb-12 max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-headline font-semibold mb-6 tracking-tight">Decision Quality Over Time</h2>
          <DecisionQualityChart timeRange={timeRange} comparisonMode={comparisonMode} />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-black/[0.08] mb-12 max-w-7xl mx-auto px-6" />

        {/* Mental Fitness Score */}
        <div className="mb-8 max-w-7xl mx-auto px-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Mental Fitness Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-6xl font-bold text-foreground">{fitnessScore}</div>
                <div className="text-sm text-muted-foreground">
                  <p>Based on practice consistency, breakthroughs, and active days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      <MainNavigation />
    </div>
  );
};

export default InsightsDashboard;
