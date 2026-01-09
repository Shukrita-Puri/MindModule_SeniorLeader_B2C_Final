import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UseCoachConversationReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearConversation: () => void;
  sessionId: string | null;
}

export const useCoachConversation = (): UseCoachConversationReturn => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const createSession = useCallback(async () => {
    if (!user?.id || sessionIdRef.current) return sessionIdRef.current;
    
    const newSessionId = crypto.randomUUID();
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    
    // Create session in dialogue_sessions table
    await supabase.from('dialogue_sessions').insert({
      id: newSessionId,
      user_id: user.id,
      context_type: 'coach',
      session_status: 'active',
      started_at: new Date().toISOString(),
    });
    
    return newSessionId;
  }, [user?.id]);

  const saveMessage = useCallback(async (
    currentSessionId: string,
    role: 'user' | 'assistant',
    content: string,
    messageIndex: number
  ) => {
    if (!user?.id) return;
    
    await supabase.from('dialogue_messages').insert({
      session_id: currentSessionId,
      sender_type: role,
      content,
      message_index: messageIndex,
    });
  }, [user?.id]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    
    setError(null);
    setIsLoading(true);

    const currentSessionId = await createSession();
    if (!currentSessionId) {
      setError('Failed to create session');
      setIsLoading(false);
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    
    // Save user message
    await saveMessage(currentSessionId, 'user', content, messages.length);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-mastery-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantContent = '';
      let streamDone = false;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (deltaContent) {
              assistantContent += deltaContent;
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage?.role === 'assistant') {
                  newMessages[newMessages.length - 1] = {
                    ...lastMessage,
                    content: assistantContent,
                  };
                }
                return newMessages;
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Save assistant message
      if (assistantContent) {
        await saveMessage(currentSessionId, 'assistant', assistantContent, messages.length + 1);
      }

    } catch (err) {
      console.error('Coach conversation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.content !== ''));
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, createSession, saveMessage]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdRef.current = null;
    setSessionId(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearConversation,
    sessionId,
  };
};
