/**
 * MomentCard - Context-First UI for Micro Self-Recalibration v2
 * Shows a single moment with pack steps and quick actions
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Brain, 
  Wind, 
  Users,
  Zap,
  Shield,
  Coffee,
  Moon,
  Sun,
  BookOpen,
  Sparkles,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MomentCandidate } from '@/utils/momentDetectionEngine';
import type { BuiltPack, PackStep } from '@/utils/packBuilderSystem';

interface MomentCardProps {
  moment: MomentCandidate;
  pack: BuiltPack;
  isExpanded?: boolean;
  onStartPack: () => void;
  onStartStep: (step: PackStep) => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
}

// Get icon for moment type
function getMomentIcon(momentType: string) {
  switch (momentType) {
    case 'pre-performance':
      return <Zap className="w-4 h-4" />;
    case 'advance-preparation':
      return <BookOpen className="w-4 h-4" />;
    case 'pre-social':
      return <Users className="w-4 h-4" />;
    case 'energy-protection':
      return <Shield className="w-4 h-4" />;
    case 'schedule-overload':
      return <Calendar className="w-4 h-4" />;
    case 'between-events':
      return <Coffee className="w-4 h-4" />;
    case 'end-of-day':
      return <Moon className="w-4 h-4" />;
    case 'morning-prep':
      return <Sun className="w-4 h-4" />;
    default:
      return <Zap className="w-4 h-4" />;
  }
}

// Get icon for step type
function getStepIcon(stepType: string) {
  switch (stepType) {
    case 'mindset':
      return <Brain className="w-4 h-4" />;
    case 'somatic':
      return <Wind className="w-4 h-4" />;
    case 'roleplay':
      return <Users className="w-4 h-4" />;
    default:
      return <Zap className="w-4 h-4" />;
  }
}

// Get confidence color
function getConfidenceColor(confidence: string) {
  switch (confidence) {
    case 'high':
      return 'bg-green-500/20 text-green-700 dark:text-green-400';
    case 'medium':
      return 'bg-amber-500/20 text-amber-700 dark:text-amber-400';
    case 'low':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// Get mastery label
function getMasteryLabel(focus: 'self' | 'social' | 'both') {
  switch (focus) {
    case 'self':
      return 'Self Mastery';
    case 'social':
      return 'Social Mastery';
    case 'both':
      return 'Self + Social Mastery';
  }
}

export default function MomentCard({
  moment,
  pack,
  isExpanded: initialExpanded = false,
  onStartPack,
  onStartStep,
  onSnooze,
  onDismiss
}: MomentCardProps) {
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  
  const requiredSteps = pack.steps.filter(s => !s.is_optional);
  const optionalSteps = pack.steps.filter(s => s.is_optional);
  
  const isAdvancePrep = moment.moment_type === 'advance-preparation';
  const hasRoleplay = pack.steps.some(s => s.step_type === 'roleplay');
  
  return (
    <Card className="overflow-hidden border-border bg-card">
      {/* Header - Event Context */}
      <div className="p-4 pb-3 border-b border-border/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Moment Label + Type Badges */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge 
                variant="secondary" 
                className="text-xs font-medium px-2 py-0.5"
              >
                {moment.label}
              </Badge>
              {isAdvancePrep && (
                <Badge 
                  variant="outline" 
                  className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                >
                  <BookOpen className="w-3 h-3 mr-1" />
                  Practice
                </Badge>
              )}
              {hasRoleplay && (
                <Badge 
                  variant="outline" 
                  className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Role-Play
                </Badge>
              )}
              <Badge 
                variant="outline" 
                className={cn("text-xs px-2 py-0.5", getConfidenceColor(moment.confidence))}
              >
                {moment.confidence === 'high' ? 'Strong Match' : 
                 moment.confidence === 'medium' ? 'Good Match' : 'Suggested'}
              </Badge>
            </div>
            
            {/* Event Title */}
            {moment.event_context && (
              <h3 className="font-semibold text-foreground text-base line-clamp-1">
                {moment.event_context.event_title}
              </h3>
            )}
            
            {/* Pack Name */}
            <p className="text-sm text-muted-foreground mt-0.5">
              {pack.template_name}
            </p>
          </div>
          
          {/* Moment Icon */}
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            {getMomentIcon(moment.moment_type)}
          </div>
        </div>
        
        {/* Compact Reasoning (1 line) */}
        <div className="mt-3">
          <button
            onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            <span className={cn("flex-1", isReasoningExpanded ? "" : "line-clamp-1")}>
              {pack.why_now}
            </span>
            {isReasoningExpanded ? (
              <ChevronUp className="w-3 h-3 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            )}
          </button>
          
          {/* Expanded Reasoning */}
          {isReasoningExpanded && (
            <div className="mt-2 p-2 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground mb-2">
                <span className="font-medium">Detected signals:</span>
              </p>
              <ul className="space-y-1">
                {moment.signals.map((signal, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                    {signal.description}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {getMasteryLabel(pack.mastery_focus)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {pack.total_duration} min
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Pack Steps */}
      <div className="p-4 pt-3 space-y-2">
        {/* Required Steps */}
        {requiredSteps.map((step, idx) => (
          <button
            key={step.content.id}
            onClick={() => onStartStep(step)}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {getStepIcon(step.step_type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground line-clamp-1">
                {step.content.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {step.label} • {step.duration} min
              </p>
            </div>
          </button>
        ))}
        
        {/* Optional Steps */}
        {optionalSteps.length > 0 && (
          <div className="pt-1">
            <p className="text-xs text-muted-foreground mb-2">Optional:</p>
            {optionalSteps.map((step) => (
              <button
                key={step.content.id}
                onClick={() => onStartStep(step)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed border-border hover:bg-muted/30 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  {getStepIcon(step.step_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground/80 line-clamp-1">
                    {step.content.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {step.label} • {step.duration} min
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="px-4 pb-4 pt-2 border-t border-border/50">
        <div className="flex gap-2">
          {/* Primary Action */}
          <Button 
            onClick={onStartPack}
            className="flex-1 h-11"
          >
            {isAdvancePrep ? 'Start Practice' : 'Start Pack'}
            <span className="ml-1 text-xs opacity-80">({pack.total_duration} min)</span>
          </Button>
          
          {/* Quick Actions */}
          {requiredSteps[0] && !isAdvancePrep && (
            <Button
              variant="outline"
              onClick={() => onStartStep(requiredSteps[0])}
              className="h-11 px-3"
            >
              Just {requiredSteps[0].step_type === 'mindset' ? 'Mindset' : 
                    requiredSteps[0].step_type === 'roleplay' ? 'Practice' : 'Breathing'}
            </Button>
          )}
        </div>
        
        {/* Snooze / Dismiss */}
        <div className="flex items-center justify-between mt-3">
          <div className="relative">
            <button
              onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Snooze
            </button>
            {showSnoozeOptions && (
              <div className="absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-md shadow-md p-1 flex gap-1">
                <button
                  onClick={() => { onSnooze(15); setShowSnoozeOptions(false); }}
                  className="px-2 py-1 text-xs hover:bg-muted rounded"
                >
                  15m
                </button>
                <button
                  onClick={() => { onSnooze(30); setShowSnoozeOptions(false); }}
                  className="px-2 py-1 text-xs hover:bg-muted rounded"
                >
                  30m
                </button>
                <button
                  onClick={() => { onSnooze(60); setShowSnoozeOptions(false); }}
                  className="px-2 py-1 text-xs hover:bg-muted rounded"
                >
                  1h
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </Card>
  );
}
