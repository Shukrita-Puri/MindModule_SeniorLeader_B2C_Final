import { Calendar, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ActionsSectionProps {
  onScheduleFollowup: () => void;
  onDownload: () => void;
}

const ActionsSection = ({ onScheduleFollowup, onDownload }: ActionsSectionProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="text-2xl">📅</div>
            <h3 className="font-heading font-medium text-foreground">Schedule Practice</h3>
            <p className="text-sm text-muted-foreground">
              Set a reminder to practice these frameworks in future interactions
            </p>
            <Button 
              onClick={onScheduleFollowup}
              variant="outline"
              className="w-full"
            >
              <Calendar size={16} className="mr-2" />
              Schedule Follow-up
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="text-2xl">📊</div>
            <h3 className="font-heading font-medium text-foreground">Download Deck</h3>
            <p className="text-sm text-muted-foreground">
              Get a comprehensive PDF of your insights and frameworks
            </p>
            <Button 
              onClick={onDownload}
              variant="outline"
              className="w-full"
            >
              <Download size={16} className="mr-2" />
              Session Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ActionsSection;