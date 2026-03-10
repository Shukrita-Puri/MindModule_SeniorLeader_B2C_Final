import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { ChatCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCoachConversation } from '@/hooks/useCoachConversation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import FloatingNavigation from '@/components/navigation/FloatingNavigation';
import PracticeQueueProgress from '@/components/PracticeQueueProgress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getTodayRitual, upsertRitual, updateRitualCompletion } from '@/utils/dailyRituals';
import CoachSplitView from '@/components/coach/CoachSplitView';
import { isLikelyGibberish, getGibberishPrompt } from '@/utils/inputValidation';
import { useCoachAccess } from '@/hooks/useCoachAccess';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';

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
    sessionId,
    setFlowType,
    setPracticeContext,
    restoreMessages 
  } = useCoachConversation();
  const [inputMessage, setInputMessage] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

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
      if (messages.length > 0) return;
      
      try {
        // Use edge function to fetch messages (bypasses RLS)
        const accessToken = (await import('@/services/authTokenService')).getAuthToken();
        const token = await accessToken;
        
        if (!token) {
          console.warn('[SelfMasteryCoach] No auth token for session restore');
          return;
        }

        const { data, error } = await supabase.functions.invoke('dialogue-data-persist', {
          headers: { Authorization: `Bearer ${token}` },
          body: {
            type: 'fetch_messages',
            sessionId: locationState.previousSessionId,
          }
        });
        
        if (error) {
          console.error('Failed to fetch session messages:', error);
          return;
        }
        
        const sessionMessages = data?.messages;
        if (sessionMessages && sessionMessages.length > 0) {
          const restoredMessages = sessionMessages.map((m: any) => ({
            id: crypto.randomUUID(),
            role: m.sender_type as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.timestamp || Date.now())
          }));
          restoreMessages(restoredMessages, locationState.previousSessionId);
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

  // Get contextual AI greeting
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
    
    localStorage.setItem('queueIndex', String(currentQueueIndex + 1));
    
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

  // Mark coach practice as complete
  const markCoachComplete = async () => {
    try {
      const coachId = flowType === 'integrate' ? 'coach-integrate' : 'coach-prepare';
      await updateRitualCompletion('micro_exercise', coachId, practiceQueue.length > 0 ? practiceQueue : undefined);
    } catch (error) {
      console.error('[SelfMasteryCoach] Failed to mark coach complete:', error);
    }
  };

  const handleQueueComplete = async () => {
    if (isInQueue && flowType) {
      if (messages.length === 0) {
        toast.info('Have a conversation with your coach first before marking complete.');
        return;
      }
      await markCoachComplete();
    }
    
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

  useEffect(() => {
    if (flowType && !hasInitialized && messages.length === 0) {
      setHasInitialized(true);
    }
  }, [flowType, hasInitialized, messages.length]);

  // Persist sessionId immediately so ProtocolCard can read it even before messages arrive
  useEffect(() => {
    if (sessionId) {
      sessionStorage.setItem('coachSessionId', sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && messages.length > 0) {
      sessionStorage.setItem('coachSessionMessages', JSON.stringify(messages));
    }
  }, [sessionId, messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;
    
    // Client-side gibberish detection
    if (isLikelyGibberish(inputMessage)) {
      setInputError(getGibberishPrompt());
      return;
    }
    
    setInputError(null);
    const message = inputMessage;
    setInputMessage('');
    await sendMessage(message);
  };
  
  const handleInputChange = (value: string) => {
    setInputMessage(value);
    // Clear error when user starts typing new content
    if (inputError && value.length > 3) {
      setInputError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleBackNavigation = async () => {
    if (flowType && messages.length > 0) {
      await markCoachComplete();
    }
    if (messages.length > 0) {
      await endSession();
    }
    navigate('/executive-home');
  };

  const handleNewChat = async () => {
    if (flowType && messages.length > 0) {
      await markCoachComplete();
    }
    await endSession();
  };

  const handleEndSession = async () => {
    if (flowType && messages.length > 0) {
      await markCoachComplete();
    }
    await endSession();
    navigate('/executive-home');
  };

  const handleVoiceToggle = () => {
    setIsVoiceMode(!isVoiceMode);
    // Voice mode implementation will be added in future
  };

  return (
    <div className="relative flex flex-col h-screen bg-gradient-to-b from-amber-50/40 via-stone-50 to-rose-50/30 dark:bg-background animate-page-enter overflow-hidden">
      {/* Header Navigation */}
      <FloatingNavigation 
        showCoachButton={false}
        rightContent={
          messages.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewChat}
                  className="h-10 w-10 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg shadow-black/20"
                >
                  <ChatCircle size={20} weight="duotone" className="text-saffron" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>New conversation</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="w-10" />
          )
        }
      />

      {/* Queue Progress */}
      {isInQueue && practiceQueue.length > 1 && messages.length === 0 && (
        <div className="relative z-10 mx-4 mt-2">
          <div className="bg-neutral-900/90 backdrop-blur-lg rounded-xl border border-white/10 overflow-hidden shadow-lg">
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

      {/* Performance Plan Indicator */}
      {isInQueue && messages.length === 0 && (
        <div className="relative z-10 flex justify-center mt-4 px-4">
          <div className="bg-saffron/10 border border-saffron/20 rounded-lg px-4 py-2 max-w-sm">
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
        </div>
      )}

      {/* Main Content - Split Screen Layout */}
      <div className="flex-1 min-h-0">
        <CoachSplitView
          messages={messages}
          isLoading={isLoading}
          inputValue={inputMessage}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          onVoiceToggle={handleVoiceToggle}
          onEndSession={handleEndSession}
          isVoiceMode={isVoiceMode}
          firstName={firstName}
          contextualGreeting={
            flowType === 'guided-reflection' && practiceTitle
              ? `Let's walk through ${practiceTitle} together.`
              : flowType 
                ? getContextualGreeting(flowType, locationState?.eventTitle)
                : "I'm your self-mastery coach. Share what's on your mind, and let's explore it together."
          }
          promptSuggestions={getFlowPrompts(flowType, locationState?.eventTitle)}
          onPromptClick={sendMessage}
          inputError={inputError}
        />
      </div>

      {/* Error Display with Retry */}
      {(error || isRateLimited) && (
        <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-muted/95 backdrop-blur-lg border-t border-border z-20">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
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
    </div>
  );
};

export default SelfMasteryCoach;
