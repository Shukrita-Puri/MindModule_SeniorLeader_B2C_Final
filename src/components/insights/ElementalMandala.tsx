import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ElementalBalance {
  element: string;
  percentage: number;
  color: string;
}

const ElementalMandala = () => {
  const [balance, setBalance] = useState<ElementalBalance[]>([]);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const savedState = localStorage.getItem('insight-collapse-elemental');
    if (savedState !== null) {
      setIsOpen(savedState === 'true');
    }

    // Load practice history
    const practiceHistory = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    
    // Map outcomes to elements
    const elementMap: Record<string, string> = {
      "power-up": "Fire",
      "ready": "Fire",
      "presence": "Earth",
      "calm": "Water",
      "pause": "Air"
    };
    
    // Count elements
    const elementCounts: Record<string, number> = {
      Fire: 0,
      Earth: 0,
      Water: 0,
      Air: 0
    };
    
    practiceHistory.forEach((entry: any) => {
      const element = elementMap[entry.outcome] || "Earth";
      elementCounts[element] += 1;
    });
    
    const total = practiceHistory.length || 1;
    const balanceData = Object.entries(elementCounts).map(([element, count]) => ({
      element,
      percentage: Math.round((count / total) * 100),
      color: {
        Fire: "text-red-500",
        Earth: "text-green-500",
        Water: "text-blue-500",
        Air: "text-purple-500"
      }[element] || "text-gold"
    }));
    
    setBalance(balanceData);
  }, []);

  const handleToggle = (newState: boolean) => {
    setIsOpen(newState);
    localStorage.setItem('insight-collapse-elemental', newState.toString());
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base md:text-lg">Elemental Balance Mandala</CardTitle>
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
          <CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-2 gap-4 md:gap-6">
              {balance.map((item) => (
                <div key={item.element} className="text-center space-y-2">
                  <div className={`text-4xl md:text-6xl font-bold ${item.color}`}>
                    {item.percentage}%
                  </div>
                  <p className="text-xs md:text-sm font-medium">{item.element}</p>
              <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                <div
                  className={`h-full ${item.color.replace('text-', 'bg-')} transition-all duration-500`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
            
            {balance.length === 0 && (
              <p className="text-xs md:text-sm text-muted-foreground text-center py-8">
                Complete practices to see your elemental balance
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default ElementalMandala;
