import { useState, useCallback, useRef } from 'react';
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
  const sessionIdRef = useRef<string | null>(null);
  const contextSentRef = useRef<boolean>(false);
  const lastMessageRef = useRef<string | null>(null);

  const setPracticeContext = useCallback((title: string, steps: PracticeStep[]) => {
    setPracticeContextState({ title, steps });
  }, []);

  const createSession = useCallback(async () => {
    if (!user?.id || sessionIdRef.current) return sessionIdRef.current;
    
    const userId = DEV_MODE ? DEV_USER.id : user.id;
    const newSessionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    
    // Set local session first for UI to work
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    
    // DEV_MODE: Direct database insert
    if (DEV_MODE) {
      console.log(`[useCoachConversation ${timestamp}] DEV_MODE: Creating session directly`);
      const { error } = await supabase
        .from('dialogue_sessions')
        .insert({
          id: newSessionId,
          user_id: userId,
          context_type: 'coach',
          session_status: 'active',
          started_at: new Date().toISOString()
        });
      
      if (error) {
        console.error(`[useCoachConversation ${timestamp}] DEV_MODE DB error:`, error);
      } else {
        console.log(`[useCoachConversation ${timestamp}] DEV_MODE: Session created:`, newSessionId);
      }
      return newSessionId;
    }
    
    // Production: Use edge function with Auth0 token
    try {
      const accessToken = await getAuthToken();
      console.log(`[useCoachConversation ${timestamp}] createSession - token:`, accessToken ? 'present' : 'MISSING');
      
      if (!accessToken) {
        console.warn(`[useCoachConversation ${timestamp}] No access token - session will only exist locally!`);
        return newSessionId;
      }
      
      console.log(`[useCoachConversation ${timestamp}] Invoking dialogue-session-manage with action: create_coach`);
      
      const { data, error } = await supabase.functions.invoke('dialogue-session-manage', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { action: 'create_coach', sessionId: newSessionId }
      });
      
      console.log(`[useCoachConversation ${timestamp}] Edge function response:`, { data, error });
      
      if (error) {
        console.error(`[useCoachConversation ${timestamp}] Edge function error:`, error);
      } else if (!data?.success) {
        console.error(`[useCoachConversation ${timestamp}] Session creation failed:`, data?.error);
      } else {
        console.log(`[useCoachConversation ${timestamp}] Session created in database:`, newSessionId);
      }
      
      return newSessionId;
    } catch (err) {
      console.error(`[useCoachConversation ${timestamp}] Session creation error:`, err);
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
    
    // DEV_MODE: Direct database insert
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
      
      if (error) {
        console.error('[useCoachConversation] DEV_MODE saveMessage error:', error);
      } else {
        console.log('[useCoachConversation] DEV_MODE: Message saved:', role, messageIndex);
      }
      return;
    }
    
    // Production: Use edge function
    try {
      const accessToken = await getAuthToken();
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
      // Build minimal ephemeral context (server builds full context from DB)
      let context: Record<string, any> | undefined;
      if (!contextSentRef.current) {
        const energyState = await computeEnergyState();
        context = {
          energyScore: energyState?.overallBalance,
          energyTier: energyState?.energyTier,
          checkInOutcome: energyState?.checkInOutcome,
        };
        
        // Add practice steps if in guided-reflection mode
        if (flowType === 'guided-reflection' && practiceContext) {
          context.practiceTitle = practiceContext.title;
          context.practiceSteps = practiceContext.steps;
        }
        
        contextSentRef.current = true;
      }

      // Get Auth0 token for self-mastery-coach
      const coachToken = await getAuthToken();
      
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
          sessionId: currentSessionId,
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

  // Restore messages from a previous session (for Recent Activity click)
  const restoreMessages = useCallback((restoredMessages: Message[], restoredSessionId: string) => {
    setMessages(restoredMessages);
    sessionIdRef.current = restoredSessionId;
    setSessionId(restoredSessionId);
    contextSentRef.current = true; // Don't resend context for restored sessions
  }, []);

  const endSession = useCallback(async () => {
    const currentSessionId = sessionIdRef.current;
    const timestamp = new Date().toISOString();
    
    // Skip if no session or conversation too short to extract insights
    if (!currentSessionId || !user?.id || messages.length < 2) {
      console.log(`[useCoachConversation ${timestamp}] endSession skipped - no session or too short`);
      clearConversation();
      return;
    }
    
    const userId = DEV_MODE ? DEV_USER.id : user.id;
    
    try {
      // DEV_MODE: Direct database update
      if (DEV_MODE) {
        console.log(`[useCoachConversation ${timestamp}] DEV_MODE: Ending session directly:`, currentSessionId);
        const { error } = await supabase
          .from('dialogue_sessions')
          .update({
            session_status: 'completed',
            ended_at: new Date().toISOString(),
            total_messages: messages.length
          })
          .eq('id', currentSessionId);
        
        if (error) {
          console.error(`[useCoachConversation ${timestamp}] DEV_MODE endSession error:`, error);
        } else {
          console.log(`[useCoachConversation ${timestamp}] DEV_MODE: Session ended successfully`);
        }
        clearConversation();
        return;
      }
      
      // Production: Use edge function with Auth0 token
      // 1. Mark session as completed via edge function (bypasses RLS)
      const accessToken = await getAuthToken();
      console.log(`[useCoachConversation ${timestamp}] endSession - token:`, accessToken ? 'present' : 'MISSING');
      
      if (accessToken) {
        console.log(`[useCoachConversation ${timestamp}] Ending session via edge function:`, currentSessionId);
        
        const { data, error } = await supabase.functions.invoke('dialogue-session-manage', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { 
            action: 'end', 
            sessionId: currentSessionId,
            durationSeconds: null,
            totalMessages: messages.length,
            totalInterventions: 0
          }
        });
        
        console.log(`[useCoachConversation ${timestamp}] End session response:`, { data, error });
        
        if (error) {
          console.error(`[useCoachConversation ${timestamp}] Failed to end session:`, error);
        }
      }
      
      // 2. Trigger insight extraction (fire-and-forget)
      let insightToken: string | undefined;
      try {
        insightToken = await getAuthToken() || undefined;
      } catch (err) {
        console.error('Failed to get access token for insights:', err);
      }
      
      // Don't await - let it run in background
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-coach-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(insightToken ? { 'Authorization': `Bearer ${insightToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          userId: user.id,
        }),
      }).catch(err => console.error('Insight extraction failed:', err));

      // 3. Trigger probing effectiveness analysis (fire-and-forget) — use Auth0 token
      if (insightToken) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-probing-effectiveness`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${insightToken}`,
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            userId: user.id,
          }),
        }).catch(err => console.error('Probing analysis failed:', err));
      }

      // 4. Generate coach summary (fire-and-forget)
      if (insightToken) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-coach-summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${insightToken}`,
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            userId: user.id,
          }),
        }).then(() => {
          // 6. Extract session memories (chained after summary)
          if (insightToken) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-session-memories`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${insightToken}`,
              },
              body: JSON.stringify({
                sessionId: currentSessionId,
                userId: user.id,
              }),
            }).catch(err => console.error('Session memory extraction failed:', err));
          }
        }).catch(err => console.error('Coach summary generation failed:', err));

        // 5. Detect recurring patterns (fire-and-forget, parallel with summary)
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-recurring-patterns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${insightToken}`,
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            userId: user.id,
          }),
        }).catch(err => console.error('Pattern detection failed:', err));

        // 7. Detect coach scenarios (fire-and-forget, parallel)
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-coach-scenarios`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${insightToken}`,
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            userId: user.id,
          }),
        }).catch(err => console.error('Coach scenario detection failed:', err));

        // 8. Extract tool commitments (fire-and-forget, parallel)
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-tool-commitments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${insightToken}`,
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            userId: user.id,
          }),
        }).catch(err => console.error('Tool commitment extraction failed:', err));

        // 9. Resolve session commitments — updates pending commitment statuses based on conversation
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-session-commitments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${insightToken}`,
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            userId: user.id,
          }),
        }).catch(err => console.error('Commitment resolution failed:', err));
      }
      
    } catch (error) {
      console.error(`[useCoachConversation ${timestamp}] Failed to end session:`, error);
    } finally {
      // 3. Clear local state
      clearConversation();
    }
  }, [user?.id, messages.length, clearConversation]);

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
    restoreMessages,
  };
};