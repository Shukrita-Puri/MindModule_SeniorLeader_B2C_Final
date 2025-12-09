// Dialogue Room - Coaching Intervention Toast Component

import React from 'react';
import { X, Lightbulb, TrendingUp, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Intervention {
  id: string;
  observation: string;
  metaSkill: string;
  subSkill: string;
  action: string;
  framework?: string;
  wisdomQuote?: string;
}

interface CoachingToasterProps {
  intervention: Intervention;
  personality: 'supportive' | 'challenging' | 'direct';
  onDismiss: () => void;
}

export default function CoachingToaster({
  intervention,
  personality,
  onDismiss
}: CoachingToasterProps) {
  const getPersonalityStyle = () => {
    switch (personality) {
      case 'supportive':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-900/20',
          border: 'border-emerald-200 dark:border-emerald-800',
          icon: '💚',
          label: 'Supportive Coach'
        };
      case 'challenging':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          icon: '🔥',
          label: 'Challenging Coach'
        };
      case 'direct':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: '⚡',
          label: 'Direct Coach'
        };
    }
  };

  const style = getPersonalityStyle();

  const formatSkillName = (skill: string) => {
    return skill
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className={`fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-96 ${style.bg} ${style.border} border rounded-xl shadow-lg p-4 animate-in slide-in-from-bottom-5 z-50`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{style.icon}</span>
          <span className="text-xs font-medium text-muted-foreground">
            {style.label}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Skill Badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-background/50 rounded-full text-xs font-medium">
          <TrendingUp className="w-3 h-3" />
          {formatSkillName(intervention.metaSkill)}
        </span>
        <span className="text-xs text-muted-foreground">
          → {formatSkillName(intervention.subSkill)}
        </span>
      </div>

      {/* Observation */}
      <div className="mb-3">
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-foreground leading-relaxed">
            {intervention.observation}
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="p-3 bg-background/50 rounded-lg mb-3">
        <p className="text-sm font-medium text-foreground">
          💡 {intervention.action}
        </p>
      </div>

      {/* Wisdom Quote */}
      {intervention.wisdomQuote && (
        <div className="flex items-start gap-2 pt-2 border-t border-border/50">
          <Quote className="w-3 h-3 mt-1 text-muted-foreground flex-shrink-0" />
          <p className="text-xs italic text-muted-foreground">
            {intervention.wisdomQuote}
            {intervention.framework && (
              <span className="not-italic font-medium"> — {intervention.framework}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
