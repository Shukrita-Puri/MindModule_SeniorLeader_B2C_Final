import { Card } from "@/components/ui/card";
import { Calendar, Activity, Sparkles } from "lucide-react";

interface IntegrationPreviewCardProps {
  type: 'calendar' | 'wearable';
}

export const IntegrationPreviewCard = ({ type }: IntegrationPreviewCardProps) => {
  if (type === 'calendar') {
    return (
      <Card className="mt-4 p-4 bg-primary/5 border-gold/20 animate-fade-in">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-gold" />
          What You'll See After Connecting
        </h4>
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs">
            <Calendar size={14} className="mt-0.5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Tomorrow, 2:00 PM - Board Presentation</p>
              <p className="text-muted-foreground">→ Suggested: "Executive Presence" practice • 15min before meeting</p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <Calendar size={14} className="mt-0.5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Friday, 3:30 PM - Difficult Conversation with Team Member</p>
              <p className="text-muted-foreground">→ Recommended: "Emotional Regulation" scenario • 20min before</p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <Calendar size={14} className="mt-0.5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">5 Back-to-Back Meetings Detected</p>
              <p className="text-muted-foreground">→ Auto-nudge: "Emergency Reset" during 5min gap at 11:55 AM</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-4 p-4 bg-primary/5 border-gold/20 animate-fade-in">
      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Sparkles size={16} className="text-gold" />
        What You'll See After Connecting
      </h4>
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-xs">
          <Activity size={14} className="mt-0.5 text-primary flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground">HRV Dropped 15% Below Baseline</p>
            <p className="text-muted-foreground">→ Suggested: "Breathwork Session" for quick recovery • 5min</p>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs">
          <Activity size={14} className="mt-0.5 text-primary flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground">Sleep Quality: 62% (Below Your Average)</p>
            <p className="text-muted-foreground">→ Adjusted plan: Shorter, gentler practices recommended today</p>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs">
          <Activity size={14} className="mt-0.5 text-primary flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground">Stress Spike Detected at 1:42 PM</p>
            <p className="text-muted-foreground">→ Proactive offer: "Pause & Reset" before your 2:00 PM task</p>
          </div>
        </div>
      </div>
    </Card>
  );
};
