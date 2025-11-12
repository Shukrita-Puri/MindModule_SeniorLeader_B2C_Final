import { supabase } from '@/integrations/supabase/client';
import { getSession, clearSession } from './onboardingStorage';

/**
 * Migrates onboarding data from localStorage to Supabase database
 * Called after user completes payment/conversion
 */
export async function migrateOnboardingToDatabase(userId: string): Promise<boolean> {
  try {
    // Get localStorage session
    const session = getSession();
    if (!session) {
      console.log('No onboarding session to migrate');
      return false;
    }

    // Prepare data for database
    const onboardingData = {
      onboarding_completed_at: new Date().toISOString(),
      onboarding_session_id: session.sessionId,
      
      // Identity data
      identity_role: session.responses.identity_role || session.responses.q1_identity,
      biggest_pressure: session.responses.biggest_pressure || session.responses.q2_pressure,
      
      // Self-regulation responses (MVP)
      energy_regulation_response: session.responses.energy_regulation_response,
      focus_recovery_response: session.responses.focus_recovery_response,
      energy_renewal_response: session.responses.energy_renewal_response,
      growth_priority: session.responses.growth_priority,
      
      // Full onboarding responses (if present)
      q1_setback_response: session.responses.q1_setback_response,
      q2_pressure_response: session.responses.q2_pressure_response,
      q3_communication_style: session.responses.q3_communication_style,
      q4_self_assessed_strength: session.responses.q4_self_assessed_strength,
      
      // Calculated results
      mental_fitness_baseline: session.mental_fitness_baseline,
      component_scores: session.component_scores,
      meta_skill_scores: session.responses.metaSkillScores,
      profile_type: session.responses.profileType,
      profile_description: session.responses.profileDescription,
      user_archetype: session.user_archetype,
      alignment_status: session.responses.alignment?.status,
    };

    // Update profiles table
    const { error } = await supabase
      .from('profiles')
      .update(onboardingData)
      .eq('id', userId);

    if (error) {
      console.error('Error migrating onboarding data:', error);
      return false;
    }

    // Create initial mental fitness score record if baseline exists
    if (session.mental_fitness_baseline) {
      const { error: scoreError } = await supabase
        .from('mental_fitness_scores')
        .insert({
          user_id: userId,
          score_date: new Date().toISOString().split('T')[0],
          score: session.mental_fitness_baseline,
          is_baseline_period: true,
          baseline_avg: session.mental_fitness_baseline,
        });

      if (scoreError) {
        console.error('Error creating initial fitness score:', scoreError);
      }
    }

    // Clear localStorage after successful migration
    clearSession();
    
    console.log('✅ Onboarding data migrated to database');
    return true;
    
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
}

/**
 * Loads onboarding data from database for authenticated user
 */
export async function loadOnboardingFromDatabase(userId: string): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error loading onboarding data:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error loading onboarding:', error);
    return null;
  }
}

/**
 * Checks if user has completed onboarding and has data in database
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_completed_at, mental_fitness_baseline')
      .eq('id', userId)
      .single();

    if (error || !data) return false;
    
    return !!(data.onboarding_completed_at && data.mental_fitness_baseline);
  } catch (error) {
    return false;
  }
}
