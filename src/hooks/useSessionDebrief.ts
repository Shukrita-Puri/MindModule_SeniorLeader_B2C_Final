import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth0 } from '@auth0/auth0-react';

interface DialogueMessage {
  id: string;
  sender_type: 'user' | 'persona';
  content: string;
  timestamp: string;
  message_index: number;
  emotion_displayed?: string;
}

interface DialogueIntervention {
  id: string;
  triggered_by_message_id: string | null;
  intervention_type: string;
  meta_skill_target: string | null;
  sub_skill_target: string | null;
  observation: string | null;
  framework_used: string | null;
  action_suggested: string | null;
  wisdom_source: {
    quote?: string;
    attribution?: string;
  } | null;
  coach_personality: string | null;
}

interface DetectedSignal {
  id: string;
  skill_strengths: Array<{
    metaSkill: string;
    subSkill?: string;
    indicators?: string[];
    confidence?: number;
  }>;
  skill_gaps: Array<{
    metaSkill: string;
    subSkill?: string;
    indicators?: string[];
    confidence?: number;
  }>;
}

interface SessionData {
  id: string;
  scenario_id: string | null;
  persona_id: string | null;
  context_type: string;
  scenario_context: {
    scenarioDomain?: string;
    scenarioContext?: string;
    selectedPersonas?: string[];
    customPersonas?: string;
    personalityStyle?: string;
  } | null;
  duration_seconds: number | null;
  total_messages: number;
  total_interventions: number;
  started_at: string;
  ended_at: string | null;
}

export interface TranscriptMessage extends DialogueMessage {
  interventionAfter?: DialogueIntervention;
}

export interface Strength {
  metaSkill: string;
  subSkill?: string;
  indicators?: string[];
  transcriptExample?: string;
}

export interface DevelopmentArea {
  metaSkill: string;
  subSkill?: string;
  observation: string;
  actionSuggested?: string;
}

export interface Framework {
  name: string;
  attribution?: string;
  wisdomQuote?: string;
}

export interface SessionDebrief {
  session: SessionData | null;
  transcript: TranscriptMessage[];
  strengths: Strength[];
  developmentAreas: DevelopmentArea[];
  frameworks: Framework[];
  isLoading: boolean;
  error: string | null;
}

export const useSessionDebrief = (sessionId: string | null): SessionDebrief => {
  const { getAccessTokenSilently } = useAuth0();
  const [session, setSession] = useState<SessionData | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [strengths, setStrengths] = useState<Strength[]>([]);
  const [developmentAreas, setDevelopmentAreas] = useState<DevelopmentArea[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      console.log('[useSessionDebrief] No sessionId provided');
      setIsLoading(false);
      return;
    }

    const fetchSessionData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log('[useSessionDebrief] Fetching data for sessionId:', sessionId);

        // Get Auth0 access token
        const accessToken = await getAccessTokenSilently();

        // Fetch all data via edge function
        const { data: result, error: fnError } = await supabase.functions.invoke('dialogue-session-debrief', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { sessionId }
        });

        if (fnError || !result?.success) {
          throw new Error(result?.error || fnError?.message || 'Failed to fetch session data');
        }

        console.log('[useSessionDebrief] Edge function response:', {
          session: result.session ? 'present' : 'missing',
          messages: result.messages?.length || 0,
          interventions: result.interventions?.length || 0,
          signals: result.signals?.length || 0
        });

        // Process session data
        if (result.session) {
          setSession({
            id: result.session.id,
            scenario_id: result.session.scenario_id,
            persona_id: result.session.persona_id,
            context_type: result.session.context_type,
            scenario_context: result.session.scenario_context as SessionData['scenario_context'],
            duration_seconds: result.session.duration_seconds,
            total_messages: result.session.total_messages || 0,
            total_interventions: result.session.total_interventions || 0,
            started_at: result.session.started_at || '',
            ended_at: result.session.ended_at
          });
        }

        // Process messages with inline interventions
        const interventions = (result.interventions || []) as DialogueIntervention[];
        const interventionsByMessageId = new Map<string, DialogueIntervention>();
        
        interventions.forEach(intervention => {
          if (intervention.triggered_by_message_id) {
            interventionsByMessageId.set(intervention.triggered_by_message_id, intervention);
          }
        });

        const messagesWithInterventions: TranscriptMessage[] = (result.messages || []).map((msg: any) => ({
          id: msg.id,
          sender_type: msg.sender_type as 'user' | 'persona',
          content: msg.content,
          timestamp: msg.timestamp || '',
          message_index: msg.message_index,
          emotion_displayed: msg.emotion_displayed || undefined,
          interventionAfter: interventionsByMessageId.get(msg.id)
        }));

        setTranscript(messagesWithInterventions);

        // Process detected signals for strengths
        const allStrengths: Strength[] = [];
        const allGaps: DevelopmentArea[] = [];

        (result.signals || []).forEach((signal: any) => {
          const skillStrengths = (signal.skill_strengths as DetectedSignal['skill_strengths']) || [];
          const skillGaps = (signal.skill_gaps as DetectedSignal['skill_gaps']) || [];

          skillStrengths.forEach(s => {
            if (!allStrengths.some(existing => 
              existing.metaSkill === s.metaSkill && existing.subSkill === s.subSkill
            )) {
              allStrengths.push({
                metaSkill: s.metaSkill,
                subSkill: s.subSkill,
                indicators: s.indicators
              });
            }
          });

          skillGaps.forEach(g => {
            if (!allGaps.some(existing => 
              existing.metaSkill === g.metaSkill && existing.subSkill === g.subSkill
            )) {
              allGaps.push({
                metaSkill: g.metaSkill,
                subSkill: g.subSkill,
                observation: g.indicators?.join(', ') || 'Area for development identified',
                actionSuggested: undefined
              });
            }
          });
        });

        // Add development areas from interventions
        interventions.forEach(intervention => {
          if (intervention.meta_skill_target && intervention.observation) {
            const existing = allGaps.find(g => 
              g.metaSkill === intervention.meta_skill_target
            );
            if (existing) {
              existing.observation = intervention.observation;
              existing.actionSuggested = intervention.action_suggested || undefined;
            } else {
              allGaps.push({
                metaSkill: intervention.meta_skill_target,
                subSkill: intervention.sub_skill_target || undefined,
                observation: intervention.observation,
                actionSuggested: intervention.action_suggested || undefined
              });
            }
          }
        });

        setStrengths(allStrengths);
        setDevelopmentAreas(allGaps);

        // Extract unique frameworks
        const uniqueFrameworks = new Map<string, Framework>();
        interventions.forEach(intervention => {
          if (intervention.framework_used && !uniqueFrameworks.has(intervention.framework_used)) {
            const wisdom = intervention.wisdom_source as { quote?: string; attribution?: string } | null;
            uniqueFrameworks.set(intervention.framework_used, {
              name: intervention.framework_used,
              attribution: wisdom?.attribution,
              wisdomQuote: wisdom?.quote
            });
          }
        });

        setFrameworks(Array.from(uniqueFrameworks.values()));

      } catch (err) {
        console.error('Error fetching session debrief:', err);
        setError(err instanceof Error ? err.message : 'Failed to load session data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessionData();
  }, [sessionId, getAccessTokenSilently]);

  return {
    session,
    transcript,
    strengths,
    developmentAreas,
    frameworks,
    isLoading,
    error
  };
};
