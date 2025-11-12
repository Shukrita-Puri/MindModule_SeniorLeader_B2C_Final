import { useState } from 'react';
import { TrendingUp, Flame, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { calculateMentalFitnessScore, getLatestQuickWin, detectUserPatterns, getWinVerbatim } from '@/utils/intelligenceEngine';

const InsightProgressCard = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const winVerbatim = getLatestQuickWin();
  const mentalFitness = calculateMentalFitnessScore();
  const patterns = detectUserPatterns();
  
  // Get streak and practices from localStorage (includes both Dialogue and Sanctuary)
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  const recalibrateHistory = JSON.parse(localStorage.getItem('recalibrateHistory') || '[]');
  const allPractices = practiceHistory.length + recalibrateHistory.length;
  const streak = getUserStreak();
  
  return (
    <div className="bg-card border border-gold/20 rounded-lg shadow-md">
      {/* Collapsed View - Always Visible */}
      <div className="p-4">
        {/* Win Verbatim or Latest Insight */}
        {winVerbatim && (
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              {winVerbatim.type === 'quick-win' ? 'Quick Win Yesterday 👏' : 'Latest Insight'}
            </p>
            <p className="text-sm font-body leading-relaxed text-foreground">
              "{winVerbatim.text}"
            </p>
          </div>
        )}
        
        {/* Three Elite Stats */}
        <div className="grid grid-cols-3 gap-4 mb-3">
          {/* Mental Fitness Score */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="text-2xl font-bold text-foreground">{mentalFitness.currentScore}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              {mentalFitness.change > 0 && (
                <span className="text-xs text-accent ml-1">↑ +{mentalFitness.change}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Mental Fitness</p>
          </div>
          
          {/* Practices Completed */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target size={16} className="text-primary" />
              <span className="text-2xl font-bold text-foreground">{allPractices}</span>
            </div>
            <p className="text-xs text-muted-foreground">Practices</p>
          </div>
          
          {/* Practice Streak */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Flame size={16} className="text-accent" />
              <span className="text-2xl font-bold text-foreground">{streak}</span>
            </div>
            <p className="text-xs text-muted-foreground">Day Streak</p>
          </div>
        </div>
        
        {/* Expand Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors py-2 border-t border-border mt-3"
        >
          {isExpanded ? (
            <>
              <span>Show less</span>
              <ChevronUp size={14} />
            </>
          ) : (
            <>
              <span>View full intelligence</span>
              <ChevronDown size={14} />
            </>
          )}
        </button>
      </div>
      
      {/* Expanded View */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4 animate-fade-in">
          {/* Pattern Detection */}
          {patterns.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Pattern Detection
              </p>
              <ul className="space-y-1">
                {patterns.map((pattern, idx) => (
                  <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{pattern.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Helper function for streak calculation
function getUserStreak(): number {
  const practiceHistory = JSON.parse(localStorage.getItem('practiceHistory') || '[]');
  if (practiceHistory.length === 0) return 0;
  
  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  
  while (true) {
    const hasActivity = practiceHistory.some((p: any) => {
      const pDate = new Date(p.timestamp);
      pDate.setHours(0, 0, 0, 0);
      return pDate.getTime() === currentDate.getTime();
    });
    
    if (hasActivity) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

export default InsightProgressCard;
