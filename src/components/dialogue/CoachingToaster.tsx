// Dialogue Room - Coaching Intervention Toast Component

import React from 'react';
import { X, TrendingUp, Quote, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Intervention {
  id: string;
  observation: string;
  metaSkill: string;
  subSkill: string;
  action: string;
  framework?: string;
  wisdomQuote?: string;
  frameworkApplication?: string;
  displayedAt?: string;
  dbId?: string;
}

interface CoachingToasterProps {
  intervention: Intervention;
  onDismiss: () => void;
  onAcknowledge?: () => void;
}

export default function CoachingToaster({
  intervention,
  onDismiss,
  onAcknowledge
}: CoachingToasterProps) {
  const formatSkillName = (skill: string | undefined) => {
    if (!skill) return 'General Skill';
    return skill
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Transform "The user stated..." to "You said..."
  const formatObservation = (text: string) => {
    return text
      .replace(/The user stated/gi, 'You said')
      .replace(/the user stated/gi, 'you said')
      .replace(/The user said/gi, 'You said')
      .replace(/the user said/gi, 'you said');
  };

  return (
    <div className="fixed bottom-32 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[420px] max-h-[70vh] overflow-y-auto bg-gradient-to-br from-taupe/5 to-card border border-taupe/20 rounded-xl shadow-xl p-5 animate-in slide-in-from-bottom-5 z-50">
      {/* Header with Close Button */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {/* Coach Title */}
          <h3 className="text-sm font-bold tracking-wide text-foreground uppercase">
            MIND MASTERY COACH
          </h3>
          <div className="h-px bg-taupe/30 mt-1" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mt-1 -mr-1 hover:bg-taupe/10"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Meta Skill Badge */}
      <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
        <span className="font-medium">Meta Skill Practiced:</span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {formatSkillName(intervention.metaSkill)}
        </span>
        <span>→</span>
        <span>{formatSkillName(intervention.subSkill)}</span>
      </div>

      {/* Observation */}
      <div className="mb-4">
        <p className="text-sm text-foreground leading-relaxed">
          {formatObservation(intervention.observation)}
        </p>
      </div>

      {/* Action Box */}
      <div className="p-3 bg-taupe/10 border border-taupe/20 rounded-lg mb-3">
        <p className="text-xs font-medium text-taupe-rich uppercase tracking-wide mb-1">
          Suggested Action
        </p>
        <p className="text-xs text-muted-foreground italic mb-2">
          Try this in your next response:
        </p>
        <p className="text-sm text-foreground leading-relaxed">
          {intervention.action}
        </p>
      </div>

      {/* Framework / Model Section - Visual Card Layout */}
      {intervention.wisdomQuote && (
        <div className="pt-3 border-t border-taupe/20 mb-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Framework / Model
          </p>
          
          {/* Visual Card: Icon Left + Content Right */}
          <div className="flex gap-3 bg-taupe/5 rounded-xl p-3 border border-taupe/10">
            {/* Left: Small illustrative icon with subtle taupe background */}
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br from-taupe-highlight/30 to-taupe/20 flex items-center justify-center border border-taupe/15">
              <BookOpen className="w-5 h-5 text-taupe-rich" />
            </div>
            
            {/* Right: Framework Content */}
            <div className="flex-1 min-w-0">
              {/* Framework Name */}
              {intervention.framework && (
                <h4 className="font-semibold text-sm text-foreground mb-1">
                  {intervention.framework}
                </h4>
              )}
              
              {/* Application Context */}
              {intervention.frameworkApplication && (
                <p className="text-xs text-muted-foreground mb-2 leading-relaxed line-clamp-3">
                  {intervention.frameworkApplication}
                </p>
              )}
              
              {/* Wisdom Quote */}
              <div className="flex items-start gap-1.5">
                <Quote className="w-3 h-3 mt-0.5 text-taupe flex-shrink-0" />
                <p className="text-xs text-foreground/80 italic line-clamp-2">
                  "{intervention.wisdomQuote}"
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-3 border-t border-taupe/20">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs border-taupe/30 hover:bg-taupe/10"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
        {onAcknowledge && (
          <Button
            size="sm"
            className="flex-1 text-xs bg-taupe hover:bg-taupe-rich text-taupe-foreground"
            onClick={onAcknowledge}
          >
            Got it, I'll try this
          </Button>
        )}
      </div>
    </div>
  );
}
