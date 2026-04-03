import { useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Mic } from 'lucide-react';
import coachVisual from '@/assets/shared/coach-visual-calm.jpeg';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { parseMessageContent } from '@/utils/messageParser';
import { matchProtocolById, matchProtocolByPartialId } from '@/utils/protocolMatcher';
import { getWisdom } from '@/data/wisdomContent';
import ProtocolCard from '@/components/chat/ProtocolCard';
import WisdomCard from '@/components/chat/WisdomCard';

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

/** Small circular coach avatar used in header and message bubbles */
const CoachAvatar = ({ size = 'sm' }: { size?: 'sm' | 'md' }) => (
  <div
    className={cn(
      "rounded-full overflow-hidden shrink-0 border border-stone-200",
      size === 'sm' ? "w-8 h-8" : "w-14 h-14"
    )}
  >
    <img
      src={coachVisual}
      alt="Mind Performance Coach"
      className="w-full h-full object-cover object-top"
    />
  </div>
);

/** Render parsed coach message content (text + protocol/wisdom cards) */
const CoachMessageContent = ({ content, variant = 'default' }: { content: string; variant?: 'default' | 'onDark' }) => {
  const parsed = parseMessageContent(content);
  return (
    <>
      {parsed.text && (
        <p className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap",
          variant === 'onDark' ? "text-white" : "text-foreground"
        )}>
          {parsed.text}
        </p>
      )}
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
            variant={variant}
          />
        );
      })}
      {parsed.wisdom.map((w, idx) => {
        const wisdom = getWisdom(w.fullKey);
        if (!wisdom) return null;
        return (
          <WisdomCard
            key={`${w.fullKey}-${idx}`}
            quote={wisdom.quote}
            attribution={wisdom.attribution}
            context={wisdom.context}
            variant={variant}
          />
        );
      })}
    </>
  );
};

/** Input bar extracted as a stable component to prevent focus loss */
const InputBar = ({
  glass,
  inputError,
  onSubmit,
  onVoiceToggle,
  isVoiceMode,
  inputValue,
  onInputChange,
  onKeyDown,
  isLoading,
  hasMessages,
  onEndSession,
}: {
  glass: boolean;
  inputError?: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onVoiceToggle?: () => void;
  isVoiceMode: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  hasMessages: boolean;
  onEndSession: () => void;
}) => (
  <div className={cn(
    "px-4 py-3 pb-5 space-y-2 shrink-0",
    glass
      ? "bg-black/40 backdrop-blur-xl border-t border-white/10"
      : "bg-background border-t border-border/30"
  )}>
    {inputError && (
      <div className="px-2 py-1.5 text-sm text-muted-foreground bg-muted/50 rounded-lg text-center">
        {inputError}
      </div>
    )}
    <form onSubmit={onSubmit} className="relative flex items-end gap-2">
      {onVoiceToggle && (
        <button
          type="button"
          onClick={onVoiceToggle}
          className={cn(
            "h-11 w-11 rounded-full flex items-center justify-center shrink-0 border-2 transition-all",
            isVoiceMode
              ? "bg-saffron border-saffron text-white"
              : "border-saffron/40 bg-saffron/10 hover:bg-saffron/20 hover:border-saffron text-saffron"
          )}
        >
          <Mic className="h-5 w-5" />
        </button>
      )}
      <div className="flex-1 relative">
        <Textarea
          placeholder="Type your response..."
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn(
            "min-h-[52px] max-h-[120px] pr-12 resize-none rounded-2xl",
            glass
              ? "bg-white/15 border-white/20 text-white placeholder:text-white/50 focus:border-saffron/60"
              : "bg-white/80 backdrop-blur-sm border-border/60 focus:border-saffron/50",
            inputError && "border-amber-400/50"
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
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
    {hasMessages && (
      <div className="flex flex-col items-center gap-1.5 pt-1">
        <div className={cn(
          "w-12 h-px",
          glass ? "bg-white/10" : "bg-border/40"
        )} />
        <button
          type="button"
          onClick={onEndSession}
          className={cn(
            "text-sm font-medium px-4 py-1 rounded-full transition-colors",
            glass
              ? "text-white/60 hover:text-white hover:bg-white/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          End session
        </button>
      </div>
    )}
  </div>
);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasMessages = messages.length > 0;

  const inputBarProps = {
    inputError,
    onSubmit,
    onVoiceToggle,
    isVoiceMode,
    inputValue,
    onInputChange,
    onKeyDown,
    isLoading,
    hasMessages,
    onEndSession,
  };

  // ════════════════════════════════════════════
  //  EMPTY STATE – full-screen visual + prompts
  // ════════════════════════════════════════════
  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full min-h-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-50/40 via-stone-50 to-rose-50/30" />

        <div className="relative z-10 flex-1 min-h-0 flex flex-col">
          {/* Centered coach visual + copy */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-4">
            {/* Large circular coach avatar */}
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden border-2 border-stone-200 shadow-xl shadow-stone-300/40">
              <img src={coachVisual} alt="Mind Performance Coach" className="w-full h-full object-cover object-top" />
            </div>

            <div className="space-y-3 max-w-sm">
              <h2 className="text-xl md:text-2xl font-headline text-foreground/90">
                Hello, {firstName}.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                I'll challenge your thinking, surface what's holding you back, and hold you to what you said matters.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                So you think clearly and lead with certainty.
              </p>
            </div>
          </div>

          {/* Input bar */}
          <InputBar glass={false} {...inputBarProps} />
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  //  ACTIVE CONVERSATION – single-column chat
  // ════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Scrollable message list – takes ALL available space */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex items-start justify-end gap-2.5">
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-stone-100 border border-stone-200 text-foreground text-sm leading-relaxed">
                  {message.content}
                </div>
                <div className="w-8 h-8 rounded-full bg-stone-200 border border-stone-300 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-foreground/70">{firstName.slice(0, 2).toUpperCase()}</span>
                </div>
              </div>
            );
          }
          // Coach message
          return (
            <div key={message.id} className="flex items-start gap-2.5">
              <CoachAvatar size="sm" />
              <div className="max-w-[85%] space-y-2 px-4 py-2.5 rounded-2xl rounded-bl-md bg-white border border-stone-200">
                <CoachMessageContent content={message.content} variant="default" />
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-start gap-2.5">
            <CoachAvatar size="sm" />
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-stone-200 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar – pinned to bottom */}
      <InputBar glass={false} {...inputBarProps} />
      <p className="text-[10px] text-muted-foreground/50 text-center pb-2 px-4">
        AI-powered coaching assistant. Responses are generated and may not always be accurate. Not a substitute for professional advice.
      </p>
    </div>
  );
};

export default CoachSplitView;
