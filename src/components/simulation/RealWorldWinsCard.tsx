import { Sparkles, MessageSquare, Zap, Target } from 'lucide-react';

interface Win {
  category: 'communication' | 'adaptability' | 'regulation';
  text: string;
}

interface Props {
  totalWins: number;
  wins: Win[];
  userReflection?: string;
}

const RealWorldWinsCard = ({ totalWins, wins, userReflection }: Props) => {
  const getCategoryIcon = (category: string) => {
    switch(category) {
      case 'communication': return <MessageSquare size={14} className="text-primary" />;
      case 'adaptability': return <Zap size={14} className="text-accent" />;
      case 'regulation': return <Target size={14} className="text-forest" />;
      default: return <Sparkles size={14} className="text-gold" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch(category) {
      case 'communication': return 'Communication & Social';
      case 'adaptability': return 'Agility & Adaptability';
      case 'regulation': return 'Self-Regulation';
      default: return 'Other';
    }
  };

  // Group wins by category
  const groupedWins = wins.reduce((acc, win) => {
    if (!acc[win.category]) acc[win.category] = [];
    acc[win.category].push(win.text);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div className="bg-gradient-to-br from-gold/5 to-primary/5 border border-gold/20 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-gold" />
        <h3 className="text-lg font-headline font-semibold">Real-World Wins This Month: {totalWins}</h3>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedWins).map(([category, winList]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-2">
              {getCategoryIcon(category)}
              <p className="text-sm font-medium text-foreground">{getCategoryLabel(category)}:</p>
            </div>
            <ul className="space-y-1 ml-6">
              {winList.map((win, idx) => (
                <li key={idx} className="text-sm text-foreground/90 flex items-start gap-2">
                  <span className="text-accent mt-1">✓</span>
                  <span>"{win}"</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {userReflection && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-foreground/90 italic">
            💡 "{userReflection}"
          </p>
        </div>
      )}
    </div>
  );
};

export default RealWorldWinsCard;
