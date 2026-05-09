import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight } from "lucide-react";

export default function IntegrationSettings() {
  const navigate = useNavigate();

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3 flex-1">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gold/20 to-primary/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-6 h-6 text-gold" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold mb-1">Wearable Devices</h4>
            <p className="text-sm text-muted-foreground">
              Manage Apple Health from the verified connected data flow.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate("/connected-data")}>
          Manage
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
