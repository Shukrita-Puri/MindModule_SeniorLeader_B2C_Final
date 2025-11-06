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
    return 'text-saffron'; // Critical element - always saffron
  };

  const getBalanceGradient = (balance: number) => {
    // Element-based warm taupe gradients
    const element = energyState.dominantElement;
    if (element === 'fire') return 'from-[#9B7B6A]/10 to-[#B89888]/5';
    if (element === 'earth') return 'from-[#8B8174]/10 to-[#A39B8E]/5';
    if (element === 'water') return 'from-[#7A8A89]/10 to-[#94A5A4]/5';
    if (element === 'air') return 'from-[#9B9B8E]/10 to-[#B4B4A7]/5';
    return 'from-taupe/10 to-taupe-highlight/5';
  };

  return (
    <Card className={`bg-gradient-to-br ${getBalanceGradient(energyState.overallBalance)} border-border/50`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full taupe-gradient-shine border border-taupe/30 flex items-center justify-center flex-shrink-0">
            <ElementIcon className="w-6 h-6 text-taupe-rich" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground mb-1 capitalize">
              Your Mental State
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {getEnergyStateInsight(energyState)}
            </p>
          </div>
        </div>
        
        {/* Energy Balance Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Mental Energy</span>
            <div className="flex items-center gap-1">
              <span className={`text-lg font-bold ${getBalanceColor(energyState.overallBalance)}`}>
                {energyState.overallBalance}
              </span>
              <span className="text-xs">/100</span>
            </div>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500 ease-out taupe-gradient"
              style={{ width: `${energyState.overallBalance}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyStateHeader;
