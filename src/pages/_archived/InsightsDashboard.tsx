import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';
import MainNavigation from '@/components/_archived/MainNavigation';
import { MentalFitnessScoreCard } from '@/components/insights/MentalFitnessScoreCard';
import { EnergyRhythmCurve } from '@/components/insights/EnergyRhythmCurve';
import { WeeklyRhythmHeatmap } from '@/components/insights/WeeklyRhythmHeatmap';
import { calculateMentalFitnessScore } from '@/utils/mentalFitnessEngine';
import { toast } from 'sonner';

export default function InsightsDashboard() {
  const handleExport = () => {
    try {
      const fitnessData = calculateMentalFitnessScore();
      const exportData = {
        timestamp: new Date().toISOString(),
        mentalFitnessScore: fitnessData,
        engagements: JSON.parse(localStorage.getItem('allEngagements') || '[]'),
        dailyRitualHistory: JSON.parse(localStorage.getItem('dailyRitualHistory') || '[]'),
        practiceHistory: JSON.parse(localStorage.getItem('practiceHistory') || '[]'),
        recalibrateHistory: JSON.parse(localStorage.getItem('recalibrateHistory') || '[]')
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `insights-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Insights data exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export insights data');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <UnifiedTopBar backPath="/executive-home" />
      
      {/* Header with Icon-Only Export */}
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-3xl font-headline text-foreground">
              Your Energy Intelligence Debrief
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Understand your cognitive energy patterns, build your inner resilience and self regulation
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleExport}
            className="shrink-0"
            title="Export insights data"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Section A: Mental Fitness Score (Hero) */}
      <section className="max-w-7xl mx-auto px-4 mb-6">
        <MentalFitnessScoreCard />
      </section>

      {/* Section B: Your Energy Rhythm */}
      <section className="max-w-7xl mx-auto px-4 mb-6">
        <EnergyRhythmCurve />
      </section>

      {/* Section C: Weekly Rhythm */}
      <section className="max-w-7xl mx-auto px-4 mb-6">
        <WeeklyRhythmHeatmap />
      </section>

      <MainNavigation />
    </div>
  );
}
