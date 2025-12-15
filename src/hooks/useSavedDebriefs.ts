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
  const { user, isAuthenticated } = useAuth0();
  const [savedDebriefs, setSavedDebriefs] = useState<SavedDebrief[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSavedDebriefs = useCallback(async () => {
    if (!isAuthenticated || !user?.sub) return;

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('saved_debriefs')
        .select('*')
        .eq('user_id', user.sub)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setSavedDebriefs((data || []).map(d => ({
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
  }, [isAuthenticated, user?.sub]);

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
    if (!isAuthenticated || !user?.sub) {
      throw new Error('Must be authenticated to save debriefs');
    }

    try {
      setIsSaving(true);
      
      const insertData = {
        user_id: user.sub,
        session_id: params.sessionId,
        title: params.title || `Dialogue Session - ${new Date().toLocaleDateString()}`,
        scenario_domain: params.scenarioDomain,
        scenario_context: params.scenarioContext,
        persona_type: params.personaType,
        duration_seconds: params.durationSeconds,
        strengths: params.strengths as unknown as Record<string, unknown>[],
        development_areas: params.developmentAreas as unknown as Record<string, unknown>[],
        frameworks_used: params.frameworks as unknown as Record<string, unknown>[],
        transcript_json: params.transcript as unknown as Record<string, unknown>[],
        personal_notes: params.personalNotes
      };

      const { data, error: insertError } = await (supabase
        .from('saved_debriefs') as any)
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      return data;
    } catch (err) {
      console.error('Error saving debrief:', err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [isAuthenticated, user?.sub]);

  const deleteDebrief = useCallback(async (debriefId: string) => {
    if (!isAuthenticated || !user?.sub) return;

    try {
      const { error: deleteError } = await supabase
        .from('saved_debriefs')
        .delete()
        .eq('id', debriefId)
        .eq('user_id', user.sub);

      if (deleteError) throw deleteError;

      setSavedDebriefs(prev => prev.filter(d => d.id !== debriefId));
    } catch (err) {
      console.error('Error deleting debrief:', err);
      throw err;
    }
  }, [isAuthenticated, user?.sub]);

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
