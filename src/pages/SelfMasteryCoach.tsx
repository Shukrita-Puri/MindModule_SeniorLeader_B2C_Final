import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCoachConversation } from '@/hooks/useCoachConversation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import FloatingNavigation from '@/components/navigation/FloatingNavigation';
import PracticeQueueProgress from '@/components/PracticeQueueProgress';
import { toast } from 'sonner';
import { parseMessageContent } from '@/utils/messageParser';
import { matchProtocolById, matchProtocolByPartialId } from '@/utils/protocolMatcher';
import { getWisdom } from '@/data/wisdomContent';
import ProtocolCard from '@/components/chat/ProtocolCard';
import WisdomCard from '@/components/chat/WisdomCard';
import { supabase } from '@/integrations/supabase/client';

interface PracticeStep {
  title: string;
  instruction: string;
  duration?: number;
}

interface LocationState {
  initialPrompt?: string;
  flowType?: 'prepare' | 'integrate' | 'guided-reflection';
  practiceTitle?: string;
  practiceSteps?: PracticeStep[];
  fromIntervention?: boolean;
  eventTitle?: string;
  fromRitual?: boolean;
  resumeSession?: boolean;
  previousSessionId?: string;
}

interface QueuedPractice {
  id: string;
  title: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice' | 'coach';
  category: string;
  duration: number;
}

const SelfMasteryCoach = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const { user } = useAuth();
  const { 
    messages, 
    isLoading, 
    error, 
    isRateLimited,
    sendMessage, 
    retryLastMessage,
    clearConversation, 
    endSession, 
    setFlowType,
    setPracticeContext,
    restoreMessages 
  } = useCoachConversation();
  const [inputMessage, setInputMessage] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Queue state
  const [practiceQueue, setPracticeQueue] = useState<QueuedPractice[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [isInQueue, setIsInQueue] = useState(false);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const flowType = locationState?.flowType;
  const initialPrompt = locationState?.initialPrompt;
  const practiceTitle = locationState?.practiceTitle;
  const practiceSteps = locationState?.practiceSteps;

  // Load queue from localStorage
  useEffect(() => {
    const queue = localStorage.getItem('practiceQueue');
    const fromRitual = locationState?.fromRitual;
    
    if (queue && fromRitual) {
      try {
        const parsed = JSON.parse(queue) as QueuedPractice[];
        setPracticeQueue(parsed);
        // Find coach index (could be 'coach-integrate' or 'coach-prepare')
        const index = parsed.findIndex((p) => 
          p.contentType === 'coach' || p.id?.startsWith('coach-')
        );
        if (index !== -1) {
          setCurrentQueueIndex(index);
          setIsInQueue(true);
        }
      } catch (e) {
        console.error('Error parsing practice queue:', e);
      }
    }
  }, [locationState?.fromRitual]);

  // Restore previous session if navigating from Recent Activity
  useEffect(() => {
    const loadPreviousSession = async () => {
      if (!locationState?.resumeSession || !locationState?.previousSessionId) return;
      if (messages.length > 0) return; // Don't restore if already has messages
      
      try {
        const { data: sessionMessages, error } = await supabase
          .from('dialogue_messages')
          .select('sender_type, content, message_index, timestamp')
          .eq('session_id', locationState.previousSessionId)
          .order('message_index', { ascending: true });
        
        if (error) {
          console.error('Failed to fetch session messages:', error);
          return;
        }
        
        if (sessionMessages && sessionMessages.length > 0) {
          const restoredMessages = sessionMessages.map(m => ({
            id: crypto.randomUUID(),
            role: m.sender_type as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.timestamp || Date.now())
          }));
          restoreMessages(restoredMessages, locationState.previousSessionId);
          console.log('[SelfMasteryCoach] Restored session:', locationState.previousSessionId);
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
      }
    };
    loadPreviousSession();
  }, [locationState?.resumeSession, locationState?.previousSessionId, messages.length, restoreMessages]);
  
  // Set flow type and practice context
  useEffect(() => {
    if (flowType) {
      setFlowType(flowType);
    }
    if (flowType === 'guided-reflection' && practiceTitle && practiceSteps) {
      setPracticeContext(practiceTitle, practiceSteps);
    }
    return () => setFlowType(null);
  }, [flowType, setFlowType, practiceTitle, practiceSteps, setPracticeContext]);

  // Get subtitle based on flow type
  const getSubtitle = () => {
    if (flowType === 'prepare') return 'Pre-performance preparation';
    if (flowType === 'integrate') return 'Evening reflection';
    if (flowType === 'guided-reflection' && practiceTitle) return practiceTitle;
    return 'Your personal executive coach';
  };

  // Get contextual AI greeting based on flow type (instead of auto-sending as user)
  const getContextualGreeting = (flow: string, eventTitle?: string): string => {
    if (flow === 'prepare') {
      if (eventTitle) {
        return `I see you have "${eventTitle}" coming up. Let's get you ready.\n\nWhat would be most helpful right now - a quick grounding moment, some mental rehearsal, or just talking through what's on your mind?`;
      }
      return `Ready to prepare for what's ahead.\n\nWhat would be most helpful - grounding, mental rehearsal, or talking through your approach?`;
    }
    if (flow === 'integrate') {
      return `Let's close out the day together. Take a breath.\n\nWhen you're ready, share one thing you did right today - it doesn't have to be big.`;
    }
    return `What's on your mind?`;
  };

  // Get flow-specific prompt suggestions
  const getFlowPrompts = (flow: string | undefined, eventTitle?: string): string[] => {
    if (flow === 'prepare') {
      return eventTitle 
        ? [
            `Walk me through preparing for "${eventTitle}"`,
            "Let's do a quick grounding exercise first",
            "Help me visualize this going well"
          ]
        : [
            "I have something important coming up",
            "Let's do a quick grounding exercise",
            "Help me visualize success"
          ];
    }
    if (flow === 'integrate') {
      return [
        "Here's one thing I did right today",
        "I'm ready to close out the day",
        "Help me let go of today's stress"
      ];
    }
    if (flow === 'guided-reflection') {
      return [
        "I'm ready to begin the reflection",
        "Let's start with reviewing my day",
        "Guide me through each step"
      ];
    }
    // Default prompts
    return [
      "I'm feeling overwhelmed with my workload",
      "How can I be more present in meetings?",
      "I'm struggling with a difficult conversation"
    ];
  };

  // Queue navigation handlers
  const navigateToNext = () => {
    const next = practiceQueue[currentQueueIndex + 1];
    if (!next) return;
    
    if (next.contentType === 'soundbath') {
      navigate(`/soundscapes/${next.id}`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'guided-practice') {
      navigate(`/guided-practices/${next.id}`, { state: { category: next.category, fromRitual: true } });
    } else if (next.contentType === 'micro-practice') {
      navigate(`/micro-practice/${next.id}/cards`, { state: { category: next.category, fromRitual: true } });
    }
  };

  const handleQueueSkip = () => {
    if (currentQueueIndex < practiceQueue.length - 1) {
      navigateToNext();
    } else {
      // Last practice - skip means exit without completing
      localStorage.removeItem('practiceQueue');
      navigate('/executive-home');
    }
  };

  const handleQueuePause = async () => {
    if (messages.length > 0) {
      await endSession();
    }
    navigate('/executive-home');
  };

  const handleQueueComplete = async () => {
    if (messages.length > 0) {
      await endSession();
    }
    
    const isLastPractice = currentQueueIndex === practiceQueue.length - 1;
    
    if (isLastPractice) {
      localStorage.removeItem('practiceQueue');
      toast.success('🎉 Ritual complete!');
      navigate('/executive-home');
    } else {
      navigateToNext();
    }
  };

  // Add AI greeting when entering from Performance Plan (instead of sending as user message)
  useEffect(() => {
    if (flowType && !hasInitialized && messages.length === 0) {
      setHasInitialized(true);
      // Don't send as user - this will be shown as the empty state greeting
    }
  }, [flowType, hasInitialized, messages.length]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;
    
    const message = inputMessage;
    setInputMessage('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleBackNavigation = async () => {
    if (messages.length > 0) {
      await endSession();
    }
    navigate('/executive-home');
  };

  const handleNewChat = async () => {
    await endSession();
  };

return (
    <div className="flex flex-col h-screen bg-background animate-page-enter">
      {/* Header with Navigation - scrolls with content */}
      <FloatingNavigation 
        showCoachButton={false}
        centerContent={
          messages.length > 0 ? (
            <div className="flex flex-col items-center">
              <span className="text-sm font-headline text-foreground">Self Mastery Coach</span>
              <span className="text-xs text-muted-foreground font-body">{getSubtitle()}</span>
            </div>
          ) : null
        }
        rightContent={
          messages.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              className="text-muted-foreground hover:text-foreground text-xs bg-muted/50 backdrop-blur-sm border border-border rounded-full px-3"
            >
              New Chat
            </Button>
          ) : (
            <div className="w-16" />
          )
        }
      />

      {/* Queue Progress - inline before hero when in queue */}
      {isInQueue && practiceQueue.length > 1 && messages.length === 0 && (
        <div className="mx-4 mt-2">
          <div className="bg-charcoal/95 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden shadow-lg">
            <PracticeQueueProgress
              currentIndex={currentQueueIndex}
              totalCount={practiceQueue.length}
              queue={practiceQueue}
              onSkip={handleQueueSkip}
              onPause={handleQueuePause}
              onComplete={handleQueueComplete}
              inline={true}
            />
          </div>
        </div>
      )}

      {/* Hero Title - only on greeting screen (matches Recalibrate Studio) */}
      {messages.length === 0 && (
        <div className="relative h-auto py-8 overflow-hidden">
          {/* Subtle ambient gradient background */}
          <div className="absolute inset-0 bg-gradient-to-b from-saffron/5 via-taupe/3 to-transparent" />
          <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-3">
            <h1 className="text-5xl font-headline mb-2 text-foreground tracking-tight">
              Self Mastery Coach
            </h1>
            <p className="text-lg font-subheadline italic text-muted-foreground">
              {getSubtitle()}
            </p>
            
            {/* Performance Plan Connection Indicator */}
            {isInQueue && (
              <div className="bg-saffron/10 border border-saffron/20 rounded-lg px-4 py-2 mt-2 max-w-sm">
                <p className="text-xs text-center">
                  <span className="font-medium text-saffron">Part of Today's Performance Plan</span>
                  <br/>
                  <span className="text-muted-foreground">
                    {flowType === 'prepare' ? 'Pre-performance mental rehearsal' : 
                     flowType === 'integrate' ? 'Evening reflection & closure' : 
                     'Personalized coaching session'}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className={cn(
            "flex flex-col items-center px-6 text-center pt-4",
            isInQueue && practiceQueue.length > 1 && "pt-8"
          )}>
            {/* Premium SM monogram visual */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-saffron/20 via-taupe/10 to-transparent flex flex-col items-center justify-center mb-6 border border-saffron/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,140,66,0.15)_0%,transparent_70%)]" />
              <span className="text-2xl font-headline text-saffron tracking-tight leading-none relative z-10">SM</span>
              <span className="text-[7px] uppercase tracking-[0.15em] text-muted-foreground/70 mt-0.5 relative z-10">Coach</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-headline text-foreground tracking-tight mb-2">
              Hello, {firstName}
            </h2>
            <p className="text-muted-foreground max-w-sm mb-8 whitespace-pre-line">
              {flowType === 'guided-reflection' && practiceTitle
                ? `Let's walk through ${practiceTitle} together.`
                : flowType 
                  ? getContextualGreeting(flowType, locationState?.eventTitle)
                  : "I'm your self-mastery coach. Share what's on your mind, and let's explore it together."
              }
            </p>
            <div className="grid gap-2 w-full max-w-sm">
              {getFlowPrompts(flowType, locationState?.eventTitle).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-left px-4 py-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-sm text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron/20 via-taupe/10 to-transparent flex flex-col items-center justify-center flex-shrink-0 border border-saffron/20">
                    <span className="text-xs font-headline text-saffron leading-none">SM</span>
                  </div>
                )}
                {message.role === 'user' ? (
                  <>
                    <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-primary text-primary-foreground">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 via-slate-100 to-white flex items-center justify-center flex-shrink-0 border border-slate-200/50">
                      <span className="text-xs font-headline text-slate-600 leading-none">
                        {firstName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="max-w-[85%] space-y-3">
                    {/* Parse message for embedded content */}
                    {(() => {
                      const parsed = parseMessageContent(message.content);
                      return (
                        <>
                          {/* Text content */}
                          {parsed.text && (
                            <div className="px-4 py-3 rounded-2xl bg-muted text-foreground">
                              <p className="text-sm whitespace-pre-wrap">{parsed.text}</p>
                            </div>
                          )}
                          
                          {/* Protocol cards */}
                          {parsed.protocols.map((p, idx) => {
                            const matched = matchProtocolById(p.id) || matchProtocolByPartialId(p.id);
                            if (!matched) return null;
                            return (
                              <ProtocolCard
                                key={`${p.id}-${idx}`}
                                id={matched.id}
                                type={p.type}
                                title={matched.title}
                                duration={matched.duration}
                                thumbnail={matched.thumbnail}
                                contentType={matched.contentType}
                                storyHook={matched.storyHook}
                              />
                            );
                          })}
                          
                          {/* Wisdom cards */}
                          {parsed.wisdom.map((w, idx) => {
                            const wisdom = getWisdom(w.fullKey);
                            if (!wisdom) return null;
                            return (
                              <WisdomCard
                                key={`${w.fullKey}-${idx}`}
                                quote={wisdom.quote}
                                attribution={wisdom.attribution}
                                context={wisdom.context}
                              />
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron/20 via-taupe/10 to-transparent flex flex-col items-center justify-center flex-shrink-0 border border-saffron/20">
                  <span className="text-xs font-headline text-saffron leading-none">SM</span>
                </div>
                <div className="px-4 py-3 rounded-2xl bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Display with Retry for Rate Limiting */}
      {(error || isRateLimited) && (
        <div className="px-4 py-3 bg-muted/80 border-t border-border">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {isRateLimited 
                ? "The coach is taking a moment. Please wait a few seconds and try again."
                : error}
            </p>
            {isRateLimited && (
              <Button
                variant="outline"
                size="sm"
                onClick={retryLastMessage}
                disabled={isLoading}
                className="flex items-center gap-2 text-xs shrink-0"
              >
                <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border p-4 bg-background">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="Message your coach..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[52px] max-h-[200px] pr-12 resize-none rounded-2xl border-border focus:border-primary bg-muted/50"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputMessage.trim() || isLoading}
              className="absolute right-2 bottom-2 h-8 w-8 rounded-full bg-primary hover:bg-primary/90"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SelfMasteryCoach;
