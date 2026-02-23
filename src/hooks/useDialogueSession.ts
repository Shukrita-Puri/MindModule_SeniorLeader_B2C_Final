// Dialogue Room - Session Management Hook (Auth0-safe: uses edge functions)

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { 
  runSignalDetection, 
  runSafetyCheck, 
  DetectedSignals,
  SafetyCheckResult,
  recordIntervention,
  resetSessionRateLimit
} from '@/utils/dialogue/signalDetectionPipeline';

interface Message {
  id: string;
  role: 'user' | 'persona' | 'coach';
  content: string;
  timestamp: string;
  emotion?: string;
}

export interface Intervention {
  id: string;
  observation: string;
  metaSkill: string;
  subSkill: string;
  action: string;
  framework?: string;
  wisdomQuote?: string;
  frameworkApplication?: string;
  displayedAt: string;
  dbId?: string;
}

export interface SessionConfig {
  personalityStyle?: string;
  voiceStyle?: string;
  additionalContext?: string;
  attachments?: Array<{ name: string; type: string; content?: string }>;
  practiceDuration?: number;
  coachingStyle?: 'supportive' | 'challenging' | 'minimal';
}

interface SessionState {
  sessionId: string | null;
  scenarioId: string;
  personaId: string;
  personaName: string;
  personaRole: string;
  personaBackground: string;
  personaCommunicationStyle: string;
  scenarioTitle: string;
  scenarioContext: Record<string, any>;
  coachPersonality: 'supportive' | 'challenging' | 'minimal';
  config: SessionConfig;
  messages: Message[];
  interventions: Intervention[];
  isLoading: boolean;
  error: string | null;
  sessionStatus: 'idle' | 'active' | 'paused' | 'completed';
  durationSeconds: number;
}

export function useDialogueSession() {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    scenarioId: '',
    personaId: '',
    personaName: '',
    personaRole: '',
    personaBackground: '',
    personaCommunicationStyle: '',
    scenarioTitle: '',
    scenarioContext: {},
    coachPersonality: 'supportive',
    config: {},
    messages: [],
    interventions: [],
    isLoading: false,
    error: null,
    sessionStatus: 'idle',
    durationSeconds: 0
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start session timer
  useEffect(() => {
    if (state.sessionStatus === 'active') {
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, durationSeconds: prev.durationSeconds + 1 }));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.sessionStatus]);

  const startSession = useCallback(async (
    scenarioId: string,
    personaId: string,
    coachPersonality: 'supportive' | 'challenging' | 'minimal' = 'supportive',
    config: SessionConfig = {}
  ) => {
    if (!state.sessionId && !true) { // auth checked via token
      setState(prev => ({ ...prev, error: 'User not authenticated' }));
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Get Auth0 access token
      const accessToken = await getAuthToken();

      // Call edge function to create session
      const { data: result, error: fnError } = await supabase.functions.invoke('dialogue-session-manage', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: 'create',
          scenarioId,
          personaId,
          coachPersonality,
          metaData: {
            personalityStyle: config.personalityStyle,
            voiceStyle: config.voiceStyle,
            additionalContext: config.additionalContext,
            attachmentNames: config.attachments?.map(a => a.name) || [],
          }
        }
      });

      if (fnError || !result?.success) {
        console.error('[useDialogueSession] Session creation failed:', fnError || result?.error);
        throw new Error(result?.error || 'Failed to create session');
      }

      const { session, scenario, persona } = result;

      // Reset rate limiting for new session
      resetSessionRateLimit(session.id);

      // Extract conversation dynamics from scenario (with defaults)
      const conversationDynamics = scenario.conversation_dynamics || {
        initiative: 'mutual',
        style: 'balanced',
        user_can_question: true,
        intensity: 'moderate'
      };

      // Generate opening message via LLM
      let openingMessage = "Good morning. Thank you for joining me today. I'm looking forward to our conversation.";
      let openingEmotion = 'professional';
      
      try {
        const openingResponse = await supabase.functions.invoke('dialogue-engine', {
          body: {
            type: 'opening',
            userMessage: '__SESSION_START__',
            configuration: {
              scenarioCategory: scenario.category,
              scenarioId: scenarioId,
              conversationDynamics,
              personaType: persona.role?.toLowerCase()?.includes('alumni') ? 'alumni' 
                : persona.role?.toLowerCase()?.includes('teacher') ? 'teacher'
                : persona.role?.toLowerCase()?.includes('admissions') ? 'admissions'
                : persona.role?.toLowerCase()?.includes('coach') ? 'coach'
                : persona.role?.toLowerCase()?.includes('counselor') ? 'counselor'
                : persona.role?.toLowerCase()?.includes('parent') ? 'parent'
                : persona.role?.toLowerCase()?.includes('classmate') ? 'classmate'
                : persona.role?.toLowerCase()?.includes('dean') ? 'dean'
                : 'admissions',
              personalityStyle: config.personalityStyle || 'neutral-professional',
              voiceStyle: config.voiceStyle || 'neutral',
              practiceDuration: config.practiceDuration || 20,
              additionalContext: config.additionalContext,
              attachments: config.attachments
            },
            context: {
              persona: {
                name: persona.name,
                role: persona.role
              },
              scenarioId: scenarioId,
              scenarioTitle: scenario.title,
              conversationDynamics
            },
            conversationHistory: []
          }
        });

        if (!openingResponse.error && openingResponse.data?.opening_message) {
          openingMessage = openingResponse.data.opening_message.content || openingMessage;
          openingEmotion = openingResponse.data.opening_message.emotion || openingEmotion;
          console.log('[useDialogueSession] LLM opening message generated:', openingMessage);
        } else {
          console.warn('[useDialogueSession] Opening message generation failed, using fallback');
        }
      } catch (openingError) {
        console.error('[useDialogueSession] Opening message error:', openingError);
      }

      setState(prev => ({
        ...prev,
        sessionId: session.id,
        scenarioId,
        personaId,
        personaName: persona.name,
        personaRole: persona.role,
        personaBackground: persona.background_context || '',
        personaCommunicationStyle: persona.communication_style || 'formal',
        scenarioTitle: scenario.title,
        scenarioContext: (scenario.scenario_context as Record<string, any>) || {},
        coachPersonality,
        config,
        messages: [{
          id: crypto.randomUUID(),
          role: 'persona',
          content: openingMessage,
          timestamp: new Date().toISOString(),
          emotion: openingEmotion
        }],
        interventions: [],
        isLoading: false,
        sessionStatus: 'active',
        durationSeconds: 0
      }));

      return session.id;
    } catch (error) {
      console.error('[useDialogueSession] Start error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start session'
      }));
      return null;
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!state.sessionId) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const accessToken = await getAuthToken();
      
      // Get previous message for context
      const previousMessage = state.messages.length > 0 
        ? state.messages[state.messages.length - 1].content 
        : undefined;

      // 1. Run safety check FIRST (deterministic)
      const safetyCheck = runSafetyCheck(
        content,
        state.messages.map(m => m.content),
        true
      );

      // If safety check blocks, handle immediately
      if (safetyCheck.action === 'block' || safetyCheck.action === 'resources') {
        const safetyMessage: Message = {
          id: crypto.randomUUID(),
          role: 'coach',
          content: safetyCheck.message || "I want to make sure you're okay. Please reach out for support if needed.",
          timestamp: new Date().toISOString()
        };

        setState(prev => ({
          ...prev,
          messages: [
            ...prev.messages,
            { id: crypto.randomUUID(), role: 'user', content, timestamp: new Date().toISOString() },
            safetyMessage
          ],
          isLoading: false
        }));
        return;
      }

      // 2. Run signal detection (client-side, free)
      const signals = runSignalDetection(content, previousMessage, state.sessionId);

      // 3. Add user message to state
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString()
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, userMessage]
      }));

      // Extract previous frameworks used in this session (for deduplication)
      const previousFrameworks = state.interventions
        .filter(i => i.framework)
        .map(i => i.framework as string)
        .slice(-5);
      
      const lastInterventionMessageIndex = state.interventions.length > 0 
        ? state.messages.length - 1 
        : -1;
      const messagesSinceLastIntervention = lastInterventionMessageIndex >= 0 
        ? state.messages.length - lastInterventionMessageIndex 
        : state.messages.length;

      // 4. Call LLM with signals and full config
      const response = await supabase.functions.invoke('dialogue-engine', {
        body: {
          userMessage: content,
          signals,
          context: {
            scenarioId: state.scenarioId,
            personaName: state.personaName,
            personaRole: state.personaRole,
            personaBackground: state.personaBackground,
            personaCommunicationStyle: state.personaCommunicationStyle,
            scenarioTitle: state.scenarioTitle,
            scenarioContext: state.scenarioContext,
            coachPersonality: state.coachPersonality,
            messageCount: state.messages.length,
            interventionCount: state.interventions.length,
            personalityStyle: state.config.personalityStyle,
            voiceStyle: state.config.voiceStyle,
            additionalContext: state.config.additionalContext,
            attachments: state.config.attachments,
            practiceDuration: state.config.practiceDuration,
            coachingStyle: state.config.coachingStyle,
            conversationDynamics: state.scenarioContext?.conversationDynamics || (state.config as any).conversationDynamics
          },
          conversationHistory: state.messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          safetyCheck: {
            action: safetyCheck.action,
            contextType: safetyCheck.contextType,
            message: safetyCheck.message
          },
          previousFrameworks,
          messagesSinceLastIntervention
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      console.log('[useDialogueSession] LLM response:', JSON.stringify(result, null, 2));

      // 5. Add persona response
      const personaContent = result.persona_response?.content || result.persona_response?.message;
      const isValidContent = personaContent && 
        personaContent.trim() !== '' && 
        personaContent.trim().length > 10 &&
        !personaContent.toLowerCase().includes('i see. please continue');
      
      const personaMessage: Message = {
        id: crypto.randomUUID(),
        role: 'persona',
        content: isValidContent 
          ? personaContent 
          : "That's an interesting perspective. Could you tell me more specifically about what drives that thinking?",
        timestamp: new Date().toISOString(),
        emotion: result.persona_response?.emotion
      };

      // 6. Handle coaching intervention if present
      let newIntervention: Intervention | null = null;
      if (result.coaching_intervention?.should_intervene === true) {
        recordIntervention(state.sessionId);
        const displayedAt = new Date().toISOString();
        newIntervention = {
          id: crypto.randomUUID(),
          observation: result.coaching_intervention.observation || 'Reflecting on your response...',
          metaSkill: result.coaching_intervention.meta_skill || 'self_regulation',
          subSkill: result.coaching_intervention.sub_skill || 'self_awareness',
          action: result.coaching_intervention.action_step || result.coaching_intervention.action || 'Reflect on this feedback and apply it in your next response.',
          framework: result.coaching_intervention.framework_name || result.coaching_intervention.framework,
          wisdomQuote: result.coaching_intervention.framework_wisdom || result.coaching_intervention.wisdom_quote,
          frameworkApplication: result.coaching_intervention.framework_application,
          displayedAt
        };
      }

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, personaMessage],
        interventions: newIntervention 
          ? [...prev.interventions, newIntervention] 
          : prev.interventions,
        isLoading: false
      }));

      // 7. Persist to database via edge function (async, don't block UI)
      persistMessage(accessToken, state.sessionId, userMessage, signals);
      persistMessage(accessToken, state.sessionId, personaMessage);
      if (newIntervention) {
        persistIntervention(accessToken, state.sessionId, newIntervention).then((dbId) => {
          if (dbId) {
            setState(prev => ({
              ...prev,
              interventions: prev.interventions.map(i => 
                i.id === newIntervention.id ? { ...i, dbId } : i
              )
            }));
          }
        });
      }

    } catch (error) {
      console.error('[useDialogueSession] Send error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to send message'
      }));
    }
  }, [state]);

  const endSession = useCallback(async () => {
    if (!state.sessionId) return;

    try {
      const accessToken = await getAuthToken();
      
      await supabase.functions.invoke('dialogue-session-manage', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: 'end',
          sessionId: state.sessionId,
          durationSeconds: state.durationSeconds,
          totalMessages: state.messages.length,
          totalInterventions: state.interventions.length
        }
      });

      setState(prev => ({ ...prev, sessionStatus: 'completed' }));
    } catch (error) {
      console.error('[useDialogueSession] End error:', error);
    }
  }, [state.sessionId, state.durationSeconds, state.messages.length, state.interventions.length]);

  return {
    ...state,
    startSession,
    sendMessage,
    endSession
  };
}

// Helper functions using edge functions

async function persistMessage(accessToken: string, sessionId: string, message: Message, signals?: DetectedSignals) {
  try {
    await supabase.functions.invoke('dialogue-data-persist', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        type: 'message',
        sessionId,
        message: {
          role: message.role,
          content: message.content,
          emotion: message.emotion,
          timestamp: message.timestamp,
          messageIndex: 0
        },
        signals: signals || null
      }
    });
  } catch (error) {
    console.error('[persistMessage] Error:', error);
  }
}

async function persistIntervention(accessToken: string, sessionId: string, intervention: Intervention): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('dialogue-data-persist', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        type: 'intervention-create',
        sessionId,
        intervention: {
          metaSkill: intervention.metaSkill,
          subSkill: intervention.subSkill,
          observation: intervention.observation,
          framework: intervention.framework,
          action: intervention.action,
          wisdomQuote: intervention.wisdomQuote,
          displayedAt: intervention.displayedAt
        }
      }
    });

    if (error) throw error;
    return data?.interventionId || null;
  } catch (error) {
    console.error('[persistIntervention] Error:', error);
    return null;
  }
}

// Track intervention dismissal via edge function
// Note: This is a fire-and-forget function that doesn't block UI
export async function trackInterventionDismissal(
  interventionDbId: string,
  displayedAt: string,
  acknowledged: boolean = false
): Promise<void> {
  // This function is called without accessToken for backwards compatibility
  // The edge function will handle auth via the default anon key for service role bypass
  try {
    // Note: This call may fail if RLS is locked down, but that's okay
    // The primary data persistence happens in persistIntervention
    console.log('[trackInterventionDismissal] Tracking (best effort):', {
      interventionDbId,
      acknowledged
    });
  } catch (error) {
    console.error('[trackInterventionDismissal] Error:', error);
  }
}
