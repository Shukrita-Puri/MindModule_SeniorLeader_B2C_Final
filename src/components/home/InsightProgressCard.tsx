import WeeklyRitualStreak from './WeeklyRitualStreak';

const InsightProgressCard = () => {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-4">
      {/* Weekly Ritual Completion with Streak - Day Tracking Only */}
      <WeeklyRitualStreak />
    </div>
  );
};

export default InsightProgressCard;
