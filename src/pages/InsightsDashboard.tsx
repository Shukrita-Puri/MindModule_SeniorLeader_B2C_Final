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
      
      {/* Header */}
      <div className="pt-16 px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-serif bg-gradient-to-r from-gold via-gold-light to-gold bg-clip-text text-transparent mb-2">
              Intelligence Dashboard
            </h1>
            <p className="text-muted-foreground">Your mental performance analytics</p>
          </div>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>

        {/* Section 1: Weekly Energy Summary */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gold" />
            Weekly Energy Summary
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EnergyGauge currentBalance={energyState?.overallBalance || 50} />
            <EnergyDistributionChart />
          </div>
        </section>

        {/* Section 2: Circadian Pattern Analysis */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5 text-gold" />
            Your Natural Rhythms
          </h2>
          <CircadianGraph />
        </section>

        {/* Section 3: Alignment Timeline */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gold" />
            Alignment Over Time
          </h2>
          <AlignmentTimeline />
        </section>

        {/* Section 4: Elemental Balance */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Elemental Balance</h2>
          <ElementalMandala />
        </section>

        {/* Section 5: Decision Quality Trends */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Decision Quality Over Time</h2>
          <DecisionQualityChart />
        </section>

        {/* Mental Fitness Score */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Mental Fitness Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-6xl font-bold text-gold">{fitnessScore}</div>
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
