import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Flame, Mountain, Droplets, Wind, Sparkles } from 'lucide-react';
import { computeEnergyState, getEnergyStateInsight } from '@/utils/energyStateEngine';

const EnergyStateHeader = () => {
  const [energyState, setEnergyState] = useState(computeEnergyState());

  useEffect(() => {
    // Recalculate on mount
    setEnergyState(computeEnergyState());
  }, []);

  const elementIcons: Record<string, any> = {
    fire: Flame,
    earth: Mountain,
    water: Droplets,
    air: Wind,
    balanced: Sparkles
  };

  const ElementIcon = elementIcons[energyState.dominantElement] || Sparkles;

  const getBalanceColor = (balance: number) => {
    if (balance >= 75) return 'text-green-600';
    if (balance >= 60) return 'text-yellow-600';
    if (balance >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getBalanceGradient = (balance: number) => {
    if (balance >= 75) return 'from-green-500/10 to-emerald-500/5';
    if (balance >= 60) return 'from-yellow-500/10 to-amber-500/5';
    if (balance >= 40) return 'from-orange-500/10 to-red-500/5';
    return 'from-red-500/10 to-rose-500/5';
  };

  return (
    <Card className={`bg-gradient-to-br ${getBalanceGradient(energyState.overallBalance)} border-border/50`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-background border border-border flex items-center justify-center flex-shrink-0">
            <ElementIcon className={`w-6 h-6 ${getBalanceColor(energyState.overallBalance)}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground mb-1 capitalize">
              {energyState.dominantElement} Energy
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {getEnergyStateInsight(energyState)}
            </p>
          </div>
        </div>
        
        {/* Energy Balance Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Energy Balance</span>
            <span className={`font-semibold ${getBalanceColor(energyState.overallBalance)}`}>
              {energyState.overallBalance}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                energyState.overallBalance >= 75
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                  : energyState.overallBalance >= 60
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-600'
                  : energyState.overallBalance >= 40
                  ? 'bg-gradient-to-r from-orange-500 to-red-600'
                  : 'bg-gradient-to-r from-red-500 to-rose-600'
              }`}
              style={{ width: `${energyState.overallBalance}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyStateHeader;
