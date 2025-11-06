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
    <div className="min-h-screen bg-background pb-24">
      <UnifiedTopBar backPath="/executive-home" />
      
      {/* Header with Radial Glow */}
      <div className="pt-16 px-6 max-w-7xl mx-auto">
        <div className="relative mb-12">
          {/* Radial Glow Background */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_center,_rgba(0,217,255,0.15)_0%,_transparent_50%)] -z-10" />
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-headline font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-2">
                Intelligence Dashboard
              </h1>
              <p className="text-muted-foreground">Your mental performance analytics</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1 bg-card/50 backdrop-blur-xl border border-white/10 rounded-2xl p-1">
                <Button
                  onClick={() => setTimeRange("week")}
                  variant={timeRange === "week" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-xl"
                >
                  Week
                </Button>
                <Button
                  onClick={() => setTimeRange("month")}
                  variant={timeRange === "month" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-xl"
                >
                  Month
                </Button>
                <Button
                  onClick={() => setTimeRange("quarter")}
                  variant={timeRange === "quarter" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-xl"
                >
                  Quarter
                </Button>
              </div>
              <Button
                onClick={() => setComparisonMode(!comparisonMode)}
                variant={comparisonMode ? "default" : "glass"}
                size="sm"
              >
                Compare
              </Button>
              <Button onClick={handleExport} variant="glass" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Section 1: Weekly Energy Summary */}
        <section className="mb-12">
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
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-12" />

        {/* Section 2: Circadian Pattern Analysis */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-2 tracking-tight">
            <Clock className="h-5 w-5 text-primary" />
            Your Natural Rhythms
          </h2>
          <CircadianGraph timeRange={timeRange} />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-12" />

        {/* Section 3: Alignment Timeline */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-2 tracking-tight">
            <Calendar className="h-5 w-5 text-primary" />
            Alignment Over Time
          </h2>
          <AlignmentTimeline timeRange={timeRange} comparisonMode={comparisonMode} />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-12" />

        {/* Section 4: Elemental Balance */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline font-semibold mb-6 tracking-tight">Elemental Balance</h2>
          <ElementalMandala />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-12" />

        {/* Section 5: Decision Quality Trends */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline font-semibold mb-6 tracking-tight">Decision Quality Over Time</h2>
          <DecisionQualityChart timeRange={timeRange} comparisonMode={comparisonMode} />
        </section>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-12" />

        {/* Mental Fitness Score */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">Mental Fitness Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-6xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{fitnessScore}</div>
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
