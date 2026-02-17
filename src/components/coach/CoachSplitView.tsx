import { useRef, useEffect } from 'react';
import { ArrowUp, Loader2, Mic } from 'lucide-react';
import coachVisual from '@/assets/coach-visual-calm.jpeg';
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
      "rounded-full overflow-hidden shrink-0 border border-white/20",
      size === 'sm' ? "w-8 h-8" : "w-14 h-14"
    )}
  >
    <img
      src={coachVisual}
      alt="Self Mastery Coach"
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
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onEndSession}
          className={cn(
            "text-xs transition-colors",
            glass ? "text-white/50 hover:text-white/80" : "text-muted-foreground hover:text-foreground"
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
  //  EMPTY STATE — full-screen visual + prompts
  // ════════════════════════════════════════════
  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full relative overflow-hidden">
        {/* Full-bleed background */}
        <div className="absolute inset-0">
          <img src={coachVisual} alt="" className="w-full h-full object-cover object-top brightness-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col">
          {/* Title */}
          <div className="pt-8 pb-4 px-6 text-center space-y-3">
            <h1 className="text-4xl font-headline text-white tracking-tight drop-shadow-lg">
              Self Mastery Coach
            </h1>
            <p className="text-base font-subheadline italic text-white/80">
              Inner Awareness. Presence. Growth.
            </p>
            <p className="text-sm text-white/70 max-w-sm mx-auto leading-relaxed">
              I'm your self-mastery coach. Share what's on your mind, and let's explore it together.
            </p>
          </div>

          {/* Centered greeting — no avatar, coach is in background */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <h2 className="text-xl font-headline text-white">
              Hello, {firstName}
            </h2>
          </div>

          {/* Prompt suggestions — transparent, text-only */}
          <div className="px-5 pb-2 space-y-1">
            {promptSuggestions.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onPromptClick(prompt)}
                className="w-full text-left px-4 py-2.5 bg-transparent hover:bg-white/10 transition-colors text-sm text-white/80 hover:text-white"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input bar */}
          <InputBar glass {...inputBarProps} />
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  //  ACTIVE CONVERSATION — single-column chat
  // ════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-background/95 backdrop-blur-sm shrink-0">
        <CoachAvatar size="sm" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground leading-tight">Self Mastery Coach</h2>
          <p className="text-[11px] text-muted-foreground truncate">{contextualGreeting}</p>
        </div>
      </div>

      {/* Scrollable message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-sm leading-relaxed">
                  {message.content}
                </div>
              </div>
            );
          }
          // Coach message
          return (
            <div key={message.id} className="flex items-start gap-2.5">
              <CoachAvatar size="sm" />
              <div className="max-w-[85%] space-y-2 px-4 py-2.5 rounded-2xl rounded-bl-md bg-muted/50 border border-border/30">
                <CoachMessageContent content={message.content} variant="default" />
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-start gap-2.5">
            <CoachAvatar size="sm" />
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-muted/50 border border-border/30 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <InputBar glass={false} {...inputBarProps} />
    </div>
  );
};

export default CoachSplitView;
