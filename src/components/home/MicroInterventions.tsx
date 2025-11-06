import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Bell, Target, Activity, Zap } from 'lucide-react';
import {
  detectMeetingGaps,
  detectHighStakesEvents,
  detectBackToBackOverload,
  calculateTotalMeetingMinutes,
  type CalendarEvent,
  type MeetingGap
} from '@/utils/historicalPatternEngine';
import { getContentByTags } from '@/data/practicesAndSoundscapes';

interface MicroIntervention {
  id: string;
  type: 'meeting-gap' | 'pre-performance' | 'recovery';
  trigger: string;
  content: any;
  timing: string;
  reasoning: string;
  icon: 'bell' | 'target' | 'activity' | 'zap';
}

const MicroInterventions = () => {
  const navigate = useNavigate();
  const [interventions, setInterventions] = useState<MicroIntervention[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInterventions();
  }, []);

  const loadInterventions = () => {
    setLoading(true);
    const calendarEvents: CalendarEvent[] = JSON.parse(
      localStorage.getItem('calendarEvents') || '[]'
    );

    if (calendarEvents.length === 0) {
      setInterventions([]);
      setLoading(false);
      return;
    }

    const detectedInterventions: MicroIntervention[] = [];

    // 1. Detect Meeting Gaps
    const gaps = detectMeetingGaps(calendarEvents);
    gaps.forEach((gap, index) => {
      const quickResetContent = getContentByTags(['pause', 'quick', 'gentle']);
      if (quickResetContent[0]) {
        detectedInterventions.push({
          id: `gap-${index}`,
          type: 'meeting-gap',
          trigger: `${gap.gapDuration}-min gap between meetings`,
          content: quickResetContent[0],
          timing: gap.timing,
          reasoning: `Prevent mental fatigue with a brief reset between your ${gap.afterMeeting.title} and ${gap.beforeMeeting.title}.`,
          icon: 'zap'
        });
      }
    });

    // 2. Detect High-Stakes Events (upcoming in next 60 min)
    const highStakesEvents = detectHighStakesEvents(calendarEvents, 60);
    highStakesEvents.forEach((event, index) => {
      const groundingContent = getContentByTags(['presence', 'grounding', 'centering', 'pre-performance']);
      if (groundingContent[0]) {
        const eventStart = new Date(event.startTime);
        const minutesUntil = Math.floor((eventStart.getTime() - Date.now()) / (1000 * 60));
        const recommendedTime = new Date(eventStart.getTime() - 30 * 60 * 1000);
        
        detectedInterventions.push({
          id: `highstakes-${index}`,
          type: 'pre-performance',
          trigger: `${event.title} at ${formatTime(eventStart)}`,
          content: groundingContent[0],
          timing: `Recommended: ${formatTime(recommendedTime)} (30 min before)`,
          reasoning: `Get into the zone for tough conversations. This practice will help you stay grounded and present.`,
          icon: 'target'
        });
      }
    });

    // 3. Detect Back-to-Back Overload
    const backToBackCount = detectBackToBackOverload(calendarEvents);
    if (backToBackCount >= 3) {
      const quickResetContent = getContentByTags(['pause', 'quick', 'centering']);
      if (quickResetContent[0]) {
        detectedInterventions.push({
          id: 'back-to-back-overload',
          type: 'meeting-gap',
          trigger: `${backToBackCount} back-to-back meetings detected`,
          content: quickResetContent[0],
          timing: 'Between meetings today',
          reasoning: 'Multiple consecutive meetings drain focus. Quick resets will help you maintain clarity throughout the day.',
          icon: 'activity'
        });
      }
    }

    // 4. Detect Meeting Overload (6+ hours)
    const totalMeetingMinutes = calculateTotalMeetingMinutes(calendarEvents);
    if (totalMeetingMinutes >= 360) {
      const recoveryContent = getContentByTags(['pause', 'cooling', 'gentle', 'release']);
      if (recoveryContent[0]) {
        const lastMeeting = calendarEvents[calendarEvents.length - 1];
        const lastMeetingEnd = new Date(lastMeeting.endTime);
        
        detectedInterventions.push({
          id: 'meeting-overload-recovery',
          type: 'recovery',
          trigger: `${Math.floor(totalMeetingMinutes / 60)} hours of meetings today`,
          content: recoveryContent[0],
          timing: `After your last meeting at ${formatTime(lastMeetingEnd)}`,
          reasoning: 'Restore energy after an intensive day. This recovery practice will help you decompress and recharge.',
          icon: 'bell'
        });
      }
    }

    setInterventions(detectedInterventions);
    setLoading(false);
  };

  const handleInterventionClick = (intervention: MicroIntervention) => {
    const content = intervention.content;
    if (content.contentType === 'soundbath') {
      navigate(`/soundscapes/${content.id}`, { state: { category: content.category } });
    } else if (content.contentType === 'guided-practice') {
      navigate(`/guided-practices/${content.id}`, { state: { category: content.category } });
    } else if (content.contentType === 'micro-practice') {
      navigate(`/micro-practice/${content.id}`, { state: { category: content.category } });
    }
  };

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'target': return Target;
      case 'activity': return Activity;
      case 'zap': return Zap;
      default: return Bell;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground animate-pulse">
          Analyzing your calendar...
        </p>
      </div>
    );
  }

  if (interventions.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground text-center">
          No micro interventions needed right now. Connect your calendar to get personalized recommendations.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {interventions.map((intervention) => {
        const Icon = getIcon(intervention.icon);
        return (
          <Card
            key={intervention.id}
            className="p-4 space-y-3 cursor-pointer hover:bg-card/50 transition-all"
            onClick={() => handleInterventionClick(intervention)}
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-saffron/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-saffron" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  {intervention.trigger}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {intervention.timing}
                </p>
              </div>
            </div>

            {/* Content Preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
              <div
                className="w-12 h-12 rounded-lg bg-cover bg-center flex-shrink-0"
                style={{ backgroundImage: `url('${intervention.content.thumbnail}')` }}
              />
              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-semibold text-foreground mb-1 line-clamp-1">
                  {intervention.content.title}
                </h5>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{intervention.content.duration} min</span>
                  <span>•</span>
                  <Badge variant="outline" className="text-xs">
                    {intervention.content.category}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Reasoning */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              💡 {intervention.reasoning}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Implement notification scheduling
                  alert('Notification set! We\'ll remind you at the right time.');
                }}
              >
                Set Reminder
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs bg-gradient-to-r from-taupe via-taupe-highlight to-taupe hover:opacity-90 text-white"
              >
                Start Now →
              </Button>
            </div>
          </Card>
        );
      })}

      {interventions.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          📬 {interventions.length} recommendation{interventions.length > 1 ? 's' : ''} for your day
        </p>
      )}
    </div>
  );
};

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export default MicroInterventions;
