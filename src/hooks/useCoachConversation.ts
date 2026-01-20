import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAuth0 } from '@auth0/auth0-react';
import { DEV_MODE } from '@/config/devMode';
import { buildCoachContext, type CoachContext } from '@/utils/coachContextBuilder';

// Helper to get access token
async function getAccessToken(): Promise<string | null> {
  try {
    const auth0Client = (window as any).__auth0Client;
    if (auth0Client) {
      return await auth0Client.getAccessTokenSilently();
    }
    return null;
  } catch {
    return null;
  }
}

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
}

export const useCoachConversation = (): UseCoachConversationReturn => {
  const { user } = useAuth();
  const auth0 = useAuth0();
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
  const sessionIdRef = useRef<string | null>(null);
  const contextSentRef = useRef<boolean>(false);
  const lastMessageRef = useRef<string | null>(null);

  const setPracticeContext = useCallback((title: string, steps: PracticeStep[]) => {
    setPracticeContextState({ title, steps });
  }, []);

  const createSession = useCallback(async () => {
    if (!user?.id || sessionIdRef.current) return sessionIdRef.current;
    
    const newSessionId = crypto.randomUUID();
    
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.warn('[useCoachConversation] No access token available');
        // Still set local session for UI to work
        sessionIdRef.current = newSessionId;
        setSessionId(newSessionId);
        return newSessionId;
      }
      
      const { data, error } = await supabase.functions.invoke('dialogue-session-manage', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { action: 'create_coach', sessionId: newSessionId }
      });
      
      if (error) {
        console.error('[useCoachConversation] Failed to create session via edge function:', error);
      } else if (!data?.success) {
        console.error('[useCoachConversation] Session creation returned error:', data?.error);
      } else {
        console.log('[useCoachConversation] Session created successfully:', newSessionId);
      }
      
      sessionIdRef.current = newSessionId;
      setSessionId(newSessionId);
      return newSessionId;
    } catch (err) {
      console.error('[useCoachConversation] Session creation error:', err);
      // Still set local session for UI to work
      sessionIdRef.current = newSessionId;
      setSessionId(newSessionId);
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
    
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.warn('[useCoachConversation] No access token for saveMessage');
        return;
      }
      
      const { data, error } = await supabase.functions.invoke('dialogue-data-persist', {
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
      
      if (error) {
        console.error('[useCoachConversation] Failed to save message:', error);
      } else {
        console.log('[useCoachConversation] Message saved:', role, messageIndex);
      }
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
    
    // Save user message
    await saveMessage(currentSessionId, 'user', content, messages.length);

    try {
      // Build context for first message only
      let context: CoachContext | undefined;
      if (!contextSentRef.current) {
        context = await buildCoachContext(user?.id);
        
        // Add practice steps if in guided-reflection mode
        if (flowType === 'guided-reflection' && practiceContext) {
          (context as any).practiceTitle = practiceContext.title;
          (context as any).practiceSteps = practiceContext.steps;
        }
        
        contextSentRef.current = true;
      }

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
          flowType,
          sessionId: currentSessionId,
          userId: user?.id,
          context, // Pass context to edge function
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle rate limiting specifically
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
  }, [messages, isLoading, createSession, saveMessage, flowType, user?.id, practiceContext]);

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
  }, []);

  const endSession = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    
    // Skip if no session or conversation too short to extract insights
    if (!currentSessionId || !user?.id || messages.length < 2) {
      clearConversation();
      return;
    }
    
    try {
      // 1. Mark session as completed
      await supabase
        .from('dialogue_sessions')
        .update({ 
          session_status: 'completed',
          ended_at: new Date().toISOString()
        })
        .eq('id', currentSessionId);
      
      // 2. Trigger insight extraction (fire-and-forget)
      let accessToken: string | undefined;
      if (!DEV_MODE) {
        try {
          accessToken = await auth0.getAccessTokenSilently();
        } catch (err) {
          console.error('Failed to get access token:', err);
        }
      }
      
      // Don't await - let it run in background
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-coach-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          userId: user.id,
        }),
      }).catch(err => console.error('Insight extraction failed:', err));
      
    } catch (error) {
      console.error('Failed to end session:', error);
    } finally {
      // 3. Clear local state
      clearConversation();
    }
  }, [user?.id, messages.length, clearConversation, auth0]);

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
  };
};