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

      // Generate opening message from persona with personality style
      const openingMessage = generateOpeningMessage(scenario, persona, config.personalityStyle);

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

function generateOpeningMessage(
  scenario: any, 
  persona: any, 
  personalityStyle: string = 'warm-supportive'
): string {
  const scenarioId = scenario.id;
  const personaRole = (persona.role || '').toLowerCase();
  const style = (personalityStyle || 'warm-supportive').toLowerCase();
  
  // Personality style helpers
  const isWarm = style.includes('warm') || style.includes('supportive');
  const isAnalytical = style.includes('analytical') || style.includes('direct');
  const isChallenging = style.includes('challenging') || style.includes('probing');
  const isNeutral = style.includes('neutral') || style.includes('professional');

  // ============================================
  // ALUMNI / GRADUATE - Personality Matrix
  // ============================================
  if (personaRole.includes('alumnus') || personaRole.includes('alumni') || personaRole.includes('graduate')) {
    if (isWarm) {
      if (scenarioId === 'alumni_networking') {
        return `Hey! I graduated about 8 years ago. These networking events can feel a bit awkward, I know—I've been there! So, what year are you in? What's keeping you busy these days?`;
      }
      return `Hi! Great to meet you. I went through this exact process a few years back, so I know how it feels. Just relax—what would you like to chat about?`;
    }
    if (isAnalytical) {
      if (scenarioId === 'alumni_networking') {
        return `I graduated 8 years ago. I've got about 20 minutes. What specifically would you like to know about my career path or the industry?`;
      }
      return `I've been where you are. Let's make this efficient—what's your main question or concern?`;
    }
    if (isChallenging) {
      if (scenarioId === 'alumni_networking') {
        return `So, networking event. Most students waste these. What makes you different? What do you actually want to achieve in the next five years?`;
      }
      return `I don't do small talk. Tell me—what's the real challenge you're facing right now?`;
    }
    // Neutral
    if (scenarioId === 'alumni_networking') {
      return `Good to meet you. I'm class of 2016. What year are you in, and what are you hoping to discuss?`;
    }
    return `Hello. I understand you wanted to connect. How can I help?`;
  }

  // ============================================
  // PEER / CLASSMATE - Personality Matrix
  // ============================================
  if (personaRole.includes('classmate') || personaRole.includes('student') || personaRole.includes('peer')) {
    if (isWarm) {
      if (scenarioId === 'social_dynamics') {
        return `Hey! What's going on? You seemed like you wanted to talk about something?`;
      }
      return `Hey! Good to see you. So, what's up? I heard you wanted to chat about something?`;
    }
    if (isAnalytical) {
      if (scenarioId === 'social_dynamics') {
        return `Hey. You wanted to talk? What's the situation?`;
      }
      return `What's up? You said you needed to discuss something—what is it?`;
    }
    if (isChallenging) {
      if (scenarioId === 'social_dynamics') {
        return `So what's actually going on? I've noticed things have been weird lately. Just say it.`;
      }
      return `Alright, let's not dance around it. What do you really want to talk about?`;
    }
    // Neutral
    if (scenarioId === 'social_dynamics') {
      return `Hey. I got your message. What did you want to discuss?`;
    }
    return `Hi. You mentioned wanting to chat. What's on your mind?`;
  }

  // ============================================
  // TEACHER / PROFESSOR - Personality Matrix
  // ============================================
  if (personaRole.includes('teacher') || personaRole.includes('professor') || personaRole.includes('instructor')) {
    if (isWarm) {
      if (scenarioId === 'academic_presentation') {
        return `Alright, whenever you're ready, the floor is yours. Take your time and begin when you feel comfortable.`;
      }
      return `Good morning. Come in and take a seat. I wanted to have a word with you. How are you finding things this term?`;
    }
    if (isAnalytical) {
      if (scenarioId === 'academic_presentation') {
        return `You have 10 minutes. I'll be evaluating structure, argument quality, and evidence. Begin when ready.`;
      }
      return `Take a seat. I've been reviewing your recent work and have specific observations. Let's discuss.`;
    }
    if (isChallenging) {
      if (scenarioId === 'academic_presentation') {
        return `The floor is yours. Convince me your thesis holds up under scrutiny. Begin.`;
      }
      return `Sit. I've noticed some patterns in your work that concern me. I want to understand your thinking. Explain.`;
    }
    // Neutral
    if (scenarioId === 'academic_presentation') {
      return `Good morning. Please begin your presentation when ready. I'll hold questions until the end.`;
    }
    return `Good morning. Please sit down. I'd like to discuss your progress this term.`;
  }

  // ============================================
  // COACH / SPORTS MENTOR - Personality Matrix
  // ============================================
  if (personaRole.includes('coach') || personaRole.includes('mentor') || personaRole.includes('sports')) {
    if (isWarm) {
      if (scenarioId === 'leadership_speech') {
        return `Alright captain, the team's waiting. This is your moment. Take a breath, gather yourself, and speak from the heart. You've got this.`;
      }
      return `Come sit down. I've been watching your progress and I'm proud of how far you've come. Let's talk about what's next.`;
    }
    if (isAnalytical) {
      if (scenarioId === 'leadership_speech') {
        return `The team's assembled. You have two minutes. What's your message? Be specific about what you need from them.`;
      }
      return `Let's review your performance data. I've identified three areas we need to address. Listen carefully.`;
    }
    if (isChallenging) {
      if (scenarioId === 'leadership_speech') {
        return `Team's waiting. You wanted to be captain—now lead. What are you going to say that they'll actually remember?`;
      }
      return `Sit. I'm going to be straight with you—your recent performance isn't captain material. Change my mind.`;
    }
    // Neutral
    if (scenarioId === 'leadership_speech') {
      return `Right, the team's waiting. This is your moment as captain. Take a breath, then address them.`;
    }
    return `Let's talk. I've been watching your progress. What's on your mind?`;
  }

  // ============================================
  // PARENT / GUARDIAN - Personality Matrix
  // ============================================
  if (personaRole.includes('parent') || personaRole.includes('guardian') || personaRole.includes('family')) {
    if (isWarm) {
      return `Come sit down, love. I've been wanting to talk to you about something. How are you feeling about everything lately?`;
    }
    if (isAnalytical) {
      return `We need to talk. I've noticed some things and I want to understand what's happening. Walk me through your thinking.`;
    }
    if (isChallenging) {
      return `Sit down. We need to have a serious conversation. I want the truth—what's really going on?`;
    }
    // Neutral
    return `Come sit down. I wanted to discuss something with you. How have things been going?`;
  }

  // ============================================
  // COUNSELOR / ADVISOR - Personality Matrix
  // ============================================
  if (personaRole.includes('counselor') || personaRole.includes('advisor') || personaRole.includes('careers')) {
    if (isWarm) {
      if (scenarioId === 'gap_year_planning') {
        return `So you're thinking about taking a gap year? That's exciting—and I know it's a big decision. Let's explore what's drawing you to this idea.`;
      }
      return `Thanks for coming in. This is a safe space to talk about whatever's on your mind. I'm here to listen. What would you like to discuss?`;
    }
    if (isAnalytical) {
      if (scenarioId === 'gap_year_planning') {
        return `Gap year consideration. Let's be systematic: what are your objectives, and how does this fit your five-year plan?`;
      }
      return `I've reviewed your file. Let's identify your key decision points and work through them methodically.`;
    }
    if (isChallenging) {
      if (scenarioId === 'gap_year_planning') {
        return `A gap year. Interesting choice. Most students who take one don't have a clear plan. What makes yours different?`;
      }
      return `Let's cut to it—what's the real issue you're avoiding? Students usually come here when something deeper is going on.`;
    }
    // Neutral
    if (scenarioId === 'gap_year_planning') {
      return `I understand you're considering a gap year. Let's discuss the factors involved in this decision.`;
    }
    return `Thanks for coming in. What would you like to discuss today?`;
  }

  // ============================================
  // ADMISSIONS / INTERVIEWER - Personality Matrix
  // ============================================
  if (personaRole.includes('admissions') || personaRole.includes('interviewer') || personaRole.includes('dean')) {
    if (isWarm) {
      if (scenarioId === 'oxbridge_interview') {
        return `Good morning! Please, come in and make yourself comfortable. Before we dive into the academic questions, I'd love to hear what drew you to apply here.`;
      }
      if (scenarioId === 'scholarship_interview') {
        return `Welcome! Thank you so much for applying. We're impressed with what we've read. Could you start by telling me what this scholarship would mean for your journey?`;
      }
      if (scenarioId === 'head_student_interview') {
        return `Hello! Thank you for applying for Head Student. We've been impressed with your contributions. Tell us—what does this role mean to you personally?`;
      }
      return `Welcome! Thank you for coming in. I've enjoyed reading your application. Tell me a bit about yourself—what should we know beyond what's on paper?`;
    }
    if (isAnalytical) {
      if (scenarioId === 'oxbridge_interview') {
        return `Good morning. I have your application here. We have 25 minutes. Let's begin: why this subject, and why here specifically?`;
      }
      if (scenarioId === 'scholarship_interview') {
        return `Thank you for coming. I've reviewed your application. Walk me through your academic trajectory and how this scholarship fits your plans.`;
      }
      if (scenarioId === 'head_student_interview') {
        return `Good morning. We're evaluating candidates on three criteria: leadership evidence, school contribution, and vision. Start with your strongest leadership example.`;
      }
      return `Thank you for coming. I've reviewed your materials. Let's begin with your qualifications—what specifically makes you suitable?`;
    }
    if (isChallenging) {
      if (scenarioId === 'oxbridge_interview') {
        return `Sit down. I've read hundreds of applications like yours. What makes you genuinely different? Why should we choose you over them?`;
      }
      if (scenarioId === 'scholarship_interview') {
        return `This scholarship is highly competitive. Many applicants have strong academics. What makes you deserve this funding over someone else?`;
      }
      if (scenarioId === 'head_student_interview') {
        return `You want to lead this school. Why should students follow you? What have you actually achieved—not planned, achieved?`;
      }
      return `I'll be direct: we see many candidates. What genuinely distinguishes you? Don't tell me what you think I want to hear.`;
    }
    // Neutral
    if (scenarioId === 'oxbridge_interview') {
      return `Good morning. I'll be conducting your interview today. Please take a seat. Could you tell me what drew you to apply to study here?`;
    }
    if (scenarioId === 'scholarship_interview') {
      return `Welcome. Thank you for applying for this scholarship. Could you start by telling me what this opportunity means to you?`;
    }
    if (scenarioId === 'head_student_interview') {
      return `Thank you for applying for Head Student. We've reviewed your application. Could you start by telling us what this role means to you?`;
    }
    return `Thank you for coming in today. I've reviewed your application materials. Let's begin—could you tell me a bit about yourself?`;
  }

  // ============================================
  // JUDGE / COMPETITION - Personality Matrix
  // ============================================
  if (personaRole.includes('judge') || personaRole.includes('competition')) {
    if (isWarm) {
      if (scenarioId === 'model_un_speech') {
        return `Good morning, delegates. Welcome to this session. Remember, this is as much about learning as competing. The floor is open—please begin when ready.`;
      }
      if (scenarioId === 'debate_tournament') {
        return `Good afternoon and welcome to the semi-finals. Take a moment to collect your thoughts. When you're ready, please begin your opening argument.`;
      }
      return `Welcome. Take your time, and begin when you feel ready.`;
    }
    if (isAnalytical) {
      if (scenarioId === 'model_un_speech') {
        return `Delegates. This session follows standard UN procedure. Opening statements: two minutes maximum. Evidence and precedent will be weighted heavily. Proceed.`;
      }
      if (scenarioId === 'debate_tournament') {
        return `Semi-final round. Three minutes for opening arguments. Scoring criteria: logic, evidence, delivery. The motion is on the board. Begin.`;
      }
      return `Scoring criteria are posted. You may begin.`;
    }
    if (isChallenging) {
      if (scenarioId === 'model_un_speech') {
        return `Delegates, real diplomacy has consequences. Your arguments here should reflect that gravity. The floor is open. Impress us.`;
      }
      if (scenarioId === 'debate_tournament') {
        return `Semi-finals. The weak arguments have been eliminated. Show us why you deserve to be here. Begin.`;
      }
      return `This is where the competition gets serious. The floor is yours. Make it count.`;
    }
    // Neutral
    if (scenarioId === 'model_un_speech') {
      return `Delegates, we are convened to address a matter of global significance. The floor is now open for opening statements. You may proceed.`;
    }
    if (scenarioId === 'debate_tournament') {
      return `Good afternoon. This is the semi-final round. You have three minutes for your opening argument. The motion is on the board. You may begin.`;
    }
    return `The floor is yours. Please proceed when ready.`;
  }

  // ============================================
  // SCENARIO-BASED FALLBACKS with Personality
  // ============================================
  if (scenarioId === 'alumni_networking') {
    if (isWarm) return `Hey! Great to meet you. These events can be a bit overwhelming—I remember my first one! What brings you here today?`;
    if (isAnalytical) return `Hi. I have limited time at these events. What specifically would you like to know?`;
    if (isChallenging) return `So, what's your pitch? Why should I spend my limited networking time with you?`;
    return `Good to meet you. What would you like to discuss?`;
  }
  
  if (scenarioId === 'oxbridge_interview') {
    if (isWarm) return `Good morning! Please come in and make yourself comfortable. Before we begin, what drew you to apply here?`;
    if (isAnalytical) return `Good morning. Let's begin. Why this subject and why this institution?`;
    if (isChallenging) return `Sit down. I've seen many applications. Tell me what makes yours worth my time.`;
    return `Good morning. I'll be conducting your interview today. Please take a seat. Could you tell me what drew you to apply here?`;
  }
  
  if (scenarioId === 'leadership_speech') {
    if (isWarm) return `Everyone's gathered and ready to hear from you. Take your time—speak from the heart.`;
    if (isAnalytical) return `The group is assembled. You have their attention. What's your key message?`;
    if (isChallenging) return `They're all watching. This is your moment to prove you belong in this role. Go.`;
    return `Everyone's gathered and waiting. This is your moment. Whenever you're ready, address the group.`;
  }
  
  if (scenarioId === 'leadership_role') {
    if (isWarm) return `So, you've taken on this responsibility—that's exciting! How are you finding it? What's been on your mind?`;
    if (isAnalytical) return `You're in a leadership position now. What's your strategy? What challenges are you anticipating?`;
    if (isChallenging) return `You wanted this role. What have you actually done with it so far?`;
    return `So, you've taken on this responsibility. Let's discuss how you're approaching it.`;
  }
  
  if (scenarioId === 'social_dynamics') {
    if (isWarm) return `Hey. I noticed something's been going on. Want to talk about it? I'm here to listen.`;
    if (isAnalytical) return `I've noticed some tension. What's the situation, and what are you thinking of doing about it?`;
    if (isChallenging) return `Something's clearly going on. Stop dancing around it—what's the actual problem?`;
    return `Hey. I noticed something's been going on. Want to talk about it?`;
  }
  
  if (scenarioId === 'academic_presentation') {
    if (isWarm) return `Alright, whenever you're ready. Take your time and begin when you feel comfortable.`;
    if (isAnalytical) return `You may begin. I'll be evaluating structure, evidence, and argumentation.`;
    if (isChallenging) return `The floor is yours. Convince me your thesis is worth defending.`;
    return `Alright, whenever you're ready. The floor is yours.`;
  }

  // ============================================
  // ULTIMATE FALLBACK with Personality
  // ============================================
  if (isWarm) {
    return `Hi! Thanks for taking the time. I'm looking forward to our conversation. So, what's on your mind?`;
  }
  if (isAnalytical) {
    return `Let's begin. What would you like to discuss?`;
  }
  if (isChallenging) {
    return `Alright. You have my attention. What do you want to talk about?`;
  }
  return `Hello. Let's begin our conversation. What would you like to discuss?`;
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
