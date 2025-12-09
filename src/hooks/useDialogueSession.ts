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

      // Generate opening message from persona
      const openingMessage = generateOpeningMessage(scenario, persona);

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
          emotion: 'friendly'
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
          wisdomQuote: result.coaching_intervention.framework_wisdom || result.coaching_intervention.wisdom_quote
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

function generateOpeningMessage(scenario: any, persona: any): string {
  const scenarioId = scenario.id;
  const personaRole = (persona.role || '').toLowerCase();
  const communicationStyle = (persona.communication_style || '').toLowerCase();
  
  // ALUMNI / GRADUATE personas - always casual and mentorship-oriented
  if (personaRole.includes('alumnus') || personaRole.includes('alumni') || personaRole.includes('graduate')) {
    if (scenarioId === 'alumni_networking') {
      return `Hey! I graduated about 8 years ago. These networking events can feel a bit awkward, I know—I've been there! So, what year are you in? What's keeping you busy these days?`;
    }
    // Alumni in other contexts (mock interview help, mentorship)
    return `Hi! Great to meet you. I went through this exact process a few years back, so I know how it feels. Just relax—what would you like to chat about?`;
  }
  
  // PEER / CLASSMATE personas - casual and friendly
  if (personaRole.includes('classmate') || personaRole.includes('student') || personaRole.includes('peer')) {
    if (scenarioId === 'social_dynamics') {
      return `Hey! What's going on? You seemed like you wanted to talk about something?`;
    }
    return `Hey! Good to see you. So, what's up? I heard you wanted to chat about something?`;
  }
  
  // TEACHER / PROFESSOR personas - authoritative but encouraging
  if (personaRole.includes('teacher') || personaRole.includes('professor') || personaRole.includes('instructor')) {
    if (scenarioId === 'academic_presentation') {
      return `Alright, whenever you're ready, the floor is yours. Take your time and begin when you feel comfortable.`;
    }
    return `Good morning. Come in and take a seat. I wanted to have a word with you. How are you finding things this term?`;
  }
  
  // COACH / SPORTS MENTOR personas - motivating and direct
  if (personaRole.includes('coach') || personaRole.includes('mentor') || personaRole.includes('sports')) {
    if (scenarioId === 'leadership_speech') {
      return `Right, the team's waiting. This is your moment as captain. Take a breath, then address them. What do you want to say?`;
    }
    return `Alright, let's talk. I've been watching your progress and I think we need to discuss something. What's on your mind?`;
  }
  
  // PARENT / GUARDIAN personas - warm and concerned
  if (personaRole.includes('parent') || personaRole.includes('guardian') || personaRole.includes('family')) {
    return `Come sit down. I've been wanting to talk to you about something. How are you feeling about everything lately?`;
  }
  
  // COUNSELOR / ADVISOR personas - supportive and non-judgmental
  if (personaRole.includes('counselor') || personaRole.includes('advisor') || personaRole.includes('careers')) {
    if (scenarioId === 'gap_year_planning') {
      return `So you're thinking about taking a gap year? That's a big decision. Let's talk through what you're considering. What's drawing you to this idea?`;
    }
    return `Thanks for coming in. This is a safe space to talk about whatever's on your mind. What would you like to discuss today?`;
  }
  
  // ADMISSIONS / INTERVIEWER personas - formal and evaluative
  if (personaRole.includes('admissions') || personaRole.includes('interviewer') || personaRole.includes('dean')) {
    if (scenarioId === 'oxbridge_interview') {
      return `Good morning. I'll be conducting your interview today. Please, take a seat. Before we begin with the academic questions, could you tell me what drew you to apply to study here?`;
    }
    if (scenarioId === 'scholarship_interview') {
      return `Welcome. Thank you for applying for this scholarship. We've reviewed your application materials, and I'd like to learn more about you. Could you start by telling me what this opportunity means to you?`;
    }
    if (scenarioId === 'head_student_interview') {
      return `Thank you for applying for Head Student. We've reviewed your application and are impressed with your track record. Could you start by telling us what this role means to you?`;
    }
    return `Thank you for coming in today. I've reviewed your application materials. Let's begin—could you tell me a bit about yourself?`;
  }
  
  // JUDGE / COMPETITION personas - formal and procedural
  if (personaRole.includes('judge') || personaRole.includes('competition')) {
    if (scenarioId === 'model_un_speech') {
      return `Delegates, we are convened here today to address a matter of global significance. The floor is now open for opening statements. You may proceed when ready.`;
    }
    if (scenarioId === 'debate_tournament') {
      return `Good afternoon. This is the semi-final round. You have three minutes to present your opening argument. The motion is on the board. You may begin when ready.`;
    }
    return `The floor is yours. Please proceed when ready.`;
  }
  
  // Scenario-based fallbacks (if persona role doesn't match above)
  if (scenarioId === 'alumni_networking') {
    return `Hey! Great to meet you. These events can be a bit overwhelming—I remember my first one! What brings you here today?`;
  }
  if (scenarioId === 'oxbridge_interview') {
    return `Good morning. I'll be conducting your interview today. Please, take a seat. Before we begin, could you tell me what drew you to apply here?`;
  }
  if (scenarioId === 'leadership_speech') {
    return `Everyone's gathered and waiting. This is your moment. Whenever you're ready, address the group.`;
  }
  if (scenarioId === 'leadership_role') {
    return `So, you've taken on this responsibility. Let's discuss how you're approaching it. What's been on your mind?`;
  }
  if (scenarioId === 'social_dynamics') {
    return `Hey. I noticed something's been going on. Want to talk about it?`;
  }
  if (scenarioId === 'academic_presentation') {
    return `Alright, whenever you're ready. The floor is yours.`;
  }
  
  // Communication style fallback
  if (communicationStyle.includes('friendly') || communicationStyle.includes('casual') || communicationStyle.includes('relatable')) {
    return `Hey there! Thanks for taking the time. So, what's on your mind?`;
  }
  if (communicationStyle.includes('formal') || communicationStyle.includes('professional')) {
    return `Good morning. Thank you for meeting with me. Shall we begin?`;
  }
  
  // Ultimate fallback
  return `Hello. Let's begin our conversation. I'm interested to hear your thoughts. What would you like to discuss?`;
}

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
