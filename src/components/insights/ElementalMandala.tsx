import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface ElementalBalance {
  element: string;
  percentage: number;
  color: string;
}

const ElementalMandala = () => {
  const [balance, setBalance] = useState<ElementalBalance[]>([]);

  useEffect(() => {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Elemental Balance Mandala</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {balance.map((item) => (
            <div key={item.element} className="text-center space-y-2">
              <div className={`text-5xl font-bold ${item.color}`}>
                {item.percentage}%
              </div>
              <p className="text-sm font-medium">{item.element}</p>
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
          <p className="text-sm text-muted-foreground text-center py-8">
            Complete practices to see your elemental balance
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ElementalMandala;
