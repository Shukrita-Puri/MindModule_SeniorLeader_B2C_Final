// Dialogue Room - Coaching Intervention Toast Component

import React from 'react';
import { X, TrendingUp, Quote } from 'lucide-react';
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
  personality: 'supportive' | 'challenging' | 'minimal';
  onDismiss: () => void;
}

export default function CoachingToaster({
  intervention,
  personality,
  onDismiss
}: CoachingToasterProps) {
  const getPersonalityLabel = () => {
    switch (personality) {
      case 'supportive':
        return 'Supportive';
      case 'challenging':
        return 'Challenging';
      case 'minimal':
        return 'Minimal';
    }
  };

  const formatSkillName = (skill: string) => {
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
    <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-gradient-to-br from-slate-50 to-stone-100 dark:from-slate-900 dark:to-stone-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-5 animate-in slide-in-from-bottom-5 z-50">
      {/* Header with Close Button */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {/* Coach Title */}
          <h3 className="text-sm font-bold tracking-wide text-slate-800 dark:text-slate-100 uppercase">
            MIND MASTERY COACH
          </h3>
          <div className="h-px bg-slate-300 dark:bg-slate-600 mt-1 mb-2" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({getPersonalityLabel()})
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mt-1 -mr-1 hover:bg-slate-200 dark:hover:bg-slate-700"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Meta Skill Badge */}
      <div className="flex items-center gap-2 mb-4 text-xs text-slate-600 dark:text-slate-400">
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
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          {formatObservation(intervention.observation)}
        </p>
      </div>

      {/* Action Box */}
      <div className="p-3 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-700/30 rounded-lg mb-3">
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
          Suggested Action
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 italic mb-2">
          Try this in your next response:
        </p>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {intervention.action}
        </p>
      </div>

      {/* Framework / Model / Memory (Optional) */}
      {intervention.wisdomQuote && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
            Framework / Model
          </p>
          <div className="flex items-start gap-2">
            <Quote className="w-3 h-3 mt-1 text-slate-400 dark:text-slate-500 flex-shrink-0" />
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {intervention.wisdomQuote}
              {intervention.framework && (
                <span className="font-medium text-slate-700 dark:text-slate-200"> — {intervention.framework}</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
