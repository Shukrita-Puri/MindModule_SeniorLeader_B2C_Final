import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { getAuthToken } from '@/services/authTokenService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface PracticeStep {
  title: string;
  instruction: string;
  duration?: number;
}

interface UseCoachConversationReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  isRateLimited: boolean;
  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearConversation: () => void;
  endSession: () => Promise<void>;
  sessionId: string | null;
  setFlowType: (flowType: 'prepare' | 'integrate' | 'guided-reflection' | null) => void;
  setPracticeContext: (title: string, steps: PracticeStep[]) => void;
  setEventContext: (eventTitle: string, fromIntervention?: boolean, fromRitual?: boolean) => void;
  restoreMessages: (restoredMessages: Message[], restoredSessionId: string) => void;
}

export const useCoachConversation = (): UseCoachConversationReturn => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flowType, setFlowType] = useState<'prepare' | 'integrate' | 'guided-reflection' | null>(null);
  const [practiceContext, setPracticeContextState] = useState<{
    title: string;
    steps: PracticeStep[];
  } | null>(null);
  const [eventContext, setEventContextState] = useState<{
    eventTitle: string;
    fromIntervention?: boolean;
    fromRitual?: boolean;
  } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const contextSentRef = useRef<boolean>(false);
  const lastMessageRef = useRef<string | null>(null);
  const messagesCountRef = useRef<number>(0);

  const setPracticeContext = useCallback((title: string, steps: PracticeStep[]) => {
    setPracticeContextState({ title, steps });
  }, []);

  const setEventContext = useCallback((eventTitle: string, fromIntervention?: boolean, fromRitual?: boolean) => {
    setEventContextState({ eventTitle, fromIntervention, fromRitual });
  }, []);

  const createSession = useCallback(async () => {
    if (!user?.id || sessionIdRef.current) return sessionIdRef.current;
    
    const userId = DEV_MODE ? DEV_USER.id : user.id;
    const newSessionId = crypto.randomUUID();
    
    // Set local session first for UI to work
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    
    if (DEV_MODE) {
      const { error } = await supabase
        .from('dialogue_sessions')
        .insert({
          id: newSessionId,
          user_id: userId,
          context_type: 'coach',
          session_status: 'active',
          started_at: new Date().toISOString()
        });
      if (error) console.error('[useCoachConversation] DEV_MODE DB error:', error);
      return newSessionId;
    }
    
    try {
      const accessToken = await getAuthToken();
      if (!accessToken) {
        console.warn('[useCoachConversation] No access token – session only exists locally');
        return newSessionId;
      }
      
      const { data, error } = await supabase.functions.invoke('dialogue-session-manage', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { action: 'create_coach', sessionId: newSessionId }
      });
      
      if (error || !data?.success) {
        console.error('[useCoachConversation] Session creation failed:', error || data?.error);
      }
      
      return newSessionId;
    } catch (err) {
      console.error('[useCoachConversation] Session creation error:', err);
      return newSessionId;
    }
  }, [user?.id]);

  const saveMessage = useCallback(async (
    currentSessionId: string,
    role: 'user' | 'assistant',
    content: string,
    messageIndex: number
  ) => {
    if (!user?.id) return;
    
    if (DEV_MODE) {
      const { error } = await supabase
        .from('dialogue_messages')
        .insert({
          session_id: currentSessionId,
          sender_type: role,
          content,
          message_index: messageIndex,
          timestamp: new Date().toISOString()
        });
      if (error) console.error('[useCoachConversation] DEV_MODE saveMessage error:', error);
      return;
    }
    
    try {
      const accessToken = await getAuthToken();
      if (!accessToken) return;
      
      const { error } = await supabase.functions.invoke('dialogue-data-persist', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          type: 'message',
          sessionId: currentSessionId,
          message: {
            role,
            content,
            messageIndex,
            timestamp: new Date().toISOString()
          }
        }
      });
      
      if (error) console.error('[useCoachConversation] Failed to save message:', error);
    } catch (err) {
      console.error('[useCoachConversation] saveMessage error:', err);
    }
  }, [user?.id]);

  const sendMessage = useCallback(async (content: string, isRetry = false) => {
    if (!content.trim() || isLoading) return;
    
    setError(null);
    setIsRateLimited(false);
    setIsLoading(true);
    lastMessageRef.current = content;

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
    await saveMessage(currentSessionId, 'user', content, messages.length);

    try {
      let context: Record<string, any> | undefined;
      if (!contextSentRef.current) {
        const energyState = await computeEnergyState();
        context = {
          energyScore: energyState?.overallBalance,
          energyTier: energyState?.energyTier,
          checkInOutcome: energyState?.checkInOutcome,
        };
        
        if (flowType === 'guided-reflection' && practiceContext) {
          context.practiceTitle = practiceContext.title;
          context.practiceSteps = practiceContext.steps;
        }

        if (eventContext?.eventTitle) {
          context.jitContext = {
            trigger: 'jit',
            eventTitle: eventContext.eventTitle,
          };
        }
        
        contextSentRef.current = true;
      }

      const entryPoint = eventContext?.fromIntervention && eventContext?.eventTitle
        ? 'jit'
        : eventContext?.fromRitual
          ? 'tod_plan'
          : 'independent';

      const coachToken = await getAuthToken();

      const controller = new AbortController();
      const connectTimeout = window.setTimeout(() => controller.abort(), 25000);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-mastery-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${coachToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          flowType,
          entryPoint,
          sessionId: currentSessionId,
          context,
        }),
        signal: controller.signal,
      }).finally(() => {
        window.clearTimeout(connectTimeout);
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          setIsRateLimited(true);
          setError(null);
          setMessages(prev => prev.slice(0, -1));
          setIsLoading(false);
          return;
        }
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

      let stallTimeoutId: number | null = null;
      const resetStallTimeout = () => {
        if (stallTimeoutId) window.clearTimeout(stallTimeoutId);
        stallTimeoutId = window.setTimeout(() => controller.abort(), 15000);
      };
      resetStallTimeout();

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        resetStallTimeout();
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
              resetStallTimeout();
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

      if (stallTimeoutId) window.clearTimeout(stallTimeoutId);

      if (!assistantContent.trim()) {
        throw new Error('Coach took too long to respond. Please retry.');
      }

      await saveMessage(currentSessionId, 'assistant', assistantContent, messages.length + 1);

    } catch (err) {
      console.error('Coach conversation error:', err);
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      setError(isAbort ? 'Coach took too long to respond. Please hit Retry.' : (err instanceof Error ? err.message : 'Failed to send message'));
      setMessages(prev => prev.filter(m => m.content !== ''));
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, createSession, saveMessage, flowType, user?.id, practiceContext, eventContext]);

  const retryLastMessage = useCallback(async () => {
    if (lastMessageRef.current) {
      await sendMessage(lastMessageRef.current, true);
    }
  }, [sendMessage]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsRateLimited(false);
    sessionIdRef.current = null;
    setSessionId(null);
    contextSentRef.current = false;
    lastMessageRef.current = null;
    setPracticeContextState(null);
    setEventContextState(null);
  }, []);

  const restoreMessages = useCallback((restoredMessages: Message[], restoredSessionId: string) => {
    setMessages(restoredMessages);
    sessionIdRef.current = restoredSessionId;
    setSessionId(restoredSessionId);
    contextSentRef.current = true;
  }, []);

  // Keep messagesCountRef in sync
  useEffect(() => {
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  /**
   * endSession – calls the idempotent server-side finalize_coach action.
   * All downstream processing (insights, summaries, patterns, wins) is
   * handled server-side to prevent duplication. Safe to call multiple times.
   */
  const endSession = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    const msgCount = messagesCountRef.current;
    
    if (!currentSessionId || !user?.id || msgCount < 1) {
      clearConversation();
      return;
    }
    
    if (DEV_MODE) {
      await supabase
        .from('dialogue_sessions')
        .update({
          session_status: 'completed',
          ended_at: new Date().toISOString(),
          total_messages: msgCount
        })
        .eq('id', currentSessionId);
      clearConversation();
      return;
    }
    
    try {
      const accessToken = await getAuthToken();
      if (accessToken) {
        await supabase.functions.invoke('dialogue-session-manage', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { action: 'finalize_coach', sessionId: currentSessionId }
        });
      }
    } catch (error) {
      console.error('[useCoachConversation] endSession error:', error);
    } finally {
      clearConversation();
    }
  }, [user?.id, clearConversation]);

  return {
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
    setEventContext,
    restoreMessages,
  };
};
