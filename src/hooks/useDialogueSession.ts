// Dialogue Room - Session Management Hook

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth0 } from '@auth0/auth0-react';
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

interface Intervention {
  id: string;
  observation: string;
  metaSkill: string;
  subSkill: string;
  action: string;
  framework?: string;
  wisdomQuote?: string;
  frameworkApplication?: string;
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
  const { user } = useAuth0();
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
    if (!user?.sub) {
      setState(prev => ({ ...prev, error: 'User not authenticated' }));
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Fetch scenario and persona details (cast to any - types will regenerate)
      const [scenarioRes, personaRes] = await Promise.all([
        (supabase.from('scenario_definitions') as any).select('*').eq('id', scenarioId).single(),
        (supabase.from('persona_definitions') as any).select('*').eq('id', personaId).single()
      ]);

      if (scenarioRes.error || !scenarioRes.data) {
        throw new Error('Scenario not found');
      }
      if (personaRes.error || !personaRes.data) {
        throw new Error('Persona not found');
      }

      const scenario = scenarioRes.data;
      const persona = personaRes.data;

      // Create session in database
      const { data: session, error: sessionError } = await (supabase.from('dialogue_sessions') as any)
        .insert({
          user_id: user.sub,
          scenario_id: scenarioId,
          persona_id: personaId,
          context_type: scenario.context_type,
          scenario_context: scenario.scenario_context,
          coach_personality: coachPersonality,
          session_status: 'active',
          meta_data: {
            personalityStyle: config.personalityStyle,
            voiceStyle: config.voiceStyle,
            additionalContext: config.additionalContext,
            attachmentNames: config.attachments?.map(a => a.name) || []
          }
        })
        .select()
        .single();

      if (sessionError || !session) {
        throw new Error('Failed to create session');
      }

      // Reset rate limiting for new session
      resetSessionRateLimit(session.id);

      // Generate opening message via LLM (no more hardcoded messages)
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
              scenarioTitle: scenario.title
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
        // Continue with fallback message
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
  }, [user?.sub]);

  const sendMessage = useCallback(async (content: string) => {
    if (!state.sessionId || !user?.sub) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
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
            // Extended configuration
            personalityStyle: state.config.personalityStyle,
            voiceStyle: state.config.voiceStyle,
            additionalContext: state.config.additionalContext,
            attachments: state.config.attachments,
            practiceDuration: state.config.practiceDuration,
            coachingStyle: state.config.coachingStyle
          },
          conversationHistory: state.messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          safetyCheck: {
            action: safetyCheck.action,
            contextType: safetyCheck.contextType,
            message: safetyCheck.message
          }
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;

      // 5. Add persona response
      const personaMessage: Message = {
        id: crypto.randomUUID(),
        role: 'persona',
        content: result.persona_response?.message || "I see. Please continue.",
        timestamp: new Date().toISOString(),
        emotion: result.persona_response?.emotion
      };

      // 6. Handle coaching intervention if present
      let newIntervention: Intervention | null = null;
      if (result.coaching_intervention) {
        recordIntervention(state.sessionId);
        newIntervention = {
          id: crypto.randomUUID(),
          observation: result.coaching_intervention.observation,
          metaSkill: result.coaching_intervention.meta_skill,
          subSkill: result.coaching_intervention.sub_skill,
          action: result.coaching_intervention.action_step || result.coaching_intervention.action || 'Reflect on this feedback and apply it in your next response.',
          framework: result.coaching_intervention.framework_name || result.coaching_intervention.framework,
          wisdomQuote: result.coaching_intervention.framework_wisdom || result.coaching_intervention.wisdom_quote,
          frameworkApplication: result.coaching_intervention.framework_application
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

      // 7. Persist to database (async, don't block UI)
      persistMessage(state.sessionId, userMessage, signals);
      persistMessage(state.sessionId, personaMessage);
      if (newIntervention) {
        persistIntervention(state.sessionId, newIntervention);
      }

    } catch (error) {
      console.error('[useDialogueSession] Send error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to send message'
      }));
    }
  }, [state, user?.sub]);

  const endSession = useCallback(async () => {
    if (!state.sessionId) return;

    try {
      await (supabase.from('dialogue_sessions') as any)
        .update({
          session_status: 'completed',
          ended_at: new Date().toISOString(),
          duration_seconds: state.durationSeconds,
          total_messages: state.messages.length,
          total_interventions: state.interventions.length
        })
        .eq('id', state.sessionId);

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

// Helper functions

// Opening message generation moved to dialogue-engine LLM
// See supabase/functions/dialogue-engine/index.ts buildOpeningMessagePrompt()

async function persistMessage(sessionId: string, message: Message, signals?: DetectedSignals) {
  try {
    const { data, error } = await (supabase.from('dialogue_messages') as any)
      .insert({
        session_id: sessionId,
        message_index: 0,
        sender_type: message.role,
        content: message.content,
        emotion_displayed: message.emotion,
        timestamp: message.timestamp
      })
      .select()
      .single();

    if (error) throw error;

    // Persist signals if present
    if (signals && data) {
      await (supabase.from('detected_signals') as any).insert({
        session_id: sessionId,
        message_id: data.id,
        sentiment: signals.sentiment,
        emotions: signals.emotions,
        ei_behaviors: signals.eiBehaviors,
        skill_gaps: signals.skillGaps,
        skill_strengths: signals.skillStrengths,
        conversation_flow: signals.conversationFlow,
        risk_assessment: signals.riskAssessment,
        coaching_readiness: signals.coachingReadiness,
        raw_signals: signals
      });
    }
  } catch (error) {
    console.error('[persistMessage] Error:', error);
  }
}

async function persistIntervention(sessionId: string, intervention: Intervention) {
  try {
    await (supabase.from('dialogue_interventions') as any).insert({
      session_id: sessionId,
      intervention_type: 'observation',
      meta_skill_target: intervention.metaSkill,
      sub_skill_target: intervention.subSkill,
      observation: intervention.observation,
      framework_used: intervention.framework,
      action_suggested: intervention.action,
      wisdom_source: intervention.wisdomQuote ? { quote: intervention.wisdomQuote } : null
    });
  } catch (error) {
    console.error('[persistIntervention] Error:', error);
  }
}
