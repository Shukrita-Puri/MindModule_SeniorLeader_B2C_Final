import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientProgress } from "@/components/ui/gradient-progress";

interface EnergyGaugeProps {
  currentBalance: number;
}

const EnergyGauge = ({ currentBalance }: EnergyGaugeProps) => {
  const getBalanceLabel = (balance: number) => {
    if (balance < 30) return "Low Energy";
    if (balance < 50) return "Below Balance";
    if (balance < 70) return "Balanced";
    if (balance < 85) return "High Energy";
    return "Peak State";
  };

  const getBalanceColor = (balance: number) => {
    if (balance < 30) return "text-red-500";
    if (balance < 50) return "text-orange-500";
    if (balance < 70) return "text-green-500";
    if (balance < 85) return "text-blue-500";
    return "text-gold";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Energy State</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <div className={`text-6xl font-bold mb-2 ${getBalanceColor(currentBalance)}`}>
            {Math.round(currentBalance)}
          </div>
          <p className="text-sm text-muted-foreground">{getBalanceLabel(currentBalance)}</p>
        </div>
        
        <GradientProgress value={currentBalance} className="h-3" />
        
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
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
    </Card>
  );
};

export default EnergyGauge;
