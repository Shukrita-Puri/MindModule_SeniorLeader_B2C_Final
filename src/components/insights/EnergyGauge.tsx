import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientProgress } from "@/components/ui/gradient-progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface EnergyGaugeProps {
  currentBalance: number;
}

const EnergyGauge = ({ currentBalance }: EnergyGaugeProps) => {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const savedState = localStorage.getItem('insight-collapse-energy-gauge');
    if (savedState !== null) {
      setIsOpen(savedState === 'true');
    }
  }, []);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('insight-collapse-energy-gauge', newState.toString());
  };
  const getBalanceLabel = (balance: number) => {
    if (balance < 30) return "Low Energy";
    if (balance < 50) return "Below Balance";
    if (balance < 70) return "Balanced";
    if (balance < 85) return "High Energy";
    return "Peak State";
  };

  const getBalanceColor = (balance: number) => {
    return "text-saffron"; // Critical element - always saffron
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base md:text-lg">Current Energy State</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggle(!isOpen)}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
          </Button>
        </div>
      </CardHeader>
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <CollapsibleContent>
          <CardContent className="space-y-6 p-4 md:p-6">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <div className={`text-5xl md:text-7xl font-bold ${getBalanceColor(currentBalance)}`}>
                  {Math.round(currentBalance)}
                </div>
                <span className="text-base md:text-2xl text-muted-foreground">/100</span>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-2">{getBalanceLabel(currentBalance)}</p>
            </div>
            
            <GradientProgress value={currentBalance} className="h-3" />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center text-xs md:text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Low</p>
                <p className="font-semibold">0-40</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Balanced</p>
                <p className="font-semibold">40-70</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">High</p>
                <p className="font-semibold">70-100</p>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default EnergyGauge;
