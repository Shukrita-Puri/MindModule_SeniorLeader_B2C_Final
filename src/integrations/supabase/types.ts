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
    PostgrestVersion: "14.5"
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
      admin_cron_job_configs: {
        Row: {
          config_json: Json
          created_at: string
          cron_expression: string | null
          description: string | null
          dispatcher_interval_minutes: number
          enabled: boolean
          function_name: string
          id: string
          job_key: string
          job_name: string
          last_updated_by: string | null
          last_updated_by_email: string | null
          max_users_per_run: number
          retry_attempts: number
          retry_delay_seconds: number
          run_windows: Json
          schedule_mode: string
          timezone: string
          timezone_mode: string
          updated_at: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          cron_expression?: string | null
          description?: string | null
          dispatcher_interval_minutes?: number
          enabled?: boolean
          function_name: string
          id?: string
          job_key: string
          job_name: string
          last_updated_by?: string | null
          last_updated_by_email?: string | null
          max_users_per_run?: number
          retry_attempts?: number
          retry_delay_seconds?: number
          run_windows?: Json
          schedule_mode?: string
          timezone?: string
          timezone_mode?: string
          updated_at?: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          cron_expression?: string | null
          description?: string | null
          dispatcher_interval_minutes?: number
          enabled?: boolean
          function_name?: string
          id?: string
          job_key?: string
          job_name?: string
          last_updated_by?: string | null
          last_updated_by_email?: string | null
          max_users_per_run?: number
          retry_attempts?: number
          retry_delay_seconds?: number
          run_windows?: Json
          schedule_mode?: string
          timezone?: string
          timezone_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      apple_notification_events: {
        Row: {
          created_at: string
          detail: Json | null
          environment: string | null
          id: string
          notification_subtype: string | null
          notification_type: string
          notification_uuid: string
          original_transaction_id: string | null
          processed_at: string | null
          signed_date: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          environment?: string | null
          id?: string
          notification_subtype?: string | null
          notification_type: string
          notification_uuid: string
          original_transaction_id?: string | null
          processed_at?: string | null
          signed_date?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json | null
          environment?: string | null
          id?: string
          notification_subtype?: string | null
          notification_type?: string
          notification_uuid?: string
          original_transaction_id?: string | null
          processed_at?: string | null
          signed_date?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      apple_transactions: {
        Row: {
          auto_renew_status: boolean | null
          created_at: string
          environment: string | null
          expires_at: string | null
          grace_period_expires_at: string | null
          id: string
          is_upgraded: boolean
          notification_subtype: string | null
          notification_type: string | null
          notification_uuid: string | null
          original_transaction_id: string
          product_id: string
          purchase_date: string | null
          raw_payload: Json | null
          renewal_product_id: string | null
          revoked_at: string | null
          signed_date: string | null
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew_status?: boolean | null
          created_at?: string
          environment?: string | null
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          is_upgraded?: boolean
          notification_subtype?: string | null
          notification_type?: string | null
          notification_uuid?: string | null
          original_transaction_id: string
          product_id: string
          purchase_date?: string | null
          raw_payload?: Json | null
          renewal_product_id?: string | null
          revoked_at?: string | null
          signed_date?: string | null
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew_status?: boolean | null
          created_at?: string
          environment?: string | null
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          is_upgraded?: boolean
          notification_subtype?: string | null
          notification_type?: string | null
          notification_uuid?: string | null
          original_transaction_id?: string
          product_id?: string
          purchase_date?: string | null
          raw_payload?: Json | null
          renewal_product_id?: string | null
          revoked_at?: string | null
          signed_date?: string | null
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendee_relationships: {
        Row: {
          attendee_domain: string | null
          attendee_email: string
          attendee_name: string | null
          confidence: number | null
          created_at: string
          evidence_summary: string | null
          evidence_url: string | null
          expires_at: string
          id: string
          resolved_at: string
          role: string
          seniority: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendee_domain?: string | null
          attendee_email: string
          attendee_name?: string | null
          confidence?: number | null
          created_at?: string
          evidence_summary?: string | null
          evidence_url?: string | null
          expires_at?: string
          id?: string
          resolved_at?: string
          role?: string
          seniority?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendee_domain?: string | null
          attendee_email?: string
          attendee_name?: string | null
          confidence?: number | null
          created_at?: string
          evidence_summary?: string | null
          evidence_url?: string | null
          expires_at?: string
          id?: string
          resolved_at?: string
          role?: string
          seniority?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendee_resolver_log: {
        Row: {
          attendee_email: string
          created_at: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          attendee_email: string
          created_at?: string
          id?: string
          status: string
          user_id: string
        }
        Update: {
          attendee_email?: string
          created_at?: string
          id?: string
          status?: string
          user_id?: string
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
      behavior_logs: {
        Row: {
          behavior_type: string
          context_event_id: string | null
          control_level: string | null
          created_at: string
          energy_after: string | null
          event_title: string | null
          id: string
          user_id: string
        }
        Insert: {
          behavior_type: string
          context_event_id?: string | null
          control_level?: string | null
          created_at?: string
          energy_after?: string | null
          event_title?: string | null
          id?: string
          user_id: string
        }
        Update: {
          behavior_type?: string
          context_event_id?: string | null
          control_level?: string | null
          created_at?: string
          energy_after?: string | null
          event_title?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_invites: {
        Row: {
          beta_expires_at: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          status: string
        }
        Insert: {
          beta_expires_at: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          status?: string
        }
        Update: {
          beta_expires_at?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          status?: string
        }
        Relationships: []
      }
      brief_snapshots: {
        Row: {
          baseline_body_text: string | null
          baseline_lean_on: string | null
          baseline_lean_on_source: string | null
          baseline_phrase: string | null
          baseline_score: number | null
          baseline_signal_pills: Json | null
          baseline_state: string | null
          baseline_tier: string | null
          baseline_watch_for: string | null
          baseline_watch_for_source: string | null
          body_text: string | null
          brief_source: string
          checkin_snapshot: Json | null
          created_at: string
          daily_checkin_id: string | null
          delivered_at: string | null
          driver: string | null
          feedback_text: string | null
          id: string
          input_signature: string
          lean_on: string | null
          lean_on_source: string | null
          llm_attempts: Json | null
          llm_fallback_reason: string | null
          local_date: string
          payload_json: Json | null
          phrase: string | null
          pillar_mode: string | null
          prompt_version: string
          refined_body_text: string | null
          refined_lean_on: string | null
          refined_lean_on_source: string | null
          refined_phrase: string | null
          refined_score: number | null
          refined_signal_pills: Json | null
          refined_state: string | null
          refined_tier: string | null
          refined_watch_for: string | null
          refined_watch_for_source: string | null
          score: number | null
          signal_pills: Json | null
          tier: string | null
          time_window: string
          updated_at: string
          user_id: string
          user_rating: string | null
          validator_rejections: Json | null
          viewed_at: string | null
          watch_for: string | null
          watch_for_source: string | null
          wearable_snapshot: Json | null
        }
        Insert: {
          baseline_body_text?: string | null
          baseline_lean_on?: string | null
          baseline_lean_on_source?: string | null
          baseline_phrase?: string | null
          baseline_score?: number | null
          baseline_signal_pills?: Json | null
          baseline_state?: string | null
          baseline_tier?: string | null
          baseline_watch_for?: string | null
          baseline_watch_for_source?: string | null
          body_text?: string | null
          brief_source: string
          checkin_snapshot?: Json | null
          created_at?: string
          daily_checkin_id?: string | null
          delivered_at?: string | null
          driver?: string | null
          feedback_text?: string | null
          id?: string
          input_signature: string
          lean_on?: string | null
          lean_on_source?: string | null
          llm_attempts?: Json | null
          llm_fallback_reason?: string | null
          local_date: string
          payload_json?: Json | null
          phrase?: string | null
          pillar_mode?: string | null
          prompt_version: string
          refined_body_text?: string | null
          refined_lean_on?: string | null
          refined_lean_on_source?: string | null
          refined_phrase?: string | null
          refined_score?: number | null
          refined_signal_pills?: Json | null
          refined_state?: string | null
          refined_tier?: string | null
          refined_watch_for?: string | null
          refined_watch_for_source?: string | null
          score?: number | null
          signal_pills?: Json | null
          tier?: string | null
          time_window: string
          updated_at?: string
          user_id: string
          user_rating?: string | null
          validator_rejections?: Json | null
          viewed_at?: string | null
          watch_for?: string | null
          watch_for_source?: string | null
          wearable_snapshot?: Json | null
        }
        Update: {
          baseline_body_text?: string | null
          baseline_lean_on?: string | null
          baseline_lean_on_source?: string | null
          baseline_phrase?: string | null
          baseline_score?: number | null
          baseline_signal_pills?: Json | null
          baseline_state?: string | null
          baseline_tier?: string | null
          baseline_watch_for?: string | null
          baseline_watch_for_source?: string | null
          body_text?: string | null
          brief_source?: string
          checkin_snapshot?: Json | null
          created_at?: string
          daily_checkin_id?: string | null
          delivered_at?: string | null
          driver?: string | null
          feedback_text?: string | null
          id?: string
          input_signature?: string
          lean_on?: string | null
          lean_on_source?: string | null
          llm_attempts?: Json | null
          llm_fallback_reason?: string | null
          local_date?: string
          payload_json?: Json | null
          phrase?: string | null
          pillar_mode?: string | null
          prompt_version?: string
          refined_body_text?: string | null
          refined_lean_on?: string | null
          refined_lean_on_source?: string | null
          refined_phrase?: string | null
          refined_score?: number | null
          refined_signal_pills?: Json | null
          refined_state?: string | null
          refined_tier?: string | null
          refined_watch_for?: string | null
          refined_watch_for_source?: string | null
          score?: number | null
          signal_pills?: Json | null
          tier?: string | null
          time_window?: string
          updated_at?: string
          user_id?: string
          user_rating?: string | null
          validator_rejections?: Json | null
          viewed_at?: string | null
          watch_for?: string | null
          watch_for_source?: string | null
          wearable_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "brief_snapshots_daily_checkin_id_fkey"
            columns: ["daily_checkin_id"]
            isOneToOne: false
            referencedRelation: "daily_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token_enc: string | null
          consecutive_delay_count: number
          created_at: string
          encrypted_access_token_id: string | null
          encrypted_refresh_token_id: string | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_error_at: string | null
          last_error_reason: string | null
          last_sync: string | null
          last_sync_delayed_at: string | null
          next_retry_at: string | null
          provider: string
          refresh_token_enc: string | null
          refresh_token_iv: string | null
          retry_after_seconds: number | null
          status_authoritative_at: string | null
          status_source: string | null
          sync_status: string | null
          token_enc_v: number | null
          token_expires_at: string | null
          token_iv: string | null
          updated_at: string
          user_id: string
          webhook_channel_id: string | null
          webhook_client_state: string | null
          webhook_expiration: string | null
          webhook_last_error: string | null
          webhook_last_error_at: string | null
          webhook_last_registered_at: string | null
          webhook_resource_id: string | null
        }
        Insert: {
          access_token_enc?: string | null
          consecutive_delay_count?: number
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_reason?: string | null
          last_sync?: string | null
          last_sync_delayed_at?: string | null
          next_retry_at?: string | null
          provider: string
          refresh_token_enc?: string | null
          refresh_token_iv?: string | null
          retry_after_seconds?: number | null
          status_authoritative_at?: string | null
          status_source?: string | null
          sync_status?: string | null
          token_enc_v?: number | null
          token_expires_at?: string | null
          token_iv?: string | null
          updated_at?: string
          user_id: string
          webhook_channel_id?: string | null
          webhook_client_state?: string | null
          webhook_expiration?: string | null
          webhook_last_error?: string | null
          webhook_last_error_at?: string | null
          webhook_last_registered_at?: string | null
          webhook_resource_id?: string | null
        }
        Update: {
          access_token_enc?: string | null
          consecutive_delay_count?: number
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_reason?: string | null
          last_sync?: string | null
          last_sync_delayed_at?: string | null
          next_retry_at?: string | null
          provider?: string
          refresh_token_enc?: string | null
          refresh_token_iv?: string | null
          retry_after_seconds?: number | null
          status_authoritative_at?: string | null
          status_source?: string | null
          sync_status?: string | null
          token_enc_v?: number | null
          token_expires_at?: string | null
          token_iv?: string | null
          updated_at?: string
          user_id?: string
          webhook_channel_id?: string | null
          webhook_client_state?: string | null
          webhook_expiration?: string | null
          webhook_last_error?: string | null
          webhook_last_error_at?: string | null
          webhook_last_registered_at?: string | null
          webhook_resource_id?: string | null
        }
        Relationships: []
      }
      calendar_event_classifications: {
        Row: {
          calendar_event_id: string
          classified_by: string
          created_at: string
          event_type: string
          id: string
          stakes_level: string
          user_id: string
        }
        Insert: {
          calendar_event_id: string
          classified_by?: string
          created_at?: string
          event_type: string
          id?: string
          stakes_level?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string
          classified_by?: string
          created_at?: string
          event_type?: string
          id?: string
          stakes_level?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees_count: number | null
          category_confidence: string | null
          category_resolved_at: string | null
          category_resolved_by: string | null
          created_at: string
          end_time: string
          event_category: string | null
          event_metadata: Json | null
          event_subcategory: string | null
          external_id: string
          flight_duration_minutes: number | null
          id: string
          identity_key: string | null
          is_all_day: boolean
          is_organizer: boolean | null
          is_recurring: boolean | null
          provider: string
          start_time: string
          title: string | null
          user_id: string
        }
        Insert: {
          attendees_count?: number | null
          category_confidence?: string | null
          category_resolved_at?: string | null
          category_resolved_by?: string | null
          created_at?: string
          end_time: string
          event_category?: string | null
          event_metadata?: Json | null
          event_subcategory?: string | null
          external_id: string
          flight_duration_minutes?: number | null
          id?: string
          identity_key?: string | null
          is_all_day?: boolean
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          provider?: string
          start_time: string
          title?: string | null
          user_id: string
        }
        Update: {
          attendees_count?: number | null
          category_confidence?: string | null
          category_resolved_at?: string | null
          category_resolved_by?: string | null
          created_at?: string
          end_time?: string
          event_category?: string | null
          event_metadata?: Json | null
          event_subcategory?: string | null
          external_id?: string
          flight_duration_minutes?: number | null
          id?: string
          identity_key?: string | null
          is_all_day?: boolean
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          provider?: string
          start_time?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendar_quota_cooldowns: {
        Row: {
          cooldown_until: string
          created_at: string
          hit_count: number
          last_reason: string | null
          provider: string
          retry_after_seconds: number
          scope_key: string
          updated_at: string
        }
        Insert: {
          cooldown_until: string
          created_at?: string
          hit_count?: number
          last_reason?: string | null
          provider: string
          retry_after_seconds: number
          scope_key: string
          updated_at?: string
        }
        Update: {
          cooldown_until?: string
          created_at?: string
          hit_count?: number
          last_reason?: string | null
          provider?: string
          retry_after_seconds?: number
          scope_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      cancellation_feedback: {
        Row: {
          canceled_at: string | null
          id: string
          reason: string
          reason_details: string | null
          retention_offer_accepted: boolean | null
          retention_offer_shown: string | null
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          id?: string
          reason: string
          reason_details?: string | null
          retention_offer_accepted?: boolean | null
          retention_offer_shown?: string | null
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          id?: string
          reason?: string
          reason_details?: string | null
          retention_offer_accepted?: boolean | null
          retention_offer_shown?: string | null
          user_id?: string
        }
        Relationships: []
      }
      causality_findings: {
        Row: {
          computed_for_date: string
          created_at: string
          event_subcategory: string | null
          pattern_kind: string
          payload: Json
          signal_summary: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_for_date: string
          created_at?: string
          event_subcategory?: string | null
          pattern_kind?: string
          payload: Json
          signal_summary?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_for_date?: string
          created_at?: string
          event_subcategory?: string | null
          pattern_kind?: string
          payload?: Json
          signal_summary?: Json | null
          updated_at?: string
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
      checkin_patterns: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          day_of_week: number | null
          id: string
          last_observed_at: string | null
          observation_count: number | null
          pattern_description: string | null
          pattern_type: string
          prediction_accuracy: number | null
          time_window: string | null
          typical_outcome: string | null
          typical_tier: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string
          last_observed_at?: string | null
          observation_count?: number | null
          pattern_description?: string | null
          pattern_type: string
          prediction_accuracy?: number | null
          time_window?: string | null
          typical_outcome?: string | null
          typical_tier?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string
          last_observed_at?: string | null
          observation_count?: number | null
          pattern_description?: string | null
          pattern_type?: string
          prediction_accuracy?: number | null
          time_window?: string | null
          typical_outcome?: string | null
          typical_tier?: string | null
          updated_at?: string | null
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
      coach_accountability_tracker: {
        Row: {
          check_in_due_date: string | null
          commitment_text: string
          commitment_type: string | null
          committed_at: string | null
          completion_evidence: string | null
          created_at: string | null
          id: string
          last_checked_at: string | null
          meta_skill: string | null
          outcome_note: string | null
          pattern_area: string | null
          resolved_at: string | null
          session_id: string
          status: string | null
          target_duration_days: number | null
          target_frequency: string | null
          target_practice_id: string | null
          times_checked: number | null
          user_id: string
          was_helpful: boolean | null
        }
        Insert: {
          check_in_due_date?: string | null
          commitment_text: string
          commitment_type?: string | null
          committed_at?: string | null
          completion_evidence?: string | null
          created_at?: string | null
          id?: string
          last_checked_at?: string | null
          meta_skill?: string | null
          outcome_note?: string | null
          pattern_area?: string | null
          resolved_at?: string | null
          session_id: string
          status?: string | null
          target_duration_days?: number | null
          target_frequency?: string | null
          target_practice_id?: string | null
          times_checked?: number | null
          user_id: string
          was_helpful?: boolean | null
        }
        Update: {
          check_in_due_date?: string | null
          commitment_text?: string
          commitment_type?: string | null
          committed_at?: string | null
          completion_evidence?: string | null
          created_at?: string | null
          id?: string
          last_checked_at?: string | null
          meta_skill?: string | null
          outcome_note?: string | null
          pattern_area?: string | null
          resolved_at?: string | null
          session_id?: string
          status?: string | null
          target_duration_days?: number | null
          target_frequency?: string | null
          target_practice_id?: string | null
          times_checked?: number | null
          user_id?: string
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_accountability_tracker_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_breakthrough_moments: {
        Row: {
          action_taken: string | null
          breakthrough_content: string | null
          breakthrough_type: string | null
          checked_at: string | null
          created_at: string | null
          id: string
          impact_score: number | null
          message_id: string | null
          meta_skill: string | null
          pattern_area: string | null
          preceded_by_probe: boolean | null
          probe_question: string | null
          session_id: string
          user_id: string
          was_acted_on: boolean | null
        }
        Insert: {
          action_taken?: string | null
          breakthrough_content?: string | null
          breakthrough_type?: string | null
          checked_at?: string | null
          created_at?: string | null
          id?: string
          impact_score?: number | null
          message_id?: string | null
          meta_skill?: string | null
          pattern_area?: string | null
          preceded_by_probe?: boolean | null
          probe_question?: string | null
          session_id: string
          user_id: string
          was_acted_on?: boolean | null
        }
        Update: {
          action_taken?: string | null
          breakthrough_content?: string | null
          breakthrough_type?: string | null
          checked_at?: string | null
          created_at?: string | null
          id?: string
          impact_score?: number | null
          message_id?: string | null
          meta_skill?: string | null
          pattern_area?: string | null
          preceded_by_probe?: boolean | null
          probe_question?: string | null
          session_id?: string
          user_id?: string
          was_acted_on?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_breakthrough_moments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dialogue_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_breakthrough_moments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_intervention_outcomes: {
        Row: {
          content_id: string | null
          content_type: string | null
          context_state: string | null
          context_tags: string[] | null
          created_at: string | null
          effectiveness_rating: number | null
          follow_up_state: string | null
          id: string
          intervention_content: string
          intervention_type: string
          session_id: string | null
          success_weight: number | null
          updated_at: string | null
          user_id: string
          user_response_type: string | null
        }
        Insert: {
          content_id?: string | null
          content_type?: string | null
          context_state?: string | null
          context_tags?: string[] | null
          created_at?: string | null
          effectiveness_rating?: number | null
          follow_up_state?: string | null
          id?: string
          intervention_content: string
          intervention_type: string
          session_id?: string | null
          success_weight?: number | null
          updated_at?: string | null
          user_id: string
          user_response_type?: string | null
        }
        Update: {
          content_id?: string | null
          content_type?: string | null
          context_state?: string | null
          context_tags?: string[] | null
          created_at?: string | null
          effectiveness_rating?: number | null
          follow_up_state?: string | null
          id?: string
          intervention_content?: string
          intervention_type?: string
          session_id?: string | null
          success_weight?: number | null
          updated_at?: string | null
          user_id?: string
          user_response_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_intervention_outcomes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_memory_index: {
        Row: {
          access_count: number | null
          created_at: string | null
          id: string
          importance_score: number | null
          key_themes: string[] | null
          last_accessed_at: string | null
          memory_content: string
          memory_context: string | null
          memory_type: string
          message_id: string | null
          meta_skill: string | null
          pattern_area: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          access_count?: number | null
          created_at?: string | null
          id?: string
          importance_score?: number | null
          key_themes?: string[] | null
          last_accessed_at?: string | null
          memory_content: string
          memory_context?: string | null
          memory_type: string
          message_id?: string | null
          meta_skill?: string | null
          pattern_area?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          access_count?: number | null
          created_at?: string | null
          id?: string
          importance_score?: number | null
          key_themes?: string[] | null
          last_accessed_at?: string | null
          memory_content?: string
          memory_context?: string | null
          memory_type?: string
          message_id?: string | null
          meta_skill?: string | null
          pattern_area?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_memory_index_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dialogue_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_memory_index_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_pattern_observations: {
        Row: {
          created_at: string | null
          first_observed_at: string | null
          id: string
          improvement_evidence: string | null
          is_active: boolean | null
          is_improving: boolean | null
          last_observed_at: string | null
          meta_skill: string | null
          named_at: string | null
          observation_count: number | null
          pattern_area: string | null
          pattern_context: string | null
          pattern_description: string
          pattern_type: string
          related_themes: string[] | null
          resolved_at: string | null
          session_id: string | null
          user_acknowledged: boolean | null
          user_id: string
          was_named_to_user: boolean | null
        }
        Insert: {
          created_at?: string | null
          first_observed_at?: string | null
          id?: string
          improvement_evidence?: string | null
          is_active?: boolean | null
          is_improving?: boolean | null
          last_observed_at?: string | null
          meta_skill?: string | null
          named_at?: string | null
          observation_count?: number | null
          pattern_area?: string | null
          pattern_context?: string | null
          pattern_description: string
          pattern_type: string
          related_themes?: string[] | null
          resolved_at?: string | null
          session_id?: string | null
          user_acknowledged?: boolean | null
          user_id: string
          was_named_to_user?: boolean | null
        }
        Update: {
          created_at?: string | null
          first_observed_at?: string | null
          id?: string
          improvement_evidence?: string | null
          is_active?: boolean | null
          is_improving?: boolean | null
          last_observed_at?: string | null
          meta_skill?: string | null
          named_at?: string | null
          observation_count?: number | null
          pattern_area?: string | null
          pattern_context?: string | null
          pattern_description?: string
          pattern_type?: string
          related_themes?: string[] | null
          resolved_at?: string | null
          session_id?: string | null
          user_acknowledged?: boolean | null
          user_id?: string
          was_named_to_user?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_pattern_observations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_probing_effectiveness: {
        Row: {
          created_at: string | null
          effectiveness_score: number | null
          id: string
          insight_markers: string[] | null
          led_to_insight: boolean | null
          message_id: string | null
          pattern_area: string | null
          probe_question: string | null
          probe_type: string | null
          session_id: string
          topic_area: string | null
          user_id: string
          user_response: string | null
          user_state_at_time: string | null
          why_effective: string | null
        }
        Insert: {
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          insight_markers?: string[] | null
          led_to_insight?: boolean | null
          message_id?: string | null
          pattern_area?: string | null
          probe_question?: string | null
          probe_type?: string | null
          session_id: string
          topic_area?: string | null
          user_id: string
          user_response?: string | null
          user_state_at_time?: string | null
          why_effective?: string | null
        }
        Update: {
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          insight_markers?: string[] | null
          led_to_insight?: boolean | null
          message_id?: string | null
          pattern_area?: string | null
          probe_question?: string | null
          probe_type?: string | null
          session_id?: string
          topic_area?: string | null
          user_id?: string
          user_response?: string | null
          user_state_at_time?: string | null
          why_effective?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_probing_effectiveness_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dialogue_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_probing_effectiveness_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_scenarios_detected: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          detected_at: string | null
          dimension: string | null
          event_types: string[] | null
          evidence: string | null
          id: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_reason: string | null
          scenario: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          dimension?: string | null
          event_types?: string[] | null
          evidence?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_reason?: string | null
          scenario: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          detected_at?: string | null
          dimension?: string | null
          event_types?: string[] | null
          evidence?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_reason?: string | null
          scenario?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_session_summaries: {
        Row: {
          breakthrough_moment: string | null
          commitments_made: string[] | null
          created_at: string | null
          dominant_pattern: string | null
          emotional_arc: string | null
          id: string
          jit_relevant_insight: string | null
          key_topics: string[] | null
          new_themes: string[] | null
          next_session_focus: string | null
          practices_recommended: string[] | null
          recurring_themes: string[] | null
          session_id: string
          session_quality_score: number | null
          summary_text: string
          user_id: string
          wisdom_referenced: string[] | null
        }
        Insert: {
          breakthrough_moment?: string | null
          commitments_made?: string[] | null
          created_at?: string | null
          dominant_pattern?: string | null
          emotional_arc?: string | null
          id?: string
          jit_relevant_insight?: string | null
          key_topics?: string[] | null
          new_themes?: string[] | null
          next_session_focus?: string | null
          practices_recommended?: string[] | null
          recurring_themes?: string[] | null
          session_id: string
          session_quality_score?: number | null
          summary_text: string
          user_id: string
          wisdom_referenced?: string[] | null
        }
        Update: {
          breakthrough_moment?: string | null
          commitments_made?: string[] | null
          created_at?: string | null
          dominant_pattern?: string | null
          emotional_arc?: string | null
          id?: string
          jit_relevant_insight?: string | null
          key_topics?: string[] | null
          new_themes?: string[] | null
          next_session_focus?: string | null
          practices_recommended?: string[] | null
          recurring_themes?: string[] | null
          session_id?: string
          session_quality_score?: number | null
          summary_text?: string
          user_id?: string
          wisdom_referenced?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_session_summaries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_surface_messages: {
        Row: {
          created_at: string | null
          dismissed: boolean | null
          expires_at: string
          id: string
          message: string
          trigger_condition: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dismissed?: boolean | null
          expires_at: string
          id?: string
          message: string
          trigger_condition?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          dismissed?: boolean | null
          expires_at?: string
          id?: string
          message?: string
          trigger_condition?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_tools_offered: {
        Row: {
          check_in_at: string | null
          checked_at: string | null
          commitment_timeframe: string | null
          created_at: string | null
          event_types: string[] | null
          expires_at: string | null
          id: string
          offered_at: string | null
          pattern_area: string | null
          pattern_discovered: string | null
          scenario: string | null
          session_id: string | null
          status: string | null
          tool_description: string | null
          tool_name: string
          tool_type: string | null
          used_at: string | null
          user_id: string
          user_response: string | null
          was_effective: boolean | null
          was_used: boolean | null
        }
        Insert: {
          check_in_at?: string | null
          checked_at?: string | null
          commitment_timeframe?: string | null
          created_at?: string | null
          event_types?: string[] | null
          expires_at?: string | null
          id?: string
          offered_at?: string | null
          pattern_area?: string | null
          pattern_discovered?: string | null
          scenario?: string | null
          session_id?: string | null
          status?: string | null
          tool_description?: string | null
          tool_name: string
          tool_type?: string | null
          used_at?: string | null
          user_id: string
          user_response?: string | null
          was_effective?: boolean | null
          was_used?: boolean | null
        }
        Update: {
          check_in_at?: string | null
          checked_at?: string | null
          commitment_timeframe?: string | null
          created_at?: string | null
          event_types?: string[] | null
          expires_at?: string | null
          id?: string
          offered_at?: string | null
          pattern_area?: string | null
          pattern_discovered?: string | null
          scenario?: string | null
          session_id?: string | null
          status?: string | null
          tool_description?: string | null
          tool_name?: string
          tool_type?: string | null
          used_at?: string | null
          user_id?: string
          user_response?: string | null
          was_effective?: boolean | null
          was_used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_tools_offered_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dialogue_sessions"
            referencedColumns: ["id"]
          },
        ]
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
          body_energy_level: number | null
          body_tension_level: number | null
          carry_load_level: number | null
          checkin_date: string
          clarity_level: number | null
          confidence_level: number | null
          created_at: string
          data_sources: Json | null
          emotion_level: number | null
          energy_balance: number | null
          id: string
          mental_sharpness_level: number | null
          outcome: string
          pressure_level: number | null
          recovery_yesterday_level: number | null
          regulation_level: number | null
          skipped: boolean | null
          sleep_hours: number | null
          sleep_quality: number | null
          sleep_wake_type: number | null
          state_tags: string[] | null
          time_window: string
          timestamp: string
          user_id: string
        }
        Insert: {
          body_energy_level?: number | null
          body_tension_level?: number | null
          carry_load_level?: number | null
          checkin_date: string
          clarity_level?: number | null
          confidence_level?: number | null
          created_at?: string
          data_sources?: Json | null
          emotion_level?: number | null
          energy_balance?: number | null
          id?: string
          mental_sharpness_level?: number | null
          outcome: string
          pressure_level?: number | null
          recovery_yesterday_level?: number | null
          regulation_level?: number | null
          skipped?: boolean | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          sleep_wake_type?: number | null
          state_tags?: string[] | null
          time_window?: string
          timestamp: string
          user_id: string
        }
        Update: {
          body_energy_level?: number | null
          body_tension_level?: number | null
          carry_load_level?: number | null
          checkin_date?: string
          clarity_level?: number | null
          confidence_level?: number | null
          created_at?: string
          data_sources?: Json | null
          emotion_level?: number | null
          energy_balance?: number | null
          id?: string
          mental_sharpness_level?: number | null
          outcome?: string
          pressure_level?: number | null
          recovery_yesterday_level?: number | null
          regulation_level?: number | null
          skipped?: boolean | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          sleep_wake_type?: number | null
          state_tags?: string[] | null
          time_window?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_context_snapshot: {
        Row: {
          calendar_demand_score: number | null
          check_in_count_today: number
          created_at: string
          demand_load: string | null
          demand_pressure: string | null
          has_high_stakes: boolean | null
          id: string
          inner_score: number | null
          inner_tier: string | null
          last_check_in_window: string | null
          local_date: string
          morning_baseline_score: number | null
          mrs_window: string
          pattern_signals: Json | null
          pillar_mode: string | null
          readiness_score_baseline: number | null
          readiness_score_refined: number | null
          readiness_state: string | null
          refined_contribution: number | null
          signal_pills: Json | null
          strategic_context: Json | null
          supply_demand_gap_flag: string | null
          tier_cap_reason: string | null
          tier_displayed: string | null
          updated_at: string
          user_id: string
          weight_provenance: Json | null
          weighting_mode: string | null
        }
        Insert: {
          calendar_demand_score?: number | null
          check_in_count_today?: number
          created_at?: string
          demand_load?: string | null
          demand_pressure?: string | null
          has_high_stakes?: boolean | null
          id?: string
          inner_score?: number | null
          inner_tier?: string | null
          last_check_in_window?: string | null
          local_date: string
          morning_baseline_score?: number | null
          mrs_window?: string
          pattern_signals?: Json | null
          pillar_mode?: string | null
          readiness_score_baseline?: number | null
          readiness_score_refined?: number | null
          readiness_state?: string | null
          refined_contribution?: number | null
          signal_pills?: Json | null
          strategic_context?: Json | null
          supply_demand_gap_flag?: string | null
          tier_cap_reason?: string | null
          tier_displayed?: string | null
          updated_at?: string
          user_id: string
          weight_provenance?: Json | null
          weighting_mode?: string | null
        }
        Update: {
          calendar_demand_score?: number | null
          check_in_count_today?: number
          created_at?: string
          demand_load?: string | null
          demand_pressure?: string | null
          has_high_stakes?: boolean | null
          id?: string
          inner_score?: number | null
          inner_tier?: string | null
          last_check_in_window?: string | null
          local_date?: string
          morning_baseline_score?: number | null
          mrs_window?: string
          pattern_signals?: Json | null
          pillar_mode?: string | null
          readiness_score_baseline?: number | null
          readiness_score_refined?: number | null
          readiness_state?: string | null
          refined_contribution?: number | null
          signal_pills?: Json | null
          strategic_context?: Json | null
          supply_demand_gap_flag?: string | null
          tier_cap_reason?: string | null
          tier_displayed?: string | null
          updated_at?: string
          user_id?: string
          weight_provenance?: Json | null
          weighting_mode?: string | null
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
          plan_ledger: Json | null
          recommended_practice_ids: string[] | null
          recommended_practices_count: number | null
          ritual_date: string
          session_period: string
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
          plan_ledger?: Json | null
          recommended_practice_ids?: string[] | null
          recommended_practices_count?: number | null
          ritual_date: string
          session_period?: string
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
          plan_ledger?: Json | null
          recommended_practice_ids?: string[] | null
          recommended_practices_count?: number | null
          ritual_date?: string
          session_period?: string
          soundscape_completed?: boolean | null
          soundscape_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_themes: {
        Row: {
          archetype: string | null
          calendar_load: string | null
          calendar_pressure: string | null
          check_in_outcome: string | null
          created_at: string | null
          id: string
          inner_readiness_score: number | null
          lean_on: string | null
          theme_date: string
          theme_driver: string | null
          theme_phrase: string
          time_of_day: string | null
          user_id: string
          watch_for: string | null
        }
        Insert: {
          archetype?: string | null
          calendar_load?: string | null
          calendar_pressure?: string | null
          check_in_outcome?: string | null
          created_at?: string | null
          id?: string
          inner_readiness_score?: number | null
          lean_on?: string | null
          theme_date: string
          theme_driver?: string | null
          theme_phrase: string
          time_of_day?: string | null
          user_id: string
          watch_for?: string | null
        }
        Update: {
          archetype?: string | null
          calendar_load?: string | null
          calendar_pressure?: string | null
          check_in_outcome?: string | null
          created_at?: string | null
          id?: string
          inner_readiness_score?: number | null
          lean_on?: string | null
          theme_date?: string
          theme_driver?: string | null
          theme_phrase?: string
          time_of_day?: string | null
          user_id?: string
          watch_for?: string | null
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
          key_themes: string[] | null
          message_index: number
          message_type: string | null
          meta_data: Json | null
          referenced_practice_id: string | null
          sender_type: string
          sentiment_score: number | null
          session_id: string
          timestamp: string | null
        }
        Insert: {
          audio_url?: string | null
          content: string
          emotion_displayed?: string | null
          id?: string
          key_themes?: string[] | null
          message_index: number
          message_type?: string | null
          meta_data?: Json | null
          referenced_practice_id?: string | null
          sender_type: string
          sentiment_score?: number | null
          session_id: string
          timestamp?: string | null
        }
        Update: {
          audio_url?: string | null
          content?: string
          emotion_displayed?: string | null
          id?: string
          key_themes?: string[] | null
          message_index?: number
          message_type?: string | null
          meta_data?: Json | null
          referenced_practice_id?: string | null
          sender_type?: string
          sentiment_score?: number | null
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
          commitments_made: string[] | null
          context_type: string
          created_at: string | null
          dominant_pattern: string | null
          duration_seconds: number | null
          ended_at: string | null
          flow_type: string | null
          id: string
          inner_readiness_score: number | null
          inner_readiness_tier: string | null
          meta_data: Json | null
          persona_id: string | null
          practices_completed: string[] | null
          practices_recommended: string[] | null
          scenario_context: Json | null
          scenario_id: string | null
          session_status: string | null
          session_title: string | null
          started_at: string | null
          total_interventions: number | null
          total_messages: number | null
          user_id: string
        }
        Insert: {
          coach_personality?: string | null
          commitments_made?: string[] | null
          context_type?: string
          created_at?: string | null
          dominant_pattern?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          flow_type?: string | null
          id?: string
          inner_readiness_score?: number | null
          inner_readiness_tier?: string | null
          meta_data?: Json | null
          persona_id?: string | null
          practices_completed?: string[] | null
          practices_recommended?: string[] | null
          scenario_context?: Json | null
          scenario_id?: string | null
          session_status?: string | null
          session_title?: string | null
          started_at?: string | null
          total_interventions?: number | null
          total_messages?: number | null
          user_id: string
        }
        Update: {
          coach_personality?: string | null
          commitments_made?: string[] | null
          context_type?: string
          created_at?: string | null
          dominant_pattern?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          flow_type?: string | null
          id?: string
          inner_readiness_score?: number | null
          inner_readiness_tier?: string | null
          meta_data?: Json | null
          persona_id?: string | null
          practices_completed?: string[] | null
          practices_recommended?: string[] | null
          scenario_context?: Json | null
          scenario_id?: string | null
          session_status?: string | null
          session_title?: string | null
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
      evening_checkins: {
        Row: {
          checkin_date: string
          created_at: string | null
          evening_state: string | null
          id: string
          reflection_completed: boolean | null
          reflection_text: string | null
          timestamp: string
          tiny_win_captured: boolean | null
          tiny_win_id: string | null
          user_id: string
        }
        Insert: {
          checkin_date: string
          created_at?: string | null
          evening_state?: string | null
          id?: string
          reflection_completed?: boolean | null
          reflection_text?: string | null
          timestamp: string
          tiny_win_captured?: boolean | null
          tiny_win_id?: string | null
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string | null
          evening_state?: string | null
          id?: string
          reflection_completed?: boolean | null
          reflection_text?: string | null
          timestamp?: string
          tiny_win_captured?: boolean | null
          tiny_win_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evening_checkins_tiny_win_id_fkey"
            columns: ["tiny_win_id"]
            isOneToOne: false
            referencedRelation: "tiny_wins"
            referencedColumns: ["id"]
          },
        ]
      }
      event_category_confirmations: {
        Row: {
          confidence: string
          created_at: string
          event_category: string | null
          event_subcategory: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          observation_count: number
          resolved_by: string | null
          source: string
          subtype_id: string | null
          title_norm: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          event_category?: string | null
          event_subcategory?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          observation_count?: number
          resolved_by?: string | null
          source?: string
          subtype_id?: string | null
          title_norm: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          event_category?: string | null
          event_subcategory?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          observation_count?: number
          resolved_by?: string | null
          source?: string
          subtype_id?: string | null
          title_norm?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_classifier_parity_log: {
        Row: {
          created_at: string
          event_id: string | null
          hard_demote_conflict: boolean
          id: string
          title_normalised: string
          user_id: string
          v1_category: string | null
          v2_category: string | null
          v2_confidence: string
          v2_resolved_by: string
          v2_subtype_id: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          hard_demote_conflict?: boolean
          id?: string
          title_normalised: string
          user_id: string
          v1_category?: string | null
          v2_category?: string | null
          v2_confidence: string
          v2_resolved_by: string
          v2_subtype_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          hard_demote_conflict?: boolean
          id?: string
          title_normalised?: string
          user_id?: string
          v1_category?: string | null
          v2_category?: string | null
          v2_confidence?: string
          v2_resolved_by?: string
          v2_subtype_id?: string | null
        }
        Relationships: []
      }
      event_learned_tokens: {
        Row: {
          confidence: string
          created_at: string
          distinct_title_count: number
          event_category: string
          event_subcategory: string | null
          id: string
          promoted_at: string
          retired_at: string | null
          source: string
          subtype_id: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          distinct_title_count?: number
          event_category: string
          event_subcategory?: string | null
          id?: string
          promoted_at?: string
          retired_at?: string | null
          source?: string
          subtype_id?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          distinct_title_count?: number
          event_category?: string
          event_subcategory?: string | null
          id?: string
          promoted_at?: string
          retired_at?: string | null
          source?: string
          subtype_id?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_priority_derived: {
        Row: {
          confidence: number | null
          event_category: string
          event_type_key: string
          id: string
          last_reinforced_at: string | null
          last_signal: string | null
          net_importance: number
          permanent_flag: boolean
          relationship_role: string | null
          signal_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          event_category: string
          event_type_key: string
          id?: string
          last_reinforced_at?: string | null
          last_signal?: string | null
          net_importance?: number
          permanent_flag?: boolean
          relationship_role?: string | null
          signal_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          event_category?: string
          event_type_key?: string
          id?: string
          last_reinforced_at?: string | null
          last_signal?: string | null
          net_importance?: number
          permanent_flag?: boolean
          relationship_role?: string | null
          signal_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_priority_memory: {
        Row: {
          effective_week_end: string | null
          effective_week_start: string | null
          event_category: string
          event_id: string | null
          event_subcategory: string | null
          event_type_key: string
          id: string
          identity_confidence: string | null
          meta: Json
          occurred_at: string
          resolved_event_id: string | null
          scope: string | null
          signal: string
          source: string
          timezone: string | null
          user_id: string
        }
        Insert: {
          effective_week_end?: string | null
          effective_week_start?: string | null
          event_category: string
          event_id?: string | null
          event_subcategory?: string | null
          event_type_key: string
          id?: string
          identity_confidence?: string | null
          meta?: Json
          occurred_at?: string
          resolved_event_id?: string | null
          scope?: string | null
          signal: string
          source: string
          timezone?: string | null
          user_id: string
        }
        Update: {
          effective_week_end?: string | null
          effective_week_start?: string | null
          event_category?: string
          event_id?: string | null
          event_subcategory?: string | null
          event_type_key?: string
          id?: string
          identity_confidence?: string | null
          meta?: Json
          occurred_at?: string
          resolved_event_id?: string | null
          scope?: string | null
          signal?: string
          source?: string
          timezone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      executive_home_card_runs: {
        Row: {
          brief_status: string | null
          created_at: string
          day_type: string | null
          duration_ms: number | null
          effective_timezone: string | null
          error: string | null
          error_json: Json | null
          finished_at: string | null
          id: string
          job_key: string
          local_date: string | null
          mode: string
          mrs_status: string | null
          plan_status: string | null
          retry_count: number
          run_id: string
          skipped_reason: string | null
          started_at: string | null
          status: string
          trace_json: Json
          travel_state: Json | null
          user_id: string | null
          window: string | null
        }
        Insert: {
          brief_status?: string | null
          created_at?: string
          day_type?: string | null
          duration_ms?: number | null
          effective_timezone?: string | null
          error?: string | null
          error_json?: Json | null
          finished_at?: string | null
          id?: string
          job_key?: string
          local_date?: string | null
          mode: string
          mrs_status?: string | null
          plan_status?: string | null
          retry_count?: number
          run_id: string
          skipped_reason?: string | null
          started_at?: string | null
          status: string
          trace_json?: Json
          travel_state?: Json | null
          user_id?: string | null
          window?: string | null
        }
        Update: {
          brief_status?: string | null
          created_at?: string
          day_type?: string | null
          duration_ms?: number | null
          effective_timezone?: string | null
          error?: string | null
          error_json?: Json | null
          finished_at?: string | null
          id?: string
          job_key?: string
          local_date?: string | null
          mode?: string
          mrs_status?: string | null
          plan_status?: string | null
          retry_count?: number
          run_id?: string
          skipped_reason?: string | null
          started_at?: string | null
          status?: string
          trace_json?: Json
          travel_state?: Json | null
          user_id?: string | null
          window?: string | null
        }
        Relationships: []
      }
      inferred_states: {
        Row: {
          accuracy_score: number | null
          actual_checkin_id: string | null
          based_on: Json
          confidence_score: number
          created_at: string | null
          id: string
          inference_method: string
          inferred_at: string
          inferred_for_date: string
          inferred_for_window: string
          inferred_outcome: string | null
          inferred_score: number
          inferred_tier: string
          used_for: string | null
          user_id: string
        }
        Insert: {
          accuracy_score?: number | null
          actual_checkin_id?: string | null
          based_on: Json
          confidence_score: number
          created_at?: string | null
          id?: string
          inference_method: string
          inferred_at: string
          inferred_for_date: string
          inferred_for_window: string
          inferred_outcome?: string | null
          inferred_score: number
          inferred_tier: string
          used_for?: string | null
          user_id: string
        }
        Update: {
          accuracy_score?: number | null
          actual_checkin_id?: string | null
          based_on?: Json
          confidence_score?: number
          created_at?: string | null
          id?: string
          inference_method?: string
          inferred_at?: string
          inferred_for_date?: string
          inferred_for_window?: string
          inferred_outcome?: string | null
          inferred_score?: number
          inferred_tier?: string
          used_for?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inferred_states_actual_checkin_id_fkey"
            columns: ["actual_checkin_id"]
            isOneToOne: false
            referencedRelation: "daily_checkins"
            referencedColumns: ["id"]
          },
        ]
      }
      inner_readiness_scores: {
        Row: {
          base_statement: string | null
          check_in_outcome: string | null
          clarity_level: number | null
          composite_score: number
          confidence: string | null
          confidence_level: number | null
          created_at: string
          data_sources: string[] | null
          divergence_flag: string | null
          divergence_overlay: string | null
          energy_tier: string
          full_context_statement: string | null
          hrv_deviation: number | null
          id: string
          layers_active: string[] | null
          modifier_statement: string | null
          score_date: string
          time_of_day: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_statement?: string | null
          check_in_outcome?: string | null
          clarity_level?: number | null
          composite_score: number
          confidence?: string | null
          confidence_level?: number | null
          created_at?: string
          data_sources?: string[] | null
          divergence_flag?: string | null
          divergence_overlay?: string | null
          energy_tier?: string
          full_context_statement?: string | null
          hrv_deviation?: number | null
          id?: string
          layers_active?: string[] | null
          modifier_statement?: string | null
          score_date: string
          time_of_day?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_statement?: string | null
          check_in_outcome?: string | null
          clarity_level?: number | null
          composite_score?: number
          confidence?: string | null
          confidence_level?: number | null
          created_at?: string
          data_sources?: string[] | null
          divergence_flag?: string | null
          divergence_overlay?: string | null
          energy_tier?: string
          full_context_statement?: string | null
          hrv_deviation?: number | null
          id?: string
          layers_active?: string[] | null
          modifier_statement?: string | null
          score_date?: string
          time_of_day?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jit_cancellation_memory: {
        Row: {
          cancelled_at: string
          cluster: string | null
          event_type: string | null
          id: string
          penalty_level: number
          user_id: string
        }
        Insert: {
          cancelled_at?: string
          cluster?: string | null
          event_type?: string | null
          id?: string
          penalty_level?: number
          user_id: string
        }
        Update: {
          cancelled_at?: string
          cluster?: string | null
          event_type?: string | null
          id?: string
          penalty_level?: number
          user_id?: string
        }
        Relationships: []
      }
      jit_carousel_cards: {
        Row: {
          card_position: number | null
          card_type: string
          coach_context_statement: string | null
          coach_tool_name: string | null
          completed: boolean | null
          completed_at: string | null
          event_id: string | null
          id: string
          practice_category: string | null
          practice_id: string | null
          shown_at: string | null
          tapped: boolean | null
          tapped_at: string | null
          user_id: string
        }
        Insert: {
          card_position?: number | null
          card_type: string
          coach_context_statement?: string | null
          coach_tool_name?: string | null
          completed?: boolean | null
          completed_at?: string | null
          event_id?: string | null
          id?: string
          practice_category?: string | null
          practice_id?: string | null
          shown_at?: string | null
          tapped?: boolean | null
          tapped_at?: string | null
          user_id: string
        }
        Update: {
          card_position?: number | null
          card_type?: string
          coach_context_statement?: string | null
          coach_tool_name?: string | null
          completed?: boolean | null
          completed_at?: string | null
          event_id?: string | null
          id?: string
          practice_category?: string | null
          practice_id?: string | null
          shown_at?: string | null
          tapped?: boolean | null
          tapped_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jit_carousel_cards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jit_event_context"
            referencedColumns: ["id"]
          },
        ]
      }
      jit_event_context: {
        Row: {
          accountability_score: number | null
          attendee_count: number | null
          calendar_event_id: string | null
          coach_boost_score: number | null
          coach_dimension: string | null
          coach_scenario: string | null
          completed: boolean | null
          context_score: number | null
          context_statement: string | null
          created_at: string | null
          dismissed_by_user: boolean | null
          dismissed_horizons: string[] | null
          event_duration_minutes: number | null
          event_start: string
          event_title: string
          event_type: string
          expressed_concern: boolean | null
          final_score: number | null
          has_coach_context: boolean | null
          has_pending_tool: boolean | null
          has_prior_event_within_15min: boolean | null
          id: string
          is_during_prime_hours: boolean | null
          is_recurring: boolean | null
          jit_bucket_primary: string | null
          jit_bucket_secondary: string | null
          jit_confidence_score: number | null
          jit_dimension_scores: Json | null
          jit_horizons_surfaced: string[] | null
          jit_urgency_horizon: string | null
          scale_score: number | null
          scenario_match_score: number | null
          shadow_v2_at: string | null
          shadow_v2_components: Json | null
          shadow_v2_role: string | null
          shadow_v2_score: number | null
          shadow_v2_tier: string | null
          shown_in_jit: boolean | null
          skip_penalty: number | null
          updated_at: string | null
          urgency_score: number | null
          user_id: string
          user_is_organizer: boolean | null
        }
        Insert: {
          accountability_score?: number | null
          attendee_count?: number | null
          calendar_event_id?: string | null
          coach_boost_score?: number | null
          coach_dimension?: string | null
          coach_scenario?: string | null
          completed?: boolean | null
          context_score?: number | null
          context_statement?: string | null
          created_at?: string | null
          dismissed_by_user?: boolean | null
          dismissed_horizons?: string[] | null
          event_duration_minutes?: number | null
          event_start: string
          event_title: string
          event_type: string
          expressed_concern?: boolean | null
          final_score?: number | null
          has_coach_context?: boolean | null
          has_pending_tool?: boolean | null
          has_prior_event_within_15min?: boolean | null
          id?: string
          is_during_prime_hours?: boolean | null
          is_recurring?: boolean | null
          jit_bucket_primary?: string | null
          jit_bucket_secondary?: string | null
          jit_confidence_score?: number | null
          jit_dimension_scores?: Json | null
          jit_horizons_surfaced?: string[] | null
          jit_urgency_horizon?: string | null
          scale_score?: number | null
          scenario_match_score?: number | null
          shadow_v2_at?: string | null
          shadow_v2_components?: Json | null
          shadow_v2_role?: string | null
          shadow_v2_score?: number | null
          shadow_v2_tier?: string | null
          shown_in_jit?: boolean | null
          skip_penalty?: number | null
          updated_at?: string | null
          urgency_score?: number | null
          user_id: string
          user_is_organizer?: boolean | null
        }
        Update: {
          accountability_score?: number | null
          attendee_count?: number | null
          calendar_event_id?: string | null
          coach_boost_score?: number | null
          coach_dimension?: string | null
          coach_scenario?: string | null
          completed?: boolean | null
          context_score?: number | null
          context_statement?: string | null
          created_at?: string | null
          dismissed_by_user?: boolean | null
          dismissed_horizons?: string[] | null
          event_duration_minutes?: number | null
          event_start?: string
          event_title?: string
          event_type?: string
          expressed_concern?: boolean | null
          final_score?: number | null
          has_coach_context?: boolean | null
          has_pending_tool?: boolean | null
          has_prior_event_within_15min?: boolean | null
          id?: string
          is_during_prime_hours?: boolean | null
          is_recurring?: boolean | null
          jit_bucket_primary?: string | null
          jit_bucket_secondary?: string | null
          jit_confidence_score?: number | null
          jit_dimension_scores?: Json | null
          jit_horizons_surfaced?: string[] | null
          jit_urgency_horizon?: string | null
          scale_score?: number | null
          scenario_match_score?: number | null
          shadow_v2_at?: string | null
          shadow_v2_components?: Json | null
          shadow_v2_role?: string | null
          shadow_v2_score?: number | null
          shadow_v2_tier?: string | null
          shown_in_jit?: boolean | null
          skip_penalty?: number | null
          updated_at?: string | null
          urgency_score?: number | null
          user_id?: string
          user_is_organizer?: boolean | null
        }
        Relationships: []
      }
      jit_pill_display_log: {
        Row: {
          clicked: boolean | null
          clicked_at: string | null
          displayed_at: string | null
          event_id: string | null
          id: string
          inner_readiness_score: number | null
          pill_label: string
          pill_type: string
          time_of_day: string | null
          user_id: string
        }
        Insert: {
          clicked?: boolean | null
          clicked_at?: string | null
          displayed_at?: string | null
          event_id?: string | null
          id?: string
          inner_readiness_score?: number | null
          pill_label: string
          pill_type: string
          time_of_day?: string | null
          user_id: string
        }
        Update: {
          clicked?: boolean | null
          clicked_at?: string | null
          displayed_at?: string | null
          event_id?: string | null
          id?: string
          inner_readiness_score?: number | null
          pill_label?: string
          pill_type?: string
          time_of_day?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jit_pill_display_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jit_event_context"
            referencedColumns: ["id"]
          },
        ]
      }
      jit_preferences: {
        Row: {
          action: string
          created_at: string
          dismissed: boolean | null
          event_start_time: string | null
          event_title: string | null
          event_type: string | null
          id: string
          minutes_before_event: number | null
          skipped_at: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          dismissed?: boolean | null
          event_start_time?: string | null
          event_title?: string | null
          event_type?: string | null
          id?: string
          minutes_before_event?: number | null
          skipped_at?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          dismissed?: boolean | null
          event_start_time?: string | null
          event_title?: string | null
          event_type?: string | null
          id?: string
          minutes_before_event?: number | null
          skipped_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      jit_shadow_v2_runs: {
        Row: {
          account_age_days: number
          excluded: Json | null
          excluded_count: number
          id: string
          legacy_top_event_id: string | null
          legacy_top_event_title: string | null
          legacy_top_score: number | null
          parity_match: boolean | null
          pattern_count: number
          ranked: Json | null
          ranked_count: number
          run_at: string
          tier: string
          top_components: Json | null
          top_event_id: string | null
          top_event_role: string | null
          top_event_title: string | null
          top_importance: number | null
          user_id: string
        }
        Insert: {
          account_age_days: number
          excluded?: Json | null
          excluded_count: number
          id?: string
          legacy_top_event_id?: string | null
          legacy_top_event_title?: string | null
          legacy_top_score?: number | null
          parity_match?: boolean | null
          pattern_count: number
          ranked?: Json | null
          ranked_count: number
          run_at?: string
          tier: string
          top_components?: Json | null
          top_event_id?: string | null
          top_event_role?: string | null
          top_event_title?: string | null
          top_importance?: number | null
          user_id: string
        }
        Update: {
          account_age_days?: number
          excluded?: Json | null
          excluded_count?: number
          id?: string
          legacy_top_event_id?: string | null
          legacy_top_event_title?: string | null
          legacy_top_score?: number | null
          parity_match?: boolean | null
          pattern_count?: number
          ranked?: Json | null
          ranked_count?: number
          run_at?: string
          tier?: string
          top_components?: Json | null
          top_event_id?: string | null
          top_event_role?: string | null
          top_event_title?: string | null
          top_importance?: number | null
          user_id?: string
        }
        Relationships: []
      }
      mastery_plan_completions: {
        Row: {
          based_on_window: string | null
          calendar_event_id: string | null
          completed_at: string | null
          completion_percentage: number | null
          created_at: string | null
          id: string
          is_complete: boolean | null
          plan_date: string
          plan_type: string
          practices_assigned: string[] | null
          practices_completed: string[] | null
          total_practices: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          based_on_window?: string | null
          calendar_event_id?: string | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          id?: string
          is_complete?: boolean | null
          plan_date: string
          plan_type: string
          practices_assigned?: string[] | null
          practices_completed?: string[] | null
          total_practices: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          based_on_window?: string | null
          calendar_event_id?: string | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          id?: string
          is_complete?: boolean | null
          plan_date?: string
          plan_type?: string
          practices_assigned?: string[] | null
          practices_completed?: string[] | null
          total_practices?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_plan_completions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_plan_completions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "event_physiology_join"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "mastery_plan_completions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "primary_calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_plan_completions_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "web_primary_calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_plan_snapshots: {
        Row: {
          brief_snapshot_id: string | null
          created_at: string
          day_kind: string | null
          delivered_at: string | null
          error_json: Json | null
          generated_at: string
          horizon_iso: string | null
          horizon_modules: Json | null
          id: string
          input_signature: string | null
          mrs_window: string
          plan_date: string
          plan_json: Json | null
          plan_ledger: Json | null
          priorities: Json | null
          recommended_practice_ids: string[]
          source_context_snapshot_id: string | null
          status: string
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          brief_snapshot_id?: string | null
          created_at?: string
          day_kind?: string | null
          delivered_at?: string | null
          error_json?: Json | null
          generated_at?: string
          horizon_iso?: string | null
          horizon_modules?: Json | null
          id?: string
          input_signature?: string | null
          mrs_window: string
          plan_date: string
          plan_json?: Json | null
          plan_ledger?: Json | null
          priorities?: Json | null
          recommended_practice_ids?: string[]
          source_context_snapshot_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          brief_snapshot_id?: string | null
          created_at?: string
          day_kind?: string | null
          delivered_at?: string | null
          error_json?: Json | null
          generated_at?: string
          horizon_iso?: string | null
          horizon_modules?: Json | null
          id?: string
          input_signature?: string | null
          mrs_window?: string
          plan_date?: string
          plan_json?: Json | null
          plan_ledger?: Json | null
          priorities?: Json | null
          recommended_practice_ids?: string[]
          source_context_snapshot_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
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
      notification_delivery_attempts: {
        Row: {
          apns_environment: string | null
          apns_id: string | null
          apns_reason: string | null
          apns_status: number | null
          attempt_number: number
          created_at: string
          device_token_id: string | null
          extra: Json
          id: string
          notification_log_id: string
          permanent_failure: boolean
          platform: string
          token_hash_prefix: string | null
          user_id: string
        }
        Insert: {
          apns_environment?: string | null
          apns_id?: string | null
          apns_reason?: string | null
          apns_status?: number | null
          attempt_number?: number
          created_at?: string
          device_token_id?: string | null
          extra?: Json
          id?: string
          notification_log_id: string
          permanent_failure?: boolean
          platform: string
          token_hash_prefix?: string | null
          user_id: string
        }
        Update: {
          apns_environment?: string | null
          apns_id?: string | null
          apns_reason?: string | null
          apns_status?: number | null
          attempt_number?: number
          created_at?: string
          device_token_id?: string | null
          extra?: Json
          id?: string
          notification_log_id?: string
          permanent_failure?: boolean
          platform?: string
          token_hash_prefix?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_device_tokens: {
        Row: {
          created_at: string
          device_token: string
          id: string
          is_active: boolean
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_token: string
          id?: string
          is_active?: boolean
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_token?: string
          id?: string
          is_active?: boolean
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_dispatch_claims: {
        Row: {
          created_at: string
          dispatch_key: string
          event_reference: string | null
          id: string
          local_date: string
          notification_log_id: string | null
          notification_type: string
          slot: string | null
          user_id: string
          week_reference: string | null
        }
        Insert: {
          created_at?: string
          dispatch_key: string
          event_reference?: string | null
          id?: string
          local_date: string
          notification_log_id?: string | null
          notification_type: string
          slot?: string | null
          user_id: string
          week_reference?: string | null
        }
        Update: {
          created_at?: string
          dispatch_key?: string
          event_reference?: string | null
          id?: string
          local_date?: string
          notification_log_id?: string | null
          notification_type?: string
          slot?: string | null
          user_id?: string
          week_reference?: string | null
        }
        Relationships: []
      }
      notification_evaluator_runs: {
        Row: {
          apns_attempted_count: number
          apns_failed_count: number
          apns_succeeded_count: number
          created_at: string
          environment: string | null
          evaluator: string
          evaluator_version: string
          finished_at: string | null
          id: string
          metadata: Json
          processed_user_count: number
          qualified_count: number
          shipped_count: number
          started_at: string
          top_level_error: string | null
        }
        Insert: {
          apns_attempted_count?: number
          apns_failed_count?: number
          apns_succeeded_count?: number
          created_at?: string
          environment?: string | null
          evaluator?: string
          evaluator_version: string
          finished_at?: string | null
          id?: string
          metadata?: Json
          processed_user_count?: number
          qualified_count?: number
          shipped_count?: number
          started_at?: string
          top_level_error?: string | null
        }
        Update: {
          apns_attempted_count?: number
          apns_failed_count?: number
          apns_succeeded_count?: number
          created_at?: string
          environment?: string | null
          evaluator?: string
          evaluator_version?: string
          finished_at?: string | null
          id?: string
          metadata?: Json
          processed_user_count?: number
          qualified_count?: number
          shipped_count?: number
          started_at?: string
          top_level_error?: string | null
        }
        Relationships: []
      }
      notification_evaluator_traces: {
        Row: {
          apns_reason: string | null
          apns_status: number | null
          created_at: string
          evaluator: string
          evaluator_version: string
          id: string
          local_date: string | null
          local_hour: number | null
          metadata: Json
          notification_log_id: string | null
          notification_type: string | null
          outcome: string
          run_id: string | null
          timezone_offset: number | null
          token_prefix: string | null
          user_id: string
          variant_id: string | null
        }
        Insert: {
          apns_reason?: string | null
          apns_status?: number | null
          created_at?: string
          evaluator?: string
          evaluator_version: string
          id?: string
          local_date?: string | null
          local_hour?: number | null
          metadata?: Json
          notification_log_id?: string | null
          notification_type?: string | null
          outcome: string
          run_id?: string | null
          timezone_offset?: number | null
          token_prefix?: string | null
          user_id: string
          variant_id?: string | null
        }
        Update: {
          apns_reason?: string | null
          apns_status?: number | null
          created_at?: string
          evaluator?: string
          evaluator_version?: string
          id?: string
          local_date?: string | null
          local_hour?: number | null
          metadata?: Json
          notification_log_id?: string | null
          notification_type?: string | null
          outcome?: string
          run_id?: string | null
          timezone_offset?: number | null
          token_prefix?: string | null
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_evaluator_traces_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "notification_evaluator_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          app_opened: boolean
          delivered_at: string | null
          delivery_state: string | null
          dismissed: boolean
          event_reference: string | null
          id: string
          notification_type: string
          payload: Json
          sent_at: string
          tapped: boolean
          target_action_completed: boolean
          time_to_engagement_seconds: number | null
          user_id: string
          variant_id: string
        }
        Insert: {
          app_opened?: boolean
          delivered_at?: string | null
          delivery_state?: string | null
          dismissed?: boolean
          event_reference?: string | null
          id?: string
          notification_type: string
          payload?: Json
          sent_at?: string
          tapped?: boolean
          target_action_completed?: boolean
          time_to_engagement_seconds?: number | null
          user_id: string
          variant_id: string
        }
        Update: {
          app_opened?: boolean
          delivered_at?: string | null
          delivery_state?: string | null
          dismissed?: boolean
          event_reference?: string | null
          id?: string
          notification_type?: string
          payload?: Json
          sent_at?: string
          tapped?: boolean
          target_action_completed?: boolean
          time_to_engagement_seconds?: number | null
          user_id?: string
          variant_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          dnd_end: number | null
          dnd_start: number | null
          evening_close_enabled: boolean
          evening_window_end: number
          evening_window_start: number
          id: string
          morning_anchor_enabled: boolean
          morning_window_end: number
          morning_window_start: number
          pattern_alert_enabled: boolean
          pre_event_prep_enabled: boolean
          quiet_days: number[] | null
          state_aware_nudge_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dnd_end?: number | null
          dnd_start?: number | null
          evening_close_enabled?: boolean
          evening_window_end?: number
          evening_window_start?: number
          id?: string
          morning_anchor_enabled?: boolean
          morning_window_end?: number
          morning_window_start?: number
          pattern_alert_enabled?: boolean
          pre_event_prep_enabled?: boolean
          quiet_days?: number[] | null
          state_aware_nudge_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dnd_end?: number | null
          dnd_start?: number | null
          evening_close_enabled?: boolean
          evening_window_end?: number
          evening_window_start?: number
          id?: string
          morning_anchor_enabled?: boolean
          morning_window_end?: number
          morning_window_start?: number
          pattern_alert_enabled?: boolean
          pre_event_prep_enabled?: boolean
          quiet_days?: number[] | null
          state_aware_nudge_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          completed_at: string | null
          connections_at: string | null
          context_calendar_enabled: boolean | null
          context_confirmed_at: string | null
          context_connection_at: string | null
          context_watch_enabled: boolean | null
          current_step: string
          emotional_awareness_at: string | null
          first_session_walkthrough_at: string | null
          growth_intention_at: string | null
          id: string
          identity_at: string | null
          linkedin_at: string | null
          mental_clarity_at: string | null
          onboarding_completed_at: string | null
          payment_at: string | null
          pricing_at: string | null
          recovery_patterns_at: string | null
          results_at: string | null
          selected_plan: string | null
          signup_step_at: string | null
          started_at: string
          stress_response_at: string | null
          updated_at: string
          user_id: string
          welcome_at: string | null
        }
        Insert: {
          completed_at?: string | null
          connections_at?: string | null
          context_calendar_enabled?: boolean | null
          context_confirmed_at?: string | null
          context_connection_at?: string | null
          context_watch_enabled?: boolean | null
          current_step?: string
          emotional_awareness_at?: string | null
          first_session_walkthrough_at?: string | null
          growth_intention_at?: string | null
          id?: string
          identity_at?: string | null
          linkedin_at?: string | null
          mental_clarity_at?: string | null
          onboarding_completed_at?: string | null
          payment_at?: string | null
          pricing_at?: string | null
          recovery_patterns_at?: string | null
          results_at?: string | null
          selected_plan?: string | null
          signup_step_at?: string | null
          started_at?: string
          stress_response_at?: string | null
          updated_at?: string
          user_id: string
          welcome_at?: string | null
        }
        Update: {
          completed_at?: string | null
          connections_at?: string | null
          context_calendar_enabled?: boolean | null
          context_confirmed_at?: string | null
          context_connection_at?: string | null
          context_watch_enabled?: boolean | null
          current_step?: string
          emotional_awareness_at?: string | null
          first_session_walkthrough_at?: string | null
          growth_intention_at?: string | null
          id?: string
          identity_at?: string | null
          linkedin_at?: string | null
          mental_clarity_at?: string | null
          onboarding_completed_at?: string | null
          payment_at?: string | null
          pricing_at?: string | null
          recovery_patterns_at?: string | null
          results_at?: string | null
          selected_plan?: string | null
          signup_step_at?: string | null
          started_at?: string
          stress_response_at?: string | null
          updated_at?: string
          user_id?: string
          welcome_at?: string | null
        }
        Relationships: []
      }
      onboarding_v8_responses: {
        Row: {
          brief_timing: string | null
          burden_chips: string[]
          calendar_selections: string[]
          completed_at: string | null
          cos_profile: Json | null
          cos_profile_email_scheduled_at: string | null
          cos_profile_email_sent_at: string | null
          cos_profile_error: string | null
          cos_profile_generated_at: string | null
          cos_profile_html: string | null
          cos_profile_source: string | null
          cos_profile_status: string
          created_at: string
          freetext_context: string | null
          goals: string[]
          home_country: string | null
          linkedin_pdf_base64: string | null
          linkedin_scrape: Json | null
          linkedin_url: string | null
          load_chips: string[]
          preferred_practice_window: string | null
          reset_modality: string | null
          stakes_chips: string[]
          step_status: Json
          updated_at: string
          user_id: string
          wearable_selections: string[]
          weekend_signals: string | null
          writing_scrapes: Json | null
          writing_urls: string[]
        }
        Insert: {
          brief_timing?: string | null
          burden_chips?: string[]
          calendar_selections?: string[]
          completed_at?: string | null
          cos_profile?: Json | null
          cos_profile_email_scheduled_at?: string | null
          cos_profile_email_sent_at?: string | null
          cos_profile_error?: string | null
          cos_profile_generated_at?: string | null
          cos_profile_html?: string | null
          cos_profile_source?: string | null
          cos_profile_status?: string
          created_at?: string
          freetext_context?: string | null
          goals?: string[]
          home_country?: string | null
          linkedin_pdf_base64?: string | null
          linkedin_scrape?: Json | null
          linkedin_url?: string | null
          load_chips?: string[]
          preferred_practice_window?: string | null
          reset_modality?: string | null
          stakes_chips?: string[]
          step_status?: Json
          updated_at?: string
          user_id: string
          wearable_selections?: string[]
          weekend_signals?: string | null
          writing_scrapes?: Json | null
          writing_urls?: string[]
        }
        Update: {
          brief_timing?: string | null
          burden_chips?: string[]
          calendar_selections?: string[]
          completed_at?: string | null
          cos_profile?: Json | null
          cos_profile_email_scheduled_at?: string | null
          cos_profile_email_sent_at?: string | null
          cos_profile_error?: string | null
          cos_profile_generated_at?: string | null
          cos_profile_html?: string | null
          cos_profile_source?: string | null
          cos_profile_status?: string
          created_at?: string
          freetext_context?: string | null
          goals?: string[]
          home_country?: string | null
          linkedin_pdf_base64?: string | null
          linkedin_scrape?: Json | null
          linkedin_url?: string | null
          load_chips?: string[]
          preferred_practice_window?: string | null
          reset_modality?: string | null
          stakes_chips?: string[]
          step_status?: Json
          updated_at?: string
          user_id?: string
          wearable_selections?: string[]
          weekend_signals?: string | null
          writing_scrapes?: Json | null
          writing_urls?: string[]
        }
        Relationships: []
      }
      oura_connections: {
        Row: {
          access_token_expires_at: string | null
          connection_status: string
          created_at: string
          encrypted_access_token_id: string | null
          encrypted_refresh_token_id: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_error_at: string | null
          last_sample_at: string | null
          last_sync: string | null
          oauth_state: string | null
          oauth_state_expires_at: string | null
          sync_status: string
          updated_at: string
          user_id: string
          writes_to_apple_health: boolean
        }
        Insert: {
          access_token_expires_at?: string | null
          connection_status?: string
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_sample_at?: string | null
          last_sync?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          sync_status?: string
          updated_at?: string
          user_id: string
          writes_to_apple_health?: boolean
        }
        Update: {
          access_token_expires_at?: string | null
          connection_status?: string
          created_at?: string
          encrypted_access_token_id?: string | null
          encrypted_refresh_token_id?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_sample_at?: string | null
          last_sync?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          sync_status?: string
          updated_at?: string
          user_id?: string
          writes_to_apple_health?: boolean
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
      physiological_events: {
        Row: {
          activity_level: string | null
          created_at: string
          end_time: string
          event_title: string
          event_type: string
          hrv: number | null
          id: string
          readiness_score: number | null
          recovery_status: string
          resting_heart_rate: number | null
          sleep_score: number | null
          source: string
          start_time: string
          stress_level: string
          user_id: string
        }
        Insert: {
          activity_level?: string | null
          created_at?: string
          end_time: string
          event_title: string
          event_type?: string
          hrv?: number | null
          id?: string
          readiness_score?: number | null
          recovery_status?: string
          resting_heart_rate?: number | null
          sleep_score?: number | null
          source: string
          start_time: string
          stress_level?: string
          user_id: string
        }
        Update: {
          activity_level?: string | null
          created_at?: string
          end_time?: string
          event_title?: string
          event_type?: string
          hrv?: number | null
          id?: string
          readiness_score?: number | null
          recovery_status?: string
          resting_heart_rate?: number | null
          sleep_score?: number | null
          source?: string
          start_time?: string
          stress_level?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_reflections: {
        Row: {
          created_at: string
          entry_context: string | null
          id: string
          local_date: string
          practice_id: string
          practice_type: string
          prompt: string | null
          response: string
          session_id: string | null
          step_number: number
          step_title: string | null
          temp_session_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_context?: string | null
          id?: string
          local_date: string
          practice_id: string
          practice_type?: string
          prompt?: string | null
          response: string
          session_id?: string | null
          step_number: number
          step_title?: string | null
          temp_session_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_context?: string | null
          id?: string
          local_date?: string
          practice_id?: string
          practice_type?: string
          prompt?: string | null
          response?: string
          session_id?: string | null
          step_number?: number
          step_title?: string | null
          temp_session_key?: string | null
          updated_at?: string
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
      processed_outbox_items: {
        Row: {
          created_at: string
          function_name: string
          outbox_item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          function_name: string
          outbox_item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          function_name?: string
          outbox_item_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alignment_status: string | null
          apple_auto_renew: boolean | null
          apple_cancellation_date: string | null
          apple_environment: string | null
          apple_expires_at: string | null
          apple_grace_period_expires_at: string | null
          apple_last_notification_at: string | null
          apple_last_notification_type: string | null
          apple_last_verified_at: string | null
          apple_original_transaction_id: string | null
          apple_product_id: string | null
          apple_revoked_at: string | null
          apple_transaction_id: string | null
          archetype_description: string | null
          archetype_title: string | null
          auth_name: string | null
          avatar_url: string | null
          beta_expires_at: string | null
          beta_user: boolean | null
          biggest_pressure: string | null
          component_scores: Json | null
          confirmed_priorities: string[] | null
          country: string | null
          created_at: string | null
          current_streak: number | null
          current_timezone: string | null
          current_timezone_changed_at: string | null
          display_name: string | null
          email: string
          energy_regulation_response: string | null
          energy_renewal_response: string | null
          focus_recovery_response: string | null
          founding_member: boolean | null
          founding_member_granted_at: string | null
          full_name: string | null
          growth_priority: string | null
          home_lat: number | null
          home_lng: number | null
          home_location_set_at: string | null
          home_timezone: string | null
          id: string
          identity_role: string | null
          inferred_priorities: string[] | null
          last_login_at: string | null
          last_streak_celebration: number | null
          leadership_context: Json | null
          linkedin_analyzed_at: string | null
          linkedin_intake_mode: string | null
          linkedin_raw_markdown: string | null
          linkedin_url: string | null
          location_permission_state: string | null
          longest_streak: number | null
          mental_fitness_baseline: number | null
          meta_skill_scores: Json | null
          onboarding_completed_at: string | null
          onboarding_insight: string | null
          onboarding_session_id: string | null
          possible_relocation_detected: boolean | null
          practice_priority_tag: string | null
          preferred_practice_window: string | null
          pressure_context_tag: string | null
          pressure_profile: Json | null
          profile_description: string | null
          profile_type: string | null
          protection_goals: Json | null
          q1_setback_response: string | null
          q2_pressure_response: string | null
          q3_communication_style: string | null
          q4_self_assessed_strength: string | null
          referral_code_entered_at: string | null
          referral_code_used: string | null
          relocation_candidate_tz: string | null
          relocation_first_detected_at: string | null
          self_check_ins_enabled: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_cancel_at: string | null
          subscription_canceled_at: string | null
          subscription_currency: string | null
          subscription_current_period_end: string | null
          subscription_current_period_start: string | null
          subscription_plan: string | null
          subscription_provider: string | null
          subscription_status: string | null
          subscription_tier: string | null
          timezone_offset: number | null
          total_self_mastery_points: number | null
          total_social_mastery_points: number | null
          travel_notifications_enabled: boolean | null
          trial_ends_at: string | null
          updated_at: string | null
          user_archetype: string | null
        }
        Insert: {
          alignment_status?: string | null
          apple_auto_renew?: boolean | null
          apple_cancellation_date?: string | null
          apple_environment?: string | null
          apple_expires_at?: string | null
          apple_grace_period_expires_at?: string | null
          apple_last_notification_at?: string | null
          apple_last_notification_type?: string | null
          apple_last_verified_at?: string | null
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          apple_revoked_at?: string | null
          apple_transaction_id?: string | null
          archetype_description?: string | null
          archetype_title?: string | null
          auth_name?: string | null
          avatar_url?: string | null
          beta_expires_at?: string | null
          beta_user?: boolean | null
          biggest_pressure?: string | null
          component_scores?: Json | null
          confirmed_priorities?: string[] | null
          country?: string | null
          created_at?: string | null
          current_streak?: number | null
          current_timezone?: string | null
          current_timezone_changed_at?: string | null
          display_name?: string | null
          email: string
          energy_regulation_response?: string | null
          energy_renewal_response?: string | null
          focus_recovery_response?: string | null
          founding_member?: boolean | null
          founding_member_granted_at?: string | null
          full_name?: string | null
          growth_priority?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_location_set_at?: string | null
          home_timezone?: string | null
          id: string
          identity_role?: string | null
          inferred_priorities?: string[] | null
          last_login_at?: string | null
          last_streak_celebration?: number | null
          leadership_context?: Json | null
          linkedin_analyzed_at?: string | null
          linkedin_intake_mode?: string | null
          linkedin_raw_markdown?: string | null
          linkedin_url?: string | null
          location_permission_state?: string | null
          longest_streak?: number | null
          mental_fitness_baseline?: number | null
          meta_skill_scores?: Json | null
          onboarding_completed_at?: string | null
          onboarding_insight?: string | null
          onboarding_session_id?: string | null
          possible_relocation_detected?: boolean | null
          practice_priority_tag?: string | null
          preferred_practice_window?: string | null
          pressure_context_tag?: string | null
          pressure_profile?: Json | null
          profile_description?: string | null
          profile_type?: string | null
          protection_goals?: Json | null
          q1_setback_response?: string | null
          q2_pressure_response?: string | null
          q3_communication_style?: string | null
          q4_self_assessed_strength?: string | null
          referral_code_entered_at?: string | null
          referral_code_used?: string | null
          relocation_candidate_tz?: string | null
          relocation_first_detected_at?: string | null
          self_check_ins_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at?: string | null
          subscription_canceled_at?: string | null
          subscription_currency?: string | null
          subscription_current_period_end?: string | null
          subscription_current_period_start?: string | null
          subscription_plan?: string | null
          subscription_provider?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone_offset?: number | null
          total_self_mastery_points?: number | null
          total_social_mastery_points?: number | null
          travel_notifications_enabled?: boolean | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_archetype?: string | null
        }
        Update: {
          alignment_status?: string | null
          apple_auto_renew?: boolean | null
          apple_cancellation_date?: string | null
          apple_environment?: string | null
          apple_expires_at?: string | null
          apple_grace_period_expires_at?: string | null
          apple_last_notification_at?: string | null
          apple_last_notification_type?: string | null
          apple_last_verified_at?: string | null
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          apple_revoked_at?: string | null
          apple_transaction_id?: string | null
          archetype_description?: string | null
          archetype_title?: string | null
          auth_name?: string | null
          avatar_url?: string | null
          beta_expires_at?: string | null
          beta_user?: boolean | null
          biggest_pressure?: string | null
          component_scores?: Json | null
          confirmed_priorities?: string[] | null
          country?: string | null
          created_at?: string | null
          current_streak?: number | null
          current_timezone?: string | null
          current_timezone_changed_at?: string | null
          display_name?: string | null
          email?: string
          energy_regulation_response?: string | null
          energy_renewal_response?: string | null
          focus_recovery_response?: string | null
          founding_member?: boolean | null
          founding_member_granted_at?: string | null
          full_name?: string | null
          growth_priority?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_location_set_at?: string | null
          home_timezone?: string | null
          id?: string
          identity_role?: string | null
          inferred_priorities?: string[] | null
          last_login_at?: string | null
          last_streak_celebration?: number | null
          leadership_context?: Json | null
          linkedin_analyzed_at?: string | null
          linkedin_intake_mode?: string | null
          linkedin_raw_markdown?: string | null
          linkedin_url?: string | null
          location_permission_state?: string | null
          longest_streak?: number | null
          mental_fitness_baseline?: number | null
          meta_skill_scores?: Json | null
          onboarding_completed_at?: string | null
          onboarding_insight?: string | null
          onboarding_session_id?: string | null
          possible_relocation_detected?: boolean | null
          practice_priority_tag?: string | null
          preferred_practice_window?: string | null
          pressure_context_tag?: string | null
          pressure_profile?: Json | null
          profile_description?: string | null
          profile_type?: string | null
          protection_goals?: Json | null
          q1_setback_response?: string | null
          q2_pressure_response?: string | null
          q3_communication_style?: string | null
          q4_self_assessed_strength?: string | null
          referral_code_entered_at?: string | null
          referral_code_used?: string | null
          relocation_candidate_tz?: string | null
          relocation_first_detected_at?: string | null
          self_check_ins_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at?: string | null
          subscription_canceled_at?: string | null
          subscription_currency?: string | null
          subscription_current_period_end?: string | null
          subscription_current_period_start?: string | null
          subscription_plan?: string | null
          subscription_provider?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone_offset?: number | null
          total_self_mastery_points?: number | null
          total_social_mastery_points?: number | null
          travel_notifications_enabled?: boolean | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_archetype?: string | null
        }
        Relationships: []
      }
      readiness_baselines: {
        Row: {
          baseline_established_at: string | null
          baseline_hrv: number | null
          baseline_rhr: number | null
          rolling_hrv_30d: Json | null
          rolling_rhr_3d: Json | null
          updated_at: string | null
          user_id: string
          wearable_connected_at: string | null
        }
        Insert: {
          baseline_established_at?: string | null
          baseline_hrv?: number | null
          baseline_rhr?: number | null
          rolling_hrv_30d?: Json | null
          rolling_rhr_3d?: Json | null
          updated_at?: string | null
          user_id: string
          wearable_connected_at?: string | null
        }
        Update: {
          baseline_established_at?: string | null
          baseline_hrv?: number | null
          baseline_rhr?: number | null
          rolling_hrv_30d?: Json | null
          rolling_rhr_3d?: Json | null
          updated_at?: string | null
          user_id?: string
          wearable_connected_at?: string | null
        }
        Relationships: []
      }
      referral_conversions: {
        Row: {
          converted_to_pro_at: string | null
          credited_at: string | null
          credited_to_referrer: boolean | null
          id: string
          referee_id: string
          referral_code: string
          referrer_id: string
          signed_up_at: string | null
        }
        Insert: {
          converted_to_pro_at?: string | null
          credited_at?: string | null
          credited_to_referrer?: boolean | null
          id?: string
          referee_id: string
          referral_code: string
          referrer_id: string
          signed_up_at?: string | null
        }
        Update: {
          converted_to_pro_at?: string | null
          credited_at?: string | null
          credited_to_referrer?: boolean | null
          id?: string
          referee_id?: string
          referral_code?: string
          referrer_id?: string
          signed_up_at?: string | null
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
          duration_band: string | null
          essence: string | null
          expected_outcomes: string[] | null
          full_story: string | null
          horizon: string[] | null
          id: string
          intro_summary: string | null
          is_foundational: boolean | null
          mastery_category: Json | null
          meta_skill: string[] | null
          meta_skills: Json | null
          moment: string[] | null
          parallel: string | null
          real_examples: Json | null
          soft_skills: string[] | null
          state_signal: string[] | null
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
          duration_band?: string | null
          essence?: string | null
          expected_outcomes?: string[] | null
          full_story?: string | null
          horizon?: string[] | null
          id?: string
          intro_summary?: string | null
          is_foundational?: boolean | null
          mastery_category?: Json | null
          meta_skill?: string[] | null
          meta_skills?: Json | null
          moment?: string[] | null
          parallel?: string | null
          real_examples?: Json | null
          soft_skills?: string[] | null
          state_signal?: string[] | null
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
          duration_band?: string | null
          essence?: string | null
          expected_outcomes?: string[] | null
          full_story?: string | null
          horizon?: string[] | null
          id?: string
          intro_summary?: string | null
          is_foundational?: boolean | null
          mastery_category?: Json | null
          meta_skill?: string[] | null
          meta_skills?: Json | null
          moment?: string[] | null
          parallel?: string | null
          real_examples?: Json | null
          soft_skills?: string[] | null
          state_signal?: string[] | null
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
      subscription_events: {
        Row: {
          created_at: string | null
          event_type: string
          from_tier: string | null
          id: string
          metadata: Json | null
          stripe_event_id: string | null
          stripe_event_type: string | null
          to_tier: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          from_tier?: string | null
          id?: string
          metadata?: Json | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
          to_tier?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          from_tier?: string | null
          id?: string
          metadata?: Json | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
          to_tier?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tiny_wins: {
        Row: {
          agency_type: string | null
          analyzed_at: string | null
          category: string | null
          coach_acknowledgment: string | null
          created_at: string
          detected_at: string
          growth_signal: string | null
          id: string
          meta_skill_demonstrated: string | null
          pattern_area: string | null
          practice_id: string | null
          practice_type: string | null
          primary_emotion: string | null
          regulation_level: string | null
          secondary_emotion: string | null
          sentiment: string | null
          session_id: string | null
          source: string | null
          user_id: string
          win_content: string
          win_date: string
        }
        Insert: {
          agency_type?: string | null
          analyzed_at?: string | null
          category?: string | null
          coach_acknowledgment?: string | null
          created_at?: string
          detected_at?: string
          growth_signal?: string | null
          id?: string
          meta_skill_demonstrated?: string | null
          pattern_area?: string | null
          practice_id?: string | null
          practice_type?: string | null
          primary_emotion?: string | null
          regulation_level?: string | null
          secondary_emotion?: string | null
          sentiment?: string | null
          session_id?: string | null
          source?: string | null
          user_id: string
          win_content: string
          win_date?: string
        }
        Update: {
          agency_type?: string | null
          analyzed_at?: string | null
          category?: string | null
          coach_acknowledgment?: string | null
          created_at?: string
          detected_at?: string
          growth_signal?: string | null
          id?: string
          meta_skill_demonstrated?: string | null
          pattern_area?: string | null
          practice_id?: string | null
          practice_type?: string | null
          primary_emotion?: string | null
          regulation_level?: string | null
          secondary_emotion?: string | null
          sentiment?: string | null
          session_id?: string | null
          source?: string | null
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
      travel_location_pings: {
        Row: {
          accuracy_m: number | null
          captured_at: string
          created_at: string
          id: string
          lat: number
          lng: number
          source: string
          timezone: string | null
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          source?: string
          timezone?: string | null
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          source?: string
          timezone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      travel_notifications: {
        Row: {
          anchor_key: string
          body: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          delivered_at: string | null
          id: string
          payload: Json
          phase: string
          scheduled_for: string
          state_at_schedule: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_key: string
          body: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          payload?: Json
          phase: string
          scheduled_for: string
          state_at_schedule: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_key?: string
          body?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          payload?: Json
          phase?: string
          scheduled_for?: string
          state_at_schedule?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      travel_state: {
        Row: {
          created_at: string
          current_country: string | null
          distance_from_home_km: number | null
          last_known_accuracy_m: number | null
          last_known_lat: number | null
          last_known_lng: number | null
          last_known_timezone: string | null
          last_location_at: string | null
          last_state_change_at: string
          last_timezone_change_at: string | null
          location_permission_status: string | null
          meta: Json
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_country?: string | null
          distance_from_home_km?: number | null
          last_known_accuracy_m?: number | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_known_timezone?: string | null
          last_location_at?: string | null
          last_state_change_at?: string
          last_timezone_change_at?: string | null
          location_permission_status?: string | null
          meta?: Json
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_country?: string | null
          distance_from_home_km?: number | null
          last_known_accuracy_m?: number | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_known_timezone?: string | null
          last_location_at?: string | null
          last_state_change_at?: string
          last_timezone_change_at?: string | null
          location_permission_status?: string | null
          meta?: Json
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          check_in_date: string | null
          confidence_score: number | null
          content_reference: string | null
          created_at: string | null
          extracted_at: string | null
          id: string
          insight_content: string
          insight_type: string
          is_active: boolean | null
          meta_skill: string | null
          pattern_area: string | null
          resolution_note: string | null
          resolution_status: string | null
          source_session_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          check_in_date?: string | null
          confidence_score?: number | null
          content_reference?: string | null
          created_at?: string | null
          extracted_at?: string | null
          id?: string
          insight_content: string
          insight_type: string
          is_active?: boolean | null
          meta_skill?: string | null
          pattern_area?: string | null
          resolution_note?: string | null
          resolution_status?: string | null
          source_session_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          check_in_date?: string | null
          confidence_score?: number | null
          content_reference?: string | null
          created_at?: string | null
          extracted_at?: string | null
          id?: string
          insight_content?: string
          insight_type?: string
          is_active?: boolean | null
          meta_skill?: string | null
          pattern_area?: string | null
          resolution_note?: string | null
          resolution_status?: string | null
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
      user_external_profiles: {
        Row: {
          created_at: string
          extracted_data: Json
          id: string
          profile_url: string
          scrape_error: string | null
          scrape_status: string
          scraped_at: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_data?: Json
          id?: string
          profile_url: string
          scrape_error?: string | null
          scrape_status?: string
          scraped_at?: string | null
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_data?: Json
          id?: string
          profile_url?: string
          scrape_error?: string | null
          scrape_status?: string
          scraped_at?: string | null
          source?: string
          updated_at?: string
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
      user_integrations: {
        Row: {
          calendar_connected_at: string | null
          calendar_provider: string | null
          healthkit_anchor: string | null
          updated_at: string | null
          user_id: string
          watch_connected_at: string | null
          watch_connection_status: string | null
          watch_disconnected_at: string | null
          watch_last_error: string | null
          watch_last_error_at: string | null
          watch_last_sample_at: string | null
          watch_last_sync_at: string | null
          watch_status_authoritative_at: string | null
          watch_status_source: string | null
          watch_status_updated_at: string | null
          watch_sync_status: string | null
          watch_type: string | null
        }
        Insert: {
          calendar_connected_at?: string | null
          calendar_provider?: string | null
          healthkit_anchor?: string | null
          updated_at?: string | null
          user_id: string
          watch_connected_at?: string | null
          watch_connection_status?: string | null
          watch_disconnected_at?: string | null
          watch_last_error?: string | null
          watch_last_error_at?: string | null
          watch_last_sample_at?: string | null
          watch_last_sync_at?: string | null
          watch_status_authoritative_at?: string | null
          watch_status_source?: string | null
          watch_status_updated_at?: string | null
          watch_sync_status?: string | null
          watch_type?: string | null
        }
        Update: {
          calendar_connected_at?: string | null
          calendar_provider?: string | null
          healthkit_anchor?: string | null
          updated_at?: string | null
          user_id?: string
          watch_connected_at?: string | null
          watch_connection_status?: string | null
          watch_disconnected_at?: string | null
          watch_last_error?: string | null
          watch_last_error_at?: string | null
          watch_last_sample_at?: string | null
          watch_last_sync_at?: string | null
          watch_status_authoritative_at?: string | null
          watch_status_source?: string | null
          watch_status_updated_at?: string | null
          watch_sync_status?: string | null
          watch_type?: string | null
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
      user_referrals: {
        Row: {
          created_at: string | null
          credited_months: number | null
          id: string
          last_reset_at: string | null
          referral_code: string
          referral_link: string
          total_conversions: number | null
          total_signups: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credited_months?: number | null
          id?: string
          last_reset_at?: string | null
          referral_code: string
          referral_link: string
          total_conversions?: number | null
          total_signups?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credited_months?: number | null
          id?: string
          last_reset_at?: string | null
          referral_code?: string
          referral_link?: string
          total_conversions?: number | null
          total_signups?: number | null
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
      wearable_data: {
        Row: {
          active_calories: number | null
          created_at: string
          deep_sleep_minutes: number | null
          energy_level: string | null
          heart_rate: number | null
          hr_samples: Json
          hrv: number | null
          hrv_samples: Json | null
          hrv_status: string | null
          id: string
          raw_data: Json | null
          recovery_status: string | null
          rem_sleep_minutes: number | null
          resting_heart_rate: number | null
          sleep_efficiency: number | null
          sleep_quality: string | null
          sleep_score: number | null
          source: string
          source_apps: Json
          source_provider: string | null
          steps: number | null
          summary_date: string
          total_sleep_minutes: number | null
          updated_at: string
          user_id: string
          write_token: string
        }
        Insert: {
          active_calories?: number | null
          created_at?: string
          deep_sleep_minutes?: number | null
          energy_level?: string | null
          heart_rate?: number | null
          hr_samples?: Json
          hrv?: number | null
          hrv_samples?: Json | null
          hrv_status?: string | null
          id?: string
          raw_data?: Json | null
          recovery_status?: string | null
          rem_sleep_minutes?: number | null
          resting_heart_rate?: number | null
          sleep_efficiency?: number | null
          sleep_quality?: string | null
          sleep_score?: number | null
          source?: string
          source_apps?: Json
          source_provider?: string | null
          steps?: number | null
          summary_date: string
          total_sleep_minutes?: number | null
          updated_at?: string
          user_id: string
          write_token?: string
        }
        Update: {
          active_calories?: number | null
          created_at?: string
          deep_sleep_minutes?: number | null
          energy_level?: string | null
          heart_rate?: number | null
          hr_samples?: Json
          hrv?: number | null
          hrv_samples?: Json | null
          hrv_status?: string | null
          id?: string
          raw_data?: Json | null
          recovery_status?: string | null
          rem_sleep_minutes?: number | null
          resting_heart_rate?: number | null
          sleep_efficiency?: number | null
          sleep_quality?: string | null
          sleep_score?: number | null
          source?: string
          source_apps?: Json
          source_provider?: string | null
          steps?: number | null
          summary_date?: string
          total_sleep_minutes?: number | null
          updated_at?: string
          user_id?: string
          write_token?: string
        }
        Relationships: []
      }
      wearable_reconciliation_log: {
        Row: {
          created_at: string
          delta_hours: number | null
          details: Json
          id: string
          losing_source: string | null
          losing_updated_at: string | null
          metric: string
          reason: string
          summary_date: string
          user_id: string
          winning_source: string | null
          winning_updated_at: string | null
        }
        Insert: {
          created_at?: string
          delta_hours?: number | null
          details?: Json
          id?: string
          losing_source?: string | null
          losing_updated_at?: string | null
          metric: string
          reason: string
          summary_date: string
          user_id: string
          winning_source?: string | null
          winning_updated_at?: string | null
        }
        Update: {
          created_at?: string
          delta_hours?: number | null
          details?: Json
          id?: string
          losing_source?: string | null
          losing_updated_at?: string | null
          metric?: string
          reason?: string
          summary_date?: string
          user_id?: string
          winning_source?: string | null
          winning_updated_at?: string | null
        }
        Relationships: []
      }
      wearable_signal_diagnostics: {
        Row: {
          computed_at: string
          engine_version: number
          event_days_with_hr: number
          gate_reasons: Json
          hr_samples_day_count: number
          hrv_day_count: number
          id: string
          rhr_day_count: number
          rhr_recovered_day_count: number
          rhr_window_bucket_counts: Json
          sleep_score_day_count: number
          user_id: string
          window_days: number
        }
        Insert: {
          computed_at?: string
          engine_version: number
          event_days_with_hr?: number
          gate_reasons?: Json
          hr_samples_day_count?: number
          hrv_day_count?: number
          id?: string
          rhr_day_count?: number
          rhr_recovered_day_count?: number
          rhr_window_bucket_counts?: Json
          sleep_score_day_count?: number
          user_id: string
          window_days: number
        }
        Update: {
          computed_at?: string
          engine_version?: number
          event_days_with_hr?: number
          gate_reasons?: Json
          hr_samples_day_count?: number
          hrv_day_count?: number
          id?: string
          rhr_day_count?: number
          rhr_recovered_day_count?: number
          rhr_window_bucket_counts?: Json
          sleep_score_day_count?: number
          user_id?: string
          window_days?: number
        }
        Relationships: []
      }
      weekly_plan_snapshots: {
        Row: {
          generated_at: string
          id: string
          priorities: Json
          selected_plan: Json | null
          source: string
          updated_at: string
          user_edits: Json | null
          user_id: string
          version: number
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          generated_at?: string
          id?: string
          priorities?: Json
          selected_plan?: Json | null
          source?: string
          updated_at?: string
          user_edits?: Json | null
          user_id: string
          version?: number
          week_end_date: string
          week_start_date: string
        }
        Update: {
          generated_at?: string
          id?: string
          priorities?: Json
          selected_plan?: Json | null
          source?: string
          updated_at?: string
          user_edits?: Json | null
          user_id?: string
          version?: number
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      event_physiology_join: {
        Row: {
          attendees_count: number | null
          end_time: string | null
          event_id: string | null
          event_type: string | null
          hr_delta: number | null
          hr_morning_of: number | null
          hr_next_morning: number | null
          hrv_delta: number | null
          hrv_morning_of: number | null
          hrv_next_morning: number | null
          is_high_stakes: boolean | null
          is_organizer: boolean | null
          rhr_delta: number | null
          rhr_morning_of: number | null
          rhr_next_morning: number | null
          sleep_minutes_night_before: number | null
          sleep_score_night_before: number | null
          start_time: string | null
          title: string | null
          user_id: string | null
        }
        Relationships: []
      }
      primary_calendar_events: {
        Row: {
          attendees_count: number | null
          category_confidence: string | null
          category_resolved_at: string | null
          category_resolved_by: string | null
          created_at: string | null
          end_time: string | null
          event_category: string | null
          event_metadata: Json | null
          event_subcategory: string | null
          external_id: string | null
          flight_duration_minutes: number | null
          id: string | null
          identity_key: string | null
          is_all_day: boolean | null
          is_organizer: boolean | null
          is_recurring: boolean | null
          provider: string | null
          start_time: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          attendees_count?: number | null
          category_confidence?: string | null
          category_resolved_at?: string | null
          category_resolved_by?: string | null
          created_at?: string | null
          end_time?: string | null
          event_category?: string | null
          event_metadata?: Json | null
          event_subcategory?: string | null
          external_id?: string | null
          flight_duration_minutes?: number | null
          id?: string | null
          identity_key?: string | null
          is_all_day?: boolean | null
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          provider?: string | null
          start_time?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          attendees_count?: number | null
          category_confidence?: string | null
          category_resolved_at?: string | null
          category_resolved_by?: string | null
          created_at?: string | null
          end_time?: string | null
          event_category?: string | null
          event_metadata?: Json | null
          event_subcategory?: string | null
          external_id?: string | null
          flight_duration_minutes?: number | null
          id?: string | null
          identity_key?: string | null
          is_all_day?: boolean | null
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          provider?: string | null
          start_time?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      web_primary_calendar_events: {
        Row: {
          attendees_count: number | null
          created_at: string | null
          end_time: string | null
          event_category: string | null
          event_metadata: Json | null
          event_subcategory: string | null
          external_id: string | null
          flight_duration_minutes: number | null
          id: string | null
          is_all_day: boolean | null
          is_organizer: boolean | null
          is_recurring: boolean | null
          provider: string | null
          start_time: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          attendees_count?: number | null
          created_at?: string | null
          end_time?: string | null
          event_category?: string | null
          event_metadata?: Json | null
          event_subcategory?: string | null
          external_id?: string | null
          flight_duration_minutes?: number | null
          id?: string | null
          is_all_day?: boolean | null
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          provider?: string | null
          start_time?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          attendees_count?: number | null
          created_at?: string | null
          end_time?: string | null
          event_category?: string | null
          event_metadata?: Json | null
          event_subcategory?: string | null
          external_id?: string | null
          flight_duration_minutes?: number | null
          id?: string | null
          is_all_day?: boolean | null
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          provider?: string | null
          start_time?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_user_data: { Args: { _user_id: string }; Returns: Json }
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      cleanup_device_tokens: { Args: never; Returns: Json }
      cleanup_old_calendar_events: { Args: never; Returns: number }
      credit_referrer_atomic: { Args: { p_referrer_id: string }; Returns: Json }
      delete_my_user_data: { Args: { _user_id: string }; Returns: Json }
      enforce_trial_expiry: { Args: { p_user_id: string }; Returns: undefined }
      extend_subscription: {
        Args: { p_months: number; p_user_id: string }
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
      get_cron_shared_secret: { Args: never; Returns: string }
      get_event_type_skip_count: {
        Args: { p_days_back: number; p_event_type: string; p_user_id: string }
        Returns: number
      }
      get_oura_access_token: {
        Args: { _connection_id: string }
        Returns: string
      }
      get_oura_refresh_token: {
        Args: { _connection_id: string }
        Returns: string
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      increment_pattern_observation: {
        Args: { p_pattern_id: string }
        Returns: undefined
      }
      increment_referral_stats: {
        Args: {
          p_increment_conversions?: boolean
          p_increment_signups?: boolean
          p_referrer_id: string
        }
        Returns: undefined
      }
      migrate_calendar_tokens: { Args: never; Returns: undefined }
      migrate_oura_tokens: { Args: never; Returns: undefined }
      promote_learned_event_tokens: {
        Args: { p_min_titles?: number }
        Returns: Json
      }
      store_calendar_access_token: {
        Args: { _connection_id: string; _token: string }
        Returns: undefined
      }
      store_calendar_refresh_token: {
        Args: { _connection_id: string; _token: string }
        Returns: undefined
      }
      store_oura_access_token: {
        Args: { _connection_id: string; _expires_at: string; _token: string }
        Returns: undefined
      }
      store_oura_refresh_token: {
        Args: { _connection_id: string; _token: string }
        Returns: undefined
      }
      try_assign_founding_member: {
        Args: { p_user_id: string }
        Returns: boolean
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
