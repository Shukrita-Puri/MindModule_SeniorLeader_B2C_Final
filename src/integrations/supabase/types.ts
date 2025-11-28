export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      calendar_connections: {
        Row: {
          created_at: string
          encrypted_access_token_id: string | null
          encrypted_refresh_token_id: string | null
          id: string
          is_active: boolean | null
          last_sync: string | null
          provider: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          provider: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          provider?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees_count: number | null
          created_at: string
          end_time: string
          event_metadata: Json | null
          external_id: string
          id: string
          is_organizer: boolean | null
          is_recurring: boolean | null
          start_time: string
          title: string | null
          user_id: string
        }
        Insert: {
          attendees_count?: number | null
          created_at?: string
          end_time: string
          event_metadata?: Json | null
          external_id: string
          id?: string
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          start_time: string
          title?: string | null
          user_id: string
        }
        Update: {
          attendees_count?: number | null
          created_at?: string
          end_time?: string
          event_metadata?: Json | null
          external_id?: string
          id?: string
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          start_time?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      checkin_skip_events: {
        Row: {
          created_at: string | null
          has_calendar: boolean | null
          has_wearable: boolean | null
          id: string
          skip_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          has_calendar?: boolean | null
          has_wearable?: boolean | null
          id?: string
          skip_date: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          has_calendar?: boolean | null
          has_wearable?: boolean | null
          id?: string
          skip_date?: string
          user_id?: string
        }
        Relationships: []
      }
      content_relevance_feedback: {
        Row: {
          content_id: string
          content_type: string
          context_data: Json | null
          created_at: string
          feedback_reason: string | null
          feedback_text: string | null
          feedback_type: string
          id: string
          session_id: string | null
          star_rating: number | null
          timestamp: string
          trigger_context: string | null
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          context_data?: Json | null
          created_at?: string
          feedback_reason?: string | null
          feedback_text?: string | null
          feedback_type: string
          id?: string
          session_id?: string | null
          star_rating?: number | null
          timestamp?: string
          trigger_context?: string | null
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          context_data?: Json | null
          created_at?: string
          feedback_reason?: string | null
          feedback_text?: string | null
          feedback_type?: string
          id?: string
          session_id?: string | null
          star_rating?: number | null
          timestamp?: string
          trigger_context?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          data_sources: Json | null
          energy_balance: number | null
          id: string
          outcome: string
          skipped: boolean | null
          state_tags: string[] | null
          timestamp: string
          user_id: string
        }
        Insert: {
          checkin_date: string
          created_at?: string
          data_sources?: Json | null
          energy_balance?: number | null
          id?: string
          outcome: string
          skipped?: boolean | null
          state_tags?: string[] | null
          timestamp: string
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string
          data_sources?: Json | null
          energy_balance?: number | null
          id?: string
          outcome?: string
          skipped?: boolean | null
          state_tags?: string[] | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_ritual_completions: {
        Row: {
          completed_practice_ids: string[] | null
          completion_status: string
          created_at: string
          guided_practice_completed: boolean | null
          guided_practice_completed_at: string | null
          id: string
          micro_exercise_completed: boolean | null
          micro_exercise_completed_at: string | null
          recommended_practice_ids: string[] | null
          recommended_practices_count: number | null
          ritual_date: string
          soundscape_completed: boolean | null
          soundscape_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_practice_ids?: string[] | null
          completion_status?: string
          created_at?: string
          guided_practice_completed?: boolean | null
          guided_practice_completed_at?: string | null
          id?: string
          micro_exercise_completed?: boolean | null
          micro_exercise_completed_at?: string | null
          recommended_practice_ids?: string[] | null
          recommended_practices_count?: number | null
          ritual_date: string
          soundscape_completed?: boolean | null
          soundscape_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_practice_ids?: string[] | null
          completion_status?: string
          created_at?: string
          guided_practice_completed?: boolean | null
          guided_practice_completed_at?: string | null
          id?: string
          micro_exercise_completed?: boolean | null
          micro_exercise_completed_at?: string | null
          recommended_practice_ids?: string[] | null
          recommended_practices_count?: number | null
          ritual_date?: string
          soundscape_completed?: boolean | null
          soundscape_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      energy_snapshots: {
        Row: {
          calendar_density: number | null
          computed_data: Json | null
          created_at: string
          dominant_state: string | null
          energy_balance: number | null
          id: string
          oura_readiness: number | null
          pause_percentage: number | null
          powerup_percentage: number | null
          presence_percentage: number | null
          snapshot_date: string
          total_sessions: number | null
          user_id: string
        }
        Insert: {
          calendar_density?: number | null
          computed_data?: Json | null
          created_at?: string
          dominant_state?: string | null
          energy_balance?: number | null
          id?: string
          oura_readiness?: number | null
          pause_percentage?: number | null
          powerup_percentage?: number | null
          presence_percentage?: number | null
          snapshot_date: string
          total_sessions?: number | null
          user_id: string
        }
        Update: {
          calendar_density?: number | null
          computed_data?: Json | null
          created_at?: string
          dominant_state?: string | null
          energy_balance?: number | null
          id?: string
          oura_readiness?: number | null
          pause_percentage?: number | null
          powerup_percentage?: number | null
          presence_percentage?: number | null
          snapshot_date?: string
          total_sessions?: number | null
          user_id?: string
        }
        Relationships: []
      }
      mental_fitness_scores: {
        Row: {
          baseline_avg: number | null
          checkin_consistency_score: number | null
          content_engagement_score: number | null
          created_at: string
          current_streak: number | null
          id: string
          is_baseline_period: boolean | null
          metadata: Json | null
          ritual_completion_score: number | null
          score: number
          score_date: string
          streak_bonus: number | null
          trend: string | null
          user_id: string
        }
        Insert: {
          baseline_avg?: number | null
          checkin_consistency_score?: number | null
          content_engagement_score?: number | null
          created_at?: string
          current_streak?: number | null
          id?: string
          is_baseline_period?: boolean | null
          metadata?: Json | null
          ritual_completion_score?: number | null
          score: number
          score_date: string
          streak_bonus?: number | null
          trend?: string | null
          user_id: string
        }
        Update: {
          baseline_avg?: number | null
          checkin_consistency_score?: number | null
          content_engagement_score?: number | null
          created_at?: string
          current_streak?: number | null
          id?: string
          is_baseline_period?: boolean | null
          metadata?: Json | null
          ritual_completion_score?: number | null
          score?: number
          score_date?: string
          streak_bonus?: number | null
          trend?: string | null
          user_id?: string
        }
        Relationships: []
      }
      micro_intervention_events: {
        Row: {
          context_data: Json | null
          created_at: string
          dismissed_reason: string | null
          event_type: string
          id: string
          intervention_id: string
          intervention_type: string
          recommended_content_id: string | null
          recommended_content_type: string | null
          time_to_action_seconds: number | null
          timestamp: string
          timing_window: string | null
          trigger_event_id: string | null
          trigger_reason: string | null
          urgency_level: string | null
          user_id: string
        }
        Insert: {
          context_data?: Json | null
          created_at?: string
          dismissed_reason?: string | null
          event_type: string
          id?: string
          intervention_id: string
          intervention_type: string
          recommended_content_id?: string | null
          recommended_content_type?: string | null
          time_to_action_seconds?: number | null
          timestamp?: string
          timing_window?: string | null
          trigger_event_id?: string | null
          trigger_reason?: string | null
          urgency_level?: string | null
          user_id: string
        }
        Update: {
          context_data?: Json | null
          created_at?: string
          dismissed_reason?: string | null
          event_type?: string
          id?: string
          intervention_id?: string
          intervention_type?: string
          recommended_content_id?: string | null
          recommended_content_type?: string | null
          time_to_action_seconds?: number | null
          timestamp?: string
          timing_window?: string | null
          trigger_event_id?: string | null
          trigger_reason?: string | null
          urgency_level?: string | null
          user_id?: string
        }
        Relationships: []
      }
      oura_connections: {
        Row: {
          created_at: string
          encrypted_access_token_id: string | null
          encrypted_refresh_token_id: string | null
          id: string
          is_active: boolean | null
          last_sync: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oura_daily_data: {
        Row: {
          activity_score: number | null
          created_at: string
          hrv: number | null
          id: string
          raw_data: Json | null
          readiness_score: number | null
          resting_heart_rate: number | null
          sleep_score: number | null
          summary_date: string
          user_id: string
        }
        Insert: {
          activity_score?: number | null
          created_at?: string
          hrv?: number | null
          id?: string
          raw_data?: Json | null
          readiness_score?: number | null
          resting_heart_rate?: number | null
          sleep_score?: number | null
          summary_date: string
          user_id: string
        }
        Update: {
          activity_score?: number | null
          created_at?: string
          hrv?: number | null
          id?: string
          raw_data?: Json | null
          readiness_score?: number | null
          resting_heart_rate?: number | null
          sleep_score?: number | null
          summary_date?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_sessions: {
        Row: {
          category: string
          completed: boolean | null
          completed_at: string | null
          content_id: string
          content_type: string
          created_at: string
          duration_seconds: number | null
          effectiveness_rating: number | null
          id: string
          metadata: Json | null
          part_of_ritual: boolean | null
          started_at: string
          user_id: string
        }
        Insert: {
          category: string
          completed?: boolean | null
          completed_at?: string | null
          content_id: string
          content_type: string
          created_at?: string
          duration_seconds?: number | null
          effectiveness_rating?: number | null
          id?: string
          metadata?: Json | null
          part_of_ritual?: boolean | null
          started_at: string
          user_id: string
        }
        Update: {
          category?: string
          completed?: boolean | null
          completed_at?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          duration_seconds?: number | null
          effectiveness_rating?: number | null
          id?: string
          metadata?: Json | null
          part_of_ritual?: boolean | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alignment_status: string | null
          avatar_url: string | null
          biggest_pressure: string | null
          component_scores: Json | null
          created_at: string | null
          email: string
          energy_regulation_response: string | null
          energy_renewal_response: string | null
          focus_recovery_response: string | null
          full_name: string | null
          growth_priority: string | null
          id: string
          identity_role: string | null
          mental_fitness_baseline: number | null
          meta_skill_scores: Json | null
          onboarding_completed_at: string | null
          onboarding_session_id: string | null
          profile_description: string | null
          profile_type: string | null
          q1_setback_response: string | null
          q2_pressure_response: string | null
          q3_communication_style: string | null
          q4_self_assessed_strength: string | null
          subscription_plan: string | null
          subscription_status: string | null
          updated_at: string | null
          user_archetype: string | null
        }
        Insert: {
          alignment_status?: string | null
          avatar_url?: string | null
          biggest_pressure?: string | null
          component_scores?: Json | null
          created_at?: string | null
          email: string
          energy_regulation_response?: string | null
          energy_renewal_response?: string | null
          focus_recovery_response?: string | null
          full_name?: string | null
          growth_priority?: string | null
          id: string
          identity_role?: string | null
          mental_fitness_baseline?: number | null
          meta_skill_scores?: Json | null
          onboarding_completed_at?: string | null
          onboarding_session_id?: string | null
          profile_description?: string | null
          profile_type?: string | null
          q1_setback_response?: string | null
          q2_pressure_response?: string | null
          q3_communication_style?: string | null
          q4_self_assessed_strength?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          user_archetype?: string | null
        }
        Update: {
          alignment_status?: string | null
          avatar_url?: string | null
          biggest_pressure?: string | null
          component_scores?: Json | null
          created_at?: string | null
          email?: string
          energy_regulation_response?: string | null
          energy_renewal_response?: string | null
          focus_recovery_response?: string | null
          full_name?: string | null
          growth_priority?: string | null
          id?: string
          identity_role?: string | null
          mental_fitness_baseline?: number | null
          meta_skill_scores?: Json | null
          onboarding_completed_at?: string | null
          onboarding_session_id?: string | null
          profile_description?: string | null
          profile_type?: string | null
          q1_setback_response?: string | null
          q2_pressure_response?: string | null
          q3_communication_style?: string | null
          q4_self_assessed_strength?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          user_archetype?: string | null
        }
        Relationships: []
      }
      sanctuary_content: {
        Row: {
          audio_url: string | null
          category: string
          content_type: string
          created_at: string | null
          creator: string | null
          difficulty: string | null
          display_order: number | null
          duration: number
          id: string
          is_active: boolean | null
          language: string | null
          origin: string | null
          steps_count: number | null
          story_hook: string | null
          sub_type: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          used_by: string | null
          voice: string | null
        }
        Insert: {
          audio_url?: string | null
          category: string
          content_type: string
          created_at?: string | null
          creator?: string | null
          difficulty?: string | null
          display_order?: number | null
          duration: number
          id: string
          is_active?: boolean | null
          language?: string | null
          origin?: string | null
          steps_count?: number | null
          story_hook?: string | null
          sub_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          used_by?: string | null
          voice?: string | null
        }
        Update: {
          audio_url?: string | null
          category?: string
          content_type?: string
          created_at?: string | null
          creator?: string | null
          difficulty?: string | null
          display_order?: number | null
          duration?: number
          id?: string
          is_active?: boolean | null
          language?: string | null
          origin?: string | null
          steps_count?: number | null
          story_hook?: string | null
          sub_type?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          used_by?: string | null
          voice?: string | null
        }
        Relationships: []
      }
      sanctuary_content_metadata: {
        Row: {
          benefits: string[] | null
          completion_quote: string | null
          content_id: string
          created_at: string | null
          cue: string | null
          delivery_modality: string[] | null
          essence: string | null
          expected_outcomes: string[] | null
          full_story: string | null
          id: string
          intro_summary: string | null
          parallel: string | null
          real_examples: Json | null
          structured_tags: Json | null
          technique: string | null
          updated_at: string | null
          what_you_need: string[] | null
          why_this_works: string | null
        }
        Insert: {
          benefits?: string[] | null
          completion_quote?: string | null
          content_id: string
          created_at?: string | null
          cue?: string | null
          delivery_modality?: string[] | null
          essence?: string | null
          expected_outcomes?: string[] | null
          full_story?: string | null
          id?: string
          intro_summary?: string | null
          parallel?: string | null
          real_examples?: Json | null
          structured_tags?: Json | null
          technique?: string | null
          updated_at?: string | null
          what_you_need?: string[] | null
          why_this_works?: string | null
        }
        Update: {
          benefits?: string[] | null
          completion_quote?: string | null
          content_id?: string
          created_at?: string | null
          cue?: string | null
          delivery_modality?: string[] | null
          essence?: string | null
          expected_outcomes?: string[] | null
          full_story?: string | null
          id?: string
          intro_summary?: string | null
          parallel?: string | null
          real_examples?: Json | null
          structured_tags?: Json | null
          technique?: string | null
          updated_at?: string | null
          what_you_need?: string[] | null
          why_this_works?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sanctuary_content_metadata_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "sanctuary_content"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctuary_content_steps: {
        Row: {
          breathing_pattern: string | null
          content_id: string
          created_at: string | null
          duration: number | null
          id: string
          instruction: string
          step_order: number
          title: string
          wisdom_note: string | null
        }
        Insert: {
          breathing_pattern?: string | null
          content_id: string
          created_at?: string | null
          duration?: number | null
          id?: string
          instruction: string
          step_order: number
          title: string
          wisdom_note?: string | null
        }
        Update: {
          breathing_pattern?: string | null
          content_id?: string
          created_at?: string | null
          duration?: number | null
          id?: string
          instruction?: string
          step_order?: number
          title?: string
          wisdom_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sanctuary_content_steps_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "sanctuary_content"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctuary_events: {
        Row: {
          category: string
          content_id: string
          content_type: string
          context_data: Json | null
          created_at: string
          duration_seconds: number | null
          effectiveness_rating: number | null
          event_type: string
          id: string
          tags: string[] | null
          timestamp: string
          user_id: string
        }
        Insert: {
          category: string
          content_id: string
          content_type: string
          context_data?: Json | null
          created_at?: string
          duration_seconds?: number | null
          effectiveness_rating?: number | null
          event_type: string
          id?: string
          tags?: string[] | null
          timestamp?: string
          user_id: string
        }
        Update: {
          category?: string
          content_id?: string
          content_type?: string
          context_data?: Json | null
          created_at?: string
          duration_seconds?: number | null
          effectiveness_rating?: number | null
          event_type?: string
          id?: string
          tags?: string[] | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      user_engagements: {
        Row: {
          category: string | null
          content_id: string | null
          content_type: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          timestamp: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          timestamp?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          category: string
          content_id: string
          content_type: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          category: string
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          category?: string
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          effective_content_types: Json | null
          energy_patterns: Json | null
          favorite_content_ids: string[] | null
          id: string
          last_updated: string
          preferred_times: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_content_types?: Json | null
          energy_patterns?: Json | null
          favorite_content_ids?: string[] | null
          id?: string
          last_updated?: string
          preferred_times?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          effective_content_types?: Json | null
          energy_patterns?: Json | null
          favorite_content_ids?: string[] | null
          id?: string
          last_updated?: string
          preferred_times?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      get_calendar_access_token: {
        Args: { _connection_id: string }
        Returns: string
      }
      get_calendar_refresh_token: {
        Args: { _connection_id: string }
        Returns: string
      }
      get_oura_access_token: {
        Args: { _connection_id: string }
        Returns: string
      }
      get_oura_refresh_token: {
        Args: { _connection_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      migrate_calendar_tokens: { Args: never; Returns: undefined }
      migrate_oura_tokens: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "user" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin"],
    },
  },
} as const
