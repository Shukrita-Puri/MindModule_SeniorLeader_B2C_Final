import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCoachConversation } from '@/hooks/useCoachConversation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

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
    sendMessage, 
    clearConversation, 
    endSession, 
    setFlowType,
    setPracticeContext 
  } = useCoachConversation();
  const [inputMessage, setInputMessage] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const flowType = locationState?.flowType;
  const initialPrompt = locationState?.initialPrompt;
  const practiceTitle = locationState?.practiceTitle;
  const practiceSteps = locationState?.practiceSteps;
  
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
    <div className="flex flex-col h-screen bg-background pt-14">
      {/* Floating Navigation - Matches Homepage */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-3 md:px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBackNavigation}
          className="h-9 w-9 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-headline text-white/90">Self Mastery Coach</span>
          <span className="text-xs text-white/60 font-body">{getSubtitle()}</span>
        </div>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            className="text-white/70 hover:text-white text-xs bg-black/50 backdrop-blur-sm border border-white/10 rounded-full px-3"
          >
            New Chat
          </Button>
        ) : (
          <div className="w-16" /> /* Spacer for alignment */
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
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
                <div
                  className={cn(
                    'max-w-[80%] px-4 py-3 rounded-2xl',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                {/* User avatar with initial */}
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 via-slate-100 to-white flex items-center justify-center flex-shrink-0 border border-slate-200/50">
                    <span className="text-xs font-headline text-slate-600 leading-none">
                      {firstName.charAt(0).toUpperCase()}
                    </span>
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

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm text-center">
          {error}
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