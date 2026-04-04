import { useRef, useEffect } from 'react';
import { Send, Loader2, Mic, MicOff } from 'lucide-react';
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
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface CoachConversationCardProps {
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
}

const CoachConversationCard = ({
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
}: CoachConversationCardProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Get latest messages for display
  const latestCoachMessage = messages.filter(m => m.role === 'assistant').slice(-1)[0];
  const latestUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
  const olderMessages = messages.slice(0, -2).filter(m => m);

  const hasMessages = messages.length > 0;

  return (
    <div className="relative z-10 w-full max-w-xl mx-auto px-4">
      {/* Glass-morphic conversation card */}
      <div className={cn(
        "rounded-3xl border border-black/[0.06]",
        "bg-white/70 backdrop-blur-xl backdrop-saturate-150",
        "shadow-[0_8px_40px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]",
        "overflow-hidden",
        "transition-all duration-500"
      )}>
        {/* Card content */}
        <div className="p-6 space-y-4">
          {/* Loading/Thinking indicator */}
          {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-saffron/20 via-taupe/10 to-transparent flex items-center justify-center border border-saffron/20">
                <span className="text-xs font-headline text-saffron">SM</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-saffron/60 animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-saffron/60 animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-saffron/60 animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Empty state with greeting */}
          {!hasMessages && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-saffron/20 via-taupe/10 to-transparent flex flex-col items-center justify-center mx-auto mb-4 border border-saffron/20">
                <span className="text-[15px] font-headline text-saffron leading-none">SM</span>
                <span className="text-[6px] uppercase tracking-[0.15em] text-muted-foreground/70 mt-0.5">Coach</span>
              </div>
              <h2 className="text-[20px] font-headline text-foreground mb-2">
                Hello, {firstName}
              </h2>
              <p className="text-muted-foreground text-sm whitespace-pre-line max-w-sm mx-auto">
                {contextualGreeting}
              </p>
            </div>
          )}

          {/* Collapsible history */}
          {olderMessages.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger className="flex items-center justify-center w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors gap-1">
                {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {olderMessages.length} earlier message{olderMessages.length > 1 ? 's' : ''}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2 border-t border-border/50">
                {olderMessages.map((message) => (
                  <div 
                    key={message.id}
                    className={cn(
                      "text-sm",
                      message.role === 'user' ? "text-right" : "text-left"
                    )}
                  >
                    {message.role === 'user' ? (
                      <span className="inline-block px-3 py-2 rounded-xl bg-primary/10 text-foreground/80">
                        {message.content}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/70 line-clamp-2">
                        {parseMessageContent(message.content).text?.slice(0, 100)}...
                      </span>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Latest exchange */}
          {hasMessages && (
            <div className="space-y-4">
              {/* Latest coach message - prominent */}
              {latestCoachMessage && !isLoading && (
                <div className="space-y-3">
                  {(() => {
                    const parsed = parseMessageContent(latestCoachMessage.content);
                    return (
                      <>
                        {parsed.text && (
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap">
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

              {/* Latest user message - subtle */}
              {latestUserMessage && (
                <div className="flex justify-end">
                  <span className="inline-block px-4 py-2 rounded-2xl bg-primary text-primary-foreground text-sm max-w-[85%]">
                    {latestUserMessage.content}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Prompt suggestions - only show when no messages */}
          {!hasMessages && (
            <div className="grid gap-2 pt-4">
              {promptSuggestions.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onPromptClick(prompt)}
                  className="text-left px-4 py-3 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors text-sm text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <form onSubmit={onSubmit} className="relative pt-2">
            <Textarea
              ref={textareaRef}
              placeholder="Type your response..."
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              className={cn(
                "min-h-[52px] max-h-[150px] pr-12 resize-none",
                "rounded-2xl border-border/50 focus:border-saffron/50",
                "bg-white/50 backdrop-blur-sm"
              )}
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputValue.trim() || isLoading}
              className="absolute right-2 bottom-2 h-8 w-8 rounded-full bg-saffron hover:bg-saffron/90"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>

          {/* Action links */}
          <div className="flex items-center justify-center gap-4 pt-2">
            {onVoiceToggle && (
              <button
                onClick={onVoiceToggle}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isVoiceMode ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
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

          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

export default CoachConversationCard;
