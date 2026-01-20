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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          badge_color: string | null
          category: string
          cluster: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          name: string
          threshold_points: number | null
          threshold_scenarios: number | null
          threshold_skill_progress: number | null
        }
        Insert: {
          badge_color?: string | null
          category: string
          cluster?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id: string
          is_active?: boolean | null
          name: string
          threshold_points?: number | null
          threshold_scenarios?: number | null
          threshold_skill_progress?: number | null
        }
        Update: {
          badge_color?: string | null
          category?: string
          cluster?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          threshold_points?: number | null
          threshold_scenarios?: number | null
          threshold_skill_progress?: number | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: number
          metadata: Json | null
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: number
          metadata?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: number
          metadata?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      calendar_connections: {
        Row: {
          access_token_enc: string | null
          created_at: string
          encrypted_access_token_id: string | null
          encrypted_refresh_token_id: string | null
          id: string
          is_active: boolean | null
          last_sync: string | null
          provider: string
          refresh_token_enc: string | null
          token_enc_v: number | null
          token_expires_at: string | null
          token_iv: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          provider: string
          refresh_token_enc?: string | null
          token_enc_v?: number | null
          token_expires_at?: string | null
          token_iv?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_sync?: string | null
          provider?: string
          refresh_token_enc?: string | null
          token_enc_v?: number | null
          token_expires_at?: string | null
          token_iv?: string | null
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
      certificate_requests: {
        Row: {
          achievement_id: string
          address_blob_enc: string | null
          address_enc_v: number | null
          address_iv: string | null
          city: string | null
          country: string | null
          email: string
          full_name: string
          id: string
          mailing_address: string | null
          notes: string | null
          postal_code: string | null
          processed_at: string | null
          request_status: string | null
          requested_at: string
          shipped_at: string | null
          tracking_number: string | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          address_blob_enc?: string | null
          address_enc_v?: number | null
          address_iv?: string | null
          city?: string | null
          country?: string | null
          email: string
          full_name: string
          id?: string
          mailing_address?: string | null
          notes?: string | null
          postal_code?: string | null
          processed_at?: string | null
          request_status?: string | null
          requested_at?: string
          shipped_at?: string | null
          tracking_number?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          address_blob_enc?: string | null
          address_enc_v?: number | null
          address_iv?: string | null
          city?: string | null
          country?: string | null
          email?: string
          full_name?: string
          id?: string
          mailing_address?: string | null
          notes?: string | null
          postal_code?: string | null
          processed_at?: string | null
          request_status?: string | null
          requested_at?: string
          shipped_at?: string | null
          tracking_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_requests_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
        ]
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
      checkin_tag_definitions: {
        Row: {
          description: string | null
          display_name: string
          energy_balance_max: number | null
          energy_balance_min: number | null
          key: string
          mapped_outcome: string | null
        }
        Insert: {
          description?: string | null
          display_name: string
          energy_balance_max?: number | null
          energy_balance_min?: number | null
          key: string
          mapped_outcome?: string | null
        }
        Update: {
          description?: string | null
          display_name?: string
          energy_balance_max?: number | null
          energy_balance_min?: number | null
          key?: string
          mapped_outcome?: string | null
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
      detected_signals: {
        Row: {
          coaching_readiness: Json | null
          conversation_flow: Json | null
          created_at: string | null
          ei_behaviors: Json | null
          emotions: Json | null
          id: string
          message_id: string | null
          raw_signals: Json | null
          risk_assessment: Json | null
          sentiment: Json | null
          session_id: string
          skill_gaps: Json | null
          skill_strengths: Json | null
        }
        Insert: {
          coaching_readiness?: Json | null
          conversation_flow?: Json | null
          created_at?: string | null
          ei_behaviors?: Json | null
          emotions?: Json | null
          id?: string
          message_id?: string | null
          raw_signals?: Json | null
          risk_assessment?: Json | null
          sentiment?: Json | null
          session_id: string
          skill_gaps?: Json | null
          skill_strengths?: Json | null
        }
        Update: {
          coaching_readiness?: Json | null
          conversation_flow?: Json | null
          created_at?: string | null
          ei_behaviors?: Json | null
          emotions?: Json | null
          id?: string
          message_id?: string | null
          raw_signals?: Json | null
          risk_assessment?: Json | null
          sentiment?: Json | null
          session_id?: string
          skill_gaps?: Json | null
          skill_strengths?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "detected_signals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dialogue_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detected_signals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dialogue_analytics: {
        Row: {
          ai_summary: string | null
          generated_at: string | null
          growth_areas: Json | null
          id: string
          key_moments: Json | null
          meta_skill_scores: Json | null
          overall_performance_score: number | null
          recommendations: Json | null
          session_id: string
          strengths_identified: Json | null
          transcript_highlights: Json | null
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          generated_at?: string | null
          growth_areas?: Json | null
          id?: string
          key_moments?: Json | null
          meta_skill_scores?: Json | null
          overall_performance_score?: number | null
          recommendations?: Json | null
          session_id: string
          strengths_identified?: Json | null
          transcript_highlights?: Json | null
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          generated_at?: string | null
          growth_areas?: Json | null
          id?: string
          key_moments?: Json | null
          meta_skill_scores?: Json | null
          overall_performance_score?: number | null
          recommendations?: Json | null
          session_id?: string
          strengths_identified?: Json | null
          transcript_highlights?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialogue_analytics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dialogue_interventions: {
        Row: {
          action_suggested: string | null
          coach_personality: string | null
          dismissed_at: string | null
          displayed_at: string | null
          framework_used: string | null
          id: string
          intervention_type: string
          meta_data: Json | null
          meta_skill_target: string | null
          observation: string | null
          session_id: string
          sub_skill_target: string | null
          triggered_by_message_id: string | null
          user_acknowledged: boolean | null
          wisdom_source: Json | null
        }
        Insert: {
          action_suggested?: string | null
          coach_personality?: string | null
          dismissed_at?: string | null
          displayed_at?: string | null
          framework_used?: string | null
          id?: string
          intervention_type: string
          meta_data?: Json | null
          meta_skill_target?: string | null
          observation?: string | null
          session_id: string
          sub_skill_target?: string | null
          triggered_by_message_id?: string | null
          user_acknowledged?: boolean | null
          wisdom_source?: Json | null
        }
        Update: {
          action_suggested?: string | null
          coach_personality?: string | null
          dismissed_at?: string | null
          displayed_at?: string | null
          framework_used?: string | null
          id?: string
          intervention_type?: string
          meta_data?: Json | null
          meta_skill_target?: string | null
          observation?: string | null
          session_id?: string
          sub_skill_target?: string | null
          triggered_by_message_id?: string | null
          user_acknowledged?: boolean | null
          wisdom_source?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dialogue_interventions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialogue_interventions_triggered_by_message_id_fkey"
            columns: ["triggered_by_message_id"]
            isOneToOne: false
            referencedRelation: "dialogue_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      dialogue_messages: {
        Row: {
          audio_url: string | null
          content: string
          emotion_displayed: string | null
          id: string
          message_index: number
          meta_data: Json | null
          sender_type: string
          session_id: string
          timestamp: string | null
        }
        Insert: {
          audio_url?: string | null
          content: string
          emotion_displayed?: string | null
          id?: string
          message_index: number
          meta_data?: Json | null
          sender_type: string
          session_id: string
          timestamp?: string | null
        }
        Update: {
          audio_url?: string | null
          content?: string
          emotion_displayed?: string | null
          id?: string
          message_index?: number
          meta_data?: Json | null
          sender_type?: string
          session_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dialogue_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dialogue_sessions: {
        Row: {
          coach_personality: string | null
          context_type: string
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          meta_data: Json | null
          persona_id: string | null
          scenario_context: Json | null
          scenario_id: string | null
          session_status: string | null
          started_at: string | null
          total_interventions: number | null
          total_messages: number | null
          user_id: string
        }
        Insert: {
          coach_personality?: string | null
          context_type?: string
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          meta_data?: Json | null
          persona_id?: string | null
          scenario_context?: Json | null
          scenario_id?: string | null
          session_status?: string | null
          started_at?: string | null
          total_interventions?: number | null
          total_messages?: number | null
          user_id: string
        }
        Update: {
          coach_personality?: string | null
          context_type?: string
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          meta_data?: Json | null
          persona_id?: string | null
          scenario_context?: Json | null
          scenario_id?: string | null
          session_status?: string | null
          started_at?: string | null
          total_interventions?: number | null
          total_messages?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialogue_sessions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "persona_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialogue_sessions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenario_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      dialogue_skill_events: {
        Row: {
          cluster: string | null
          confidence: number | null
          context_note: string | null
          created_at: string | null
          event_type: string
          id: string
          indicators: string[] | null
          message_id: string | null
          meta_skill: string
          session_id: string
          sub_skill: string | null
        }
        Insert: {
          cluster?: string | null
          confidence?: number | null
          context_note?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          indicators?: string[] | null
          message_id?: string | null
          meta_skill: string
          session_id: string
          sub_skill?: string | null
        }
        Update: {
          cluster?: string | null
          confidence?: number | null
          context_note?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          indicators?: string[] | null
          message_id?: string | null
          meta_skill?: string
          session_id?: string
          sub_skill?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dialogue_skill_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dialogue_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialogue_skill_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      meta_skill_definitions: {
        Row: {
          cluster: string
          core_function: string | null
          description: string | null
          display_name: string
          display_order: number | null
          key: string
        }
        Insert: {
          cluster: string
          core_function?: string | null
          description?: string | null
          display_name: string
          display_order?: number | null
          key: string
        }
        Update: {
          cluster?: string
          core_function?: string | null
          description?: string | null
          display_name?: string
          display_order?: number | null
          key?: string
        }
        Relationships: []
      }
      meta_skill_progress: {
        Row: {
          baseline_score: number | null
          cluster: string
          created_at: string
          current_score: number | null
          gaps_identified: number | null
          id: string
          last_session_id: string | null
          meta_skill_key: string
          scenarios_practiced: number | null
          strengths_demonstrated: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_score?: number | null
          cluster: string
          created_at?: string
          current_score?: number | null
          gaps_identified?: number | null
          id?: string
          last_session_id?: string | null
          meta_skill_key: string
          scenarios_practiced?: number | null
          strengths_demonstrated?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_score?: number | null
          cluster?: string
          created_at?: string
          current_score?: number | null
          gaps_identified?: number | null
          id?: string
          last_session_id?: string | null
          meta_skill_key?: string
          scenarios_practiced?: number | null
          strengths_demonstrated?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_skill_progress_last_session_id_fkey"
            columns: ["last_session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      persona_definitions: {
        Row: {
          background_context: string | null
          challenge_level: number | null
          communication_style: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          personality_traits: Json | null
          role: string
          scenario_ids: string[] | null
        }
        Insert: {
          background_context?: string | null
          challenge_level?: number | null
          communication_style?: string | null
          created_at?: string | null
          id: string
          is_active?: boolean | null
          name: string
          personality_traits?: Json | null
          role: string
          scenario_ids?: string[] | null
        }
        Update: {
          background_context?: string | null
          challenge_level?: number | null
          communication_style?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          personality_traits?: Json | null
          role?: string
          scenario_ids?: string[] | null
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
          current_streak: number | null
          email: string
          energy_regulation_response: string | null
          energy_renewal_response: string | null
          focus_recovery_response: string | null
          full_name: string | null
          growth_priority: string | null
          id: string
          identity_role: string | null
          last_streak_celebration: number | null
          longest_streak: number | null
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
          total_self_mastery_points: number | null
          total_social_mastery_points: number | null
          updated_at: string | null
          user_archetype: string | null
        }
        Insert: {
          alignment_status?: string | null
          avatar_url?: string | null
          biggest_pressure?: string | null
          component_scores?: Json | null
          created_at?: string | null
          current_streak?: number | null
          email: string
          energy_regulation_response?: string | null
          energy_renewal_response?: string | null
          focus_recovery_response?: string | null
          full_name?: string | null
          growth_priority?: string | null
          id: string
          identity_role?: string | null
          last_streak_celebration?: number | null
          longest_streak?: number | null
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
          total_self_mastery_points?: number | null
          total_social_mastery_points?: number | null
          updated_at?: string | null
          user_archetype?: string | null
        }
        Update: {
          alignment_status?: string | null
          avatar_url?: string | null
          biggest_pressure?: string | null
          component_scores?: Json | null
          created_at?: string | null
          current_streak?: number | null
          email?: string
          energy_regulation_response?: string | null
          energy_renewal_response?: string | null
          focus_recovery_response?: string | null
          full_name?: string | null
          growth_priority?: string | null
          id?: string
          identity_role?: string | null
          last_streak_celebration?: number | null
          longest_streak?: number | null
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
          total_self_mastery_points?: number | null
          total_social_mastery_points?: number | null
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
          protocol_type: string | null
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
          protocol_type?: string | null
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
          protocol_type?: string | null
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
          checkin_tags: Json | null
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
          mastery_category: Json | null
          meta_skills: Json | null
          parallel: string | null
          real_examples: Json | null
          soft_skills: string[] | null
          structured_tags: Json | null
          sub_skills: Json | null
          technique: string | null
          updated_at: string | null
          usage_occasions: string[] | null
          what_you_need: string[] | null
          why_this_works: string | null
        }
        Insert: {
          benefits?: string[] | null
          checkin_tags?: Json | null
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
          mastery_category?: Json | null
          meta_skills?: Json | null
          parallel?: string | null
          real_examples?: Json | null
          soft_skills?: string[] | null
          structured_tags?: Json | null
          sub_skills?: Json | null
          technique?: string | null
          updated_at?: string | null
          usage_occasions?: string[] | null
          what_you_need?: string[] | null
          why_this_works?: string | null
        }
        Update: {
          benefits?: string[] | null
          checkin_tags?: Json | null
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
          mastery_category?: Json | null
          meta_skills?: Json | null
          parallel?: string | null
          real_examples?: Json | null
          soft_skills?: string[] | null
          structured_tags?: Json | null
          sub_skills?: Json | null
          technique?: string | null
          updated_at?: string | null
          usage_occasions?: string[] | null
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
      saved_debriefs: {
        Row: {
          created_at: string
          debrief_summary: Json | null
          development_areas: Json | null
          duration_seconds: number | null
          frameworks_used: Json | null
          id: string
          persona_type: string | null
          personal_notes: string | null
          scenario_context: string | null
          scenario_domain: string | null
          session_id: string | null
          strengths: Json | null
          title: string | null
          transcript_json: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          debrief_summary?: Json | null
          development_areas?: Json | null
          duration_seconds?: number | null
          frameworks_used?: Json | null
          id?: string
          persona_type?: string | null
          personal_notes?: string | null
          scenario_context?: string | null
          scenario_domain?: string | null
          session_id?: string | null
          strengths?: Json | null
          title?: string | null
          transcript_json?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          debrief_summary?: Json | null
          development_areas?: Json | null
          duration_seconds?: number | null
          frameworks_used?: Json | null
          id?: string
          persona_type?: string | null
          personal_notes?: string | null
          scenario_context?: string | null
          scenario_domain?: string | null
          session_id?: string | null
          strengths?: Json | null
          title?: string | null
          transcript_json?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_debriefs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_definitions: {
        Row: {
          category: string
          context_type: string
          conversation_dynamics: Json | null
          created_at: string | null
          description: string | null
          difficulty_level: string | null
          id: string
          is_active: boolean | null
          scenario_context: Json | null
          target_meta_skills: Json | null
          title: string
        }
        Insert: {
          category: string
          context_type?: string
          conversation_dynamics?: Json | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          id: string
          is_active?: boolean | null
          scenario_context?: Json | null
          target_meta_skills?: Json | null
          title: string
        }
        Update: {
          category?: string
          context_type?: string
          conversation_dynamics?: Json | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          id?: string
          is_active?: boolean | null
          scenario_context?: Json | null
          target_meta_skills?: Json | null
          title?: string
        }
        Relationships: []
      }
      session_feedback: {
        Row: {
          created_at: string | null
          deeper_focus: string | null
          id: string
          next_session_focus: string[] | null
          resonance: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deeper_focus?: string | null
          id?: string
          next_session_focus?: string[] | null
          resonance: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deeper_focus?: string | null
          id?: string
          next_session_focus?: string[] | null
          resonance?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      soft_skill_definitions: {
        Row: {
          description: string | null
          display_name: string
          key: string
          related_meta_skills: string[] | null
        }
        Insert: {
          description?: string | null
          display_name: string
          key: string
          related_meta_skills?: string[] | null
        }
        Update: {
          description?: string | null
          display_name?: string
          key?: string
          related_meta_skills?: string[] | null
        }
        Relationships: []
      }
      sub_skill_definitions: {
        Row: {
          description: string | null
          display_name: string
          key: string
          parent_meta_skill: string | null
        }
        Insert: {
          description?: string | null
          display_name: string
          key: string
          parent_meta_skill?: string | null
        }
        Update: {
          description?: string | null
          display_name?: string
          key?: string
          parent_meta_skill?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_skill_definitions_parent_meta_skill_fkey"
            columns: ["parent_meta_skill"]
            isOneToOne: false
            referencedRelation: "meta_skill_definitions"
            referencedColumns: ["key"]
          },
        ]
      }
      tiny_wins: {
        Row: {
          created_at: string
          detected_at: string
          id: string
          session_id: string | null
          user_id: string
          win_content: string
          win_date: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          id?: string
          session_id?: string | null
          user_id: string
          win_content: string
          win_date?: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          id?: string
          session_id?: string | null
          user_id?: string
          win_content?: string
          win_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiny_wins_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_occasion_definitions: {
        Row: {
          category: string | null
          description: string | null
          display_name: string
          key: string
        }
        Insert: {
          category?: string | null
          description?: string | null
          display_name: string
          key: string
        }
        Update: {
          category?: string | null
          description?: string | null
          display_name?: string
          key?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          earned_at: string
          id: string
          scenarios_at_earn: number | null
          shared_at: string | null
          shared_to_linkedin: boolean | null
          skill_progress_at_earn: number | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          earned_at?: string
          id?: string
          scenarios_at_earn?: number | null
          shared_at?: string | null
          shared_to_linkedin?: boolean | null
          skill_progress_at_earn?: number | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          earned_at?: string
          id?: string
          scenarios_at_earn?: number | null
          shared_at?: string | null
          shared_to_linkedin?: boolean | null
          skill_progress_at_earn?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_coach_insights: {
        Row: {
          confidence_score: number | null
          content_reference: string | null
          created_at: string | null
          extracted_at: string | null
          id: string
          insight_content: string
          insight_type: string
          is_active: boolean | null
          source_session_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          content_reference?: string | null
          created_at?: string | null
          extracted_at?: string | null
          id?: string
          insight_content: string
          insight_type: string
          is_active?: boolean | null
          source_session_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          content_reference?: string | null
          created_at?: string | null
          extracted_at?: string | null
          id?: string
          insight_content?: string
          insight_type?: string
          is_active?: boolean | null
          source_session_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_coach_insights_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
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
      store_calendar_access_token: {
        Args: { _connection_id: string; _token: string }
        Returns: undefined
      }
      store_calendar_refresh_token: {
        Args: { _connection_id: string; _token: string }
        Returns: undefined
      }
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
