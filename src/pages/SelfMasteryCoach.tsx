import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCoachConversation } from '@/hooks/useCoachConversation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const SelfMasteryCoach = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, isLoading, error, sendMessage, clearConversation } = useCoachConversation();
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const firstName = user?.name?.split(' ')[0] || 'there';

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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/executive-home')}
          className="h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Self Mastery Coach</h1>
          <p className="text-xs text-muted-foreground">Your personal executive coach</p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearConversation}
            className="text-muted-foreground hover:text-foreground"
          >
            New Chat
          </Button>
        )}
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <span className="text-2xl">🧠</span>
            </div>
            <h2 className="text-2xl font-headline mb-2 text-foreground">
              Hello, {firstName}
            </h2>
            <p className="text-muted-foreground max-w-sm mb-8">
              I'm your self-mastery coach. Share what's on your mind, and let's explore it together.
            </p>
            <div className="grid gap-2 w-full max-w-sm">
              {[
                "I'm feeling overwhelmed with my workload",
                "How can I be more present in meetings?",
                "I'm struggling with a difficult conversation",
              ].map((prompt) => (
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
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🧠</span>
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
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">🧠</span>
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
