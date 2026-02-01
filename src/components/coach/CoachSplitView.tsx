import { useRef, useEffect, useState } from 'react';
import { Send, Loader2, Mic, MicOff, ChevronUp, ChevronDown } from 'lucide-react';
import coachVisual from '@/assets/coach-visual.jpeg';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { parseMessageContent } from '@/utils/messageParser';
import { matchProtocolById, matchProtocolByPartialId } from '@/utils/protocolMatcher';
import { getWisdom } from '@/data/wisdomContent';
import ProtocolCard from '@/components/chat/ProtocolCard';
import WisdomCard from '@/components/chat/WisdomCard';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface CoachSplitViewProps {
  messages: Message[];
  isLoading: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onVoiceToggle?: () => void;
  onEndSession: () => void;
  isVoiceMode?: boolean;
  firstName: string;
  contextualGreeting: string;
  promptSuggestions: string[];
  onPromptClick: (prompt: string) => void;
  inputError?: string | null;
}

const CoachSplitView = ({
  messages,
  isLoading,
  inputValue,
  onInputChange,
  onSubmit,
  onKeyDown,
  onVoiceToggle,
  onEndSession,
  isVoiceMode = false,
  firstName,
  contextualGreeting,
  promptSuggestions,
  onPromptClick,
  inputError,
}: CoachSplitViewProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Auto-scroll coach section to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Get latest messages for display
  const latestCoachMessage = messages.filter(m => m.role === 'assistant').slice(-1)[0];
  const latestUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
  const olderMessages = messages.slice(0, -2).filter(m => m);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* TOP HALF - Coach Response Area - Fixed 50% height */}
      <div className="h-1/2 relative overflow-hidden">
        {/* Full-bleed cinematic portrait background */}
        <div className="absolute inset-0">
          <img 
            src={coachVisual}
            alt=""
            className="w-full h-full object-cover object-top"
          />
          {/* Dark gradient overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
        </div>

        {/* Coach Response Content */}
        <div className="relative z-10 h-full flex flex-col justify-end p-4 pb-6 overflow-y-auto">
          {/* Empty state with greeting */}
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
              <div className="w-20 h-20 rounded-full bg-black/30 backdrop-blur-sm flex flex-col items-center justify-center mb-6 border border-white/30 shadow-lg">
                <span className="text-2xl font-headline text-saffron leading-none">SM</span>
                <span className="text-[7px] uppercase tracking-[0.15em] text-white/70 mt-0.5">Coach</span>
              </div>
              <h2 className="text-2xl font-headline text-white mb-3">
                Hello, {firstName}
              </h2>
              <p className="text-white/80 text-base whitespace-pre-line max-w-md leading-relaxed">
                {contextualGreeting}
              </p>
            </div>
          )}

          {/* Loading/Thinking indicator */}
          {isLoading && hasMessages && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex items-center gap-3 py-4 px-2">
              <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/30">
                <span className="text-sm font-headline text-saffron">SM</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-2.5 h-2.5 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-2.5 h-2.5 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Latest coach message - prominent display */}
          {latestCoachMessage && !isLoading && (
            <div className="space-y-4 px-2 max-w-2xl">
              {(() => {
                const parsed = parseMessageContent(latestCoachMessage.content);
                return (
                  <>
                    {parsed.text && (
                      <p className="text-white text-lg leading-relaxed whitespace-pre-wrap">
                        {parsed.text}
                      </p>
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

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* BOTTOM HALF - User Input Area - Fixed 50% height */}
      <div className={cn(
        "h-1/2 overflow-y-auto",
        "border-t-2 border-saffron/20",
        "bg-background/95 backdrop-blur-xl",
        "p-4 pb-6 space-y-3"
      )}>
        {/* Collapsible message history */}
        {olderMessages.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger className="flex items-center justify-center w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors gap-1">
              {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              {olderMessages.length} earlier message{olderMessages.length > 1 ? 's' : ''}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2 border-b border-border/50 pb-3 mb-2 max-h-40 overflow-y-auto">
              {olderMessages.map((message) => (
                <div 
                  key={message.id}
                  className={cn(
                    "text-sm",
                    message.role === 'user' ? "text-right" : "text-left"
                  )}
                >
                  {message.role === 'user' ? (
                    <span className="inline-block px-3 py-1.5 rounded-xl bg-primary/10 text-foreground/80 text-xs">
                      {message.content}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/70 text-xs line-clamp-2">
                      {parseMessageContent(message.content).text?.slice(0, 80)}...
                    </span>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Latest user message - subtle reminder */}
        {latestUserMessage && hasMessages && (
          <div className="flex justify-end mb-2">
            <span className="inline-block px-3 py-2 rounded-2xl bg-primary text-primary-foreground text-sm max-w-[80%]">
              {latestUserMessage.content}
            </span>
          </div>
        )}

        {/* Prompt suggestions - only show when no messages */}
        {!hasMessages && (
          <div className="grid gap-2 pb-2">
            {promptSuggestions.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onPromptClick(prompt)}
                className="text-left px-4 py-3 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors text-sm text-foreground bg-white/50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input error message */}
        {inputError && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground bg-muted/50 rounded-lg text-center">
            {inputError}
          </div>
        )}

        {/* Input area */}
        <form onSubmit={onSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            placeholder="Type your response..."
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "min-h-[52px] max-h-[120px] pr-12 resize-none",
              "rounded-2xl border-border/60 focus:border-saffron/50",
              "bg-white/80 backdrop-blur-sm",
              inputError && "border-amber-400/50"
            )}
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || isLoading}
            className="absolute right-2 bottom-2 h-9 w-9 rounded-full bg-saffron hover:bg-saffron/90"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        {/* Action links */}
        <div className="flex items-center justify-center gap-5 pt-1">
          {onVoiceToggle && (
            <button
              onClick={onVoiceToggle}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isVoiceMode ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {isVoiceMode ? 'Switch to text' : 'Switch to voice'}
            </button>
          )}
          {hasMessages && (
            <button
              onClick={onEndSession}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              End session
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoachSplitView;
