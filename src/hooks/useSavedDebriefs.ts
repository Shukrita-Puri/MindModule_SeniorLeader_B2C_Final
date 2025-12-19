import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth0 } from '@auth0/auth0-react';
import { Strength, DevelopmentArea, Framework, TranscriptMessage } from './useSessionDebrief';

interface SavedDebrief {
  id: string;
  session_id: string | null;
  title: string | null;
  scenario_domain: string | null;
  scenario_context: string | null;
  persona_type: string | null;
  duration_seconds: number | null;
  strengths: Strength[];
  development_areas: DevelopmentArea[];
  frameworks_used: Framework[];
  transcript_json: TranscriptMessage[];
  personal_notes: string | null;
  created_at: string;
}

export const useSavedDebriefs = () => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [savedDebriefs, setSavedDebriefs] = useState<SavedDebrief[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSavedDebriefs = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setIsLoading(true);
      const token = await getAccessTokenSilently();
      
      const { data, error: fetchError } = await supabase.functions.invoke('saved-debriefs', {
        body: { action: 'GET_DEBRIEFS' },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (fetchError) throw fetchError;

      setSavedDebriefs((data?.data || []).map((d: any) => ({
        id: d.id,
        session_id: d.session_id,
        title: d.title,
        scenario_domain: d.scenario_domain,
        scenario_context: d.scenario_context,
        persona_type: d.persona_type,
        duration_seconds: d.duration_seconds,
        strengths: (d.strengths as unknown as Strength[]) || [],
        development_areas: (d.development_areas as unknown as DevelopmentArea[]) || [],
        frameworks_used: (d.frameworks_used as unknown as Framework[]) || [],
        transcript_json: (d.transcript_json as unknown as TranscriptMessage[]) || [],
        personal_notes: d.personal_notes,
        created_at: d.created_at
      })));
    } catch (err) {
      console.error('Error fetching saved debriefs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load saved debriefs');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  const saveDebrief = useCallback(async (params: {
    sessionId: string | null;
    title?: string;
    scenarioDomain?: string;
    scenarioContext?: string;
    personaType?: string;
    durationSeconds?: number;
    strengths: Strength[];
    developmentAreas: DevelopmentArea[];
    frameworks: Framework[];
    transcript: TranscriptMessage[];
    personalNotes?: string;
  }) => {
    if (!isAuthenticated) {
      throw new Error('Must be authenticated to save debriefs');
    }

    try {
      setIsSaving(true);
      const token = await getAccessTokenSilently();
      
      const { data, error: saveError } = await supabase.functions.invoke('saved-debriefs', {
        body: { 
          action: 'SAVE_DEBRIEF',
          debrief: {
            sessionId: params.sessionId,
            title: params.title,
            scenarioDomain: params.scenarioDomain,
            scenarioContext: params.scenarioContext,
            personaType: params.personaType,
            durationSeconds: params.durationSeconds,
            strengths: params.strengths,
            developmentAreas: params.developmentAreas,
            frameworks: params.frameworks,
            transcript: params.transcript,
            personalNotes: params.personalNotes
          }
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (saveError) throw saveError;

      return data?.data;
    } catch (err) {
      console.error('Error saving debrief:', err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  const deleteDebrief = useCallback(async (debriefId: string) => {
    if (!isAuthenticated) return;

    try {
      const token = await getAccessTokenSilently();
      
      const { error: deleteError } = await supabase.functions.invoke('saved-debriefs', {
        body: { action: 'DELETE_DEBRIEF', debriefId },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (deleteError) throw deleteError;

      setSavedDebriefs(prev => prev.filter(d => d.id !== debriefId));
    } catch (err) {
      console.error('Error deleting debrief:', err);
      throw err;
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  return {
    savedDebriefs,
    isLoading,
    isSaving,
    error,
    fetchSavedDebriefs,
    saveDebrief,
    deleteDebrief
  };
};
