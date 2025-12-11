// Dialogue Room - Main Conversation Interface

import React, { useState, useRef, useEffect } from 'react';
import { useDialogueSession, SessionConfig } from '@/hooks/useDialogueSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, Clock, MessageSquare, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import CoachingToaster from './CoachingToaster';

interface DialogueInterfaceProps {
  scenarioId: string;
  personaId: string;
  coachPersonality?: 'supportive' | 'challenging' | 'minimal';
  personalityStyle?: string;
  voiceStyle?: string;
  additionalContext?: string;
  attachments?: Array<{ name: string; type: string; content?: string }>;
  practiceDuration?: number;
  coachingStyle?: 'supportive' | 'challenging' | 'minimal';
  onEndSession?: () => void;
}

export default function DialogueInterface({
  scenarioId,
  personaId,
  coachPersonality = 'supportive',
  personalityStyle,
  voiceStyle,
  additionalContext,
  attachments,
  practiceDuration,
  coachingStyle,
  onEndSession
}: DialogueInterfaceProps) {
  const {
    sessionId,
    messages,
    interventions,
    isLoading,
    error,
    sessionStatus,
    durationSeconds,
    personaName,
    personaRole,
    scenarioTitle,
    startSession,
    sendMessage,
    endSession
  } = useDialogueSession();

  const [inputValue, setInputValue] = useState('');
  const [showIntervention, setShowIntervention] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-start session on mount with full config
  useEffect(() => {
    if (!sessionId && sessionStatus === 'idle') {
      const config: SessionConfig = {
        personalityStyle,
        voiceStyle,
        additionalContext,
        attachments,
        practiceDuration,
        coachingStyle: coachingStyle || coachPersonality
      };
      startSession(scenarioId, personaId, coachPersonality, config);
    }
  }, [sessionId, sessionStatus, scenarioId, personaId, coachPersonality, personalityStyle, voiceStyle, additionalContext, attachments, startSession]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show intervention toast when new intervention arrives
  useEffect(() => {
    if (interventions.length > 0) {
      setShowIntervention(true);
    }
  }, [interventions.length]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    const message = inputValue;
    setInputValue('');
    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEndSession = () => {
    endSession();
    onEndSession?.();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const latestIntervention = interventions[interventions.length - 1];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <h2 className="font-semibold text-foreground">{scenarioTitle}</h2>
          <p className="text-sm text-muted-foreground">Speaking with {personaRole || personaName}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            {formatDuration(durationSeconds)}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MessageSquare className="w-4 h-4" />
            {messages.length}
          </div>
          {attachments && attachments.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Paperclip className="w-4 h-4" />
              {attachments.length}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleEndSession}>
            End Session
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : message.role === 'coach'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-800'
                  : 'bg-muted text-foreground'
              }`}
            >
              {message.role !== 'user' && (
                <p className="text-xs font-medium mb-1 opacity-70">
                  {message.role === 'coach' ? '🎯 Coach' : personaRole || personaName}
                  {message.emotion && ` • ${message.emotion}`}
                </p>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your response..."
            disabled={isLoading || sessionStatus !== 'active'}
            className="flex-1"
          />
          <Button 
            onClick={handleSend} 
            disabled={!inputValue.trim() || isLoading || sessionStatus !== 'active'}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Coaching Intervention Toast */}
      {showIntervention && latestIntervention && (
        <CoachingToaster
          intervention={latestIntervention}
          onDismiss={() => setShowIntervention(false)}
        />
      )}
    </div>
  );
}
