import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Calendar } from 'lucide-react';
import { getUserEnergyProfile, type UserEnergyProfile } from '@/utils/memoryEngine';

const InsightsSnapshot = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserEnergyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    const userProfile = await getUserEnergyProfile();
    setProfile(userProfile);
    setLoading(false);
  };

  if (loading || !profile) {
    return (
      <Card className="bg-muted/30 border-border/50">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground animate-pulse">
            Analyzing your weekly patterns...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate weekly balance (placeholder logic)
  const weeklyBalance = 62; // Would calculate from actual data
  const sessionsThisWeek = profile.effectivenessByCategory.reduce((sum, cat) => sum + cat.totalSessions, 0);

  return (
    <Card className="bg-gradient-to-br from-gold/5 via-background to-background border-gold/20">
      <CardContent className="p-5 space-y-4">
        {/* Weekly Balance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">Weekly Energy Balance</span>
            <span className="text-lg font-bold text-gold">{weeklyBalance}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold via-gold-light to-gold transition-all duration-500"
              style={{ width: `${weeklyBalance}%` }}
            />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-background/50 rounded-lg p-3 border border-border/50">
            <div className="flex items-center gap-2 text-gold mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-semibold">Sessions</span>
            </div>
            <p className="text-xl font-bold text-foreground">{sessionsThisWeek}</p>
            <p className="text-xs text-muted-foreground">This week</p>
          </div>
          
          <div className="bg-background/50 rounded-lg p-3 border border-border/50">
            <div className="flex items-center gap-2 text-gold mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-semibold">Best Time</span>
            </div>
            <p className="text-sm font-bold text-foreground capitalize">
              {profile.bestPracticeTimes[0] || 'Morning'}
            </p>
            <p className="text-xs text-muted-foreground">Your peak</p>
          </div>
        </div>

        {/* Top Pattern */}
        {profile.topRestorers.length > 0 && (
          <div className="bg-background/50 rounded-lg p-3 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Top Restorer</p>
            <p className="text-sm font-semibold text-foreground">{profile.topRestorers[0]}</p>
          </div>
        )}

        {/* View Full Insights */}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-gold/30 text-gold hover:bg-gold hover:text-primary-foreground"
          onClick={() => navigate('/insights')}
        >
          View Full Insights Dashboard →
        </Button>
      </CardContent>
    </Card>
  );
};

export default InsightsSnapshot;
