CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'user',
    'admin'
);


--
-- Name: assign_default_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_default_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'user');
  return new;
end;
$$;


--
-- Name: assign_user_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_user_role(_user_id uuid, _role public.app_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only allow if called by authenticated admin
  IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can assign roles';
  END IF;
  
  INSERT INTO user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;


--
-- Name: get_calendar_access_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_calendar_access_token(_connection_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_access_token_id INTO token_id
  FROM calendar_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;


--
-- Name: get_calendar_refresh_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_calendar_refresh_token(_connection_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_refresh_token_id INTO token_id
  FROM calendar_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;


--
-- Name: get_oura_access_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_oura_access_token(_connection_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_access_token_id INTO token_id
  FROM oura_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;


--
-- Name: get_oura_refresh_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_oura_refresh_token(_connection_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_refresh_token_id INTO token_id
  FROM oura_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id::text
      AND role = _role
  );
$$;


--
-- Name: migrate_calendar_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_calendar_tokens() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  conn RECORD;
  access_secret_id uuid;
  refresh_secret_id uuid;
BEGIN
  FOR conn IN SELECT * FROM calendar_connections WHERE access_token IS NOT NULL LOOP
    -- Store access token in vault
    INSERT INTO vault.secrets (secret, description)
    VALUES (conn.access_token, 'Calendar access token for user ' || conn.user_id)
    RETURNING id INTO access_secret_id;
    
    -- Update connection record with encrypted token reference
    UPDATE calendar_connections
    SET encrypted_access_token_id = access_secret_id
    WHERE id = conn.id;
    
    -- Handle refresh token if exists
    IF conn.refresh_token IS NOT NULL THEN
      INSERT INTO vault.secrets (secret, description)
      VALUES (conn.refresh_token, 'Calendar refresh token for user ' || conn.user_id)
      RETURNING id INTO refresh_secret_id;
      
      UPDATE calendar_connections
      SET encrypted_refresh_token_id = refresh_secret_id
      WHERE id = conn.id;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: migrate_oura_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migrate_oura_tokens() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  conn RECORD;
  access_secret_id uuid;
  refresh_secret_id uuid;
BEGIN
  FOR conn IN SELECT * FROM oura_connections WHERE access_token IS NOT NULL LOOP
    -- Store access token in vault
    INSERT INTO vault.secrets (secret, description)
    VALUES (conn.access_token, 'Oura access token for user ' || conn.user_id)
    RETURNING id INTO access_secret_id;
    
    -- Update connection record with encrypted token reference
    UPDATE oura_connections
    SET encrypted_access_token_id = access_secret_id
    WHERE id = conn.id;
    
    -- Handle refresh token if exists
    IF conn.refresh_token IS NOT NULL THEN
      INSERT INTO vault.secrets (secret, description)
      VALUES (conn.refresh_token, 'Oura refresh token for user ' || conn.user_id)
      RETURNING id INTO refresh_secret_id;
      
      UPDATE oura_connections
      SET encrypted_refresh_token_id = refresh_secret_id
      WHERE id = conn.id;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: store_calendar_access_token(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_calendar_access_token(_connection_id uuid, _token text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  secret_id uuid;
  existing_secret_id uuid;
BEGIN
  -- Get existing secret ID if any
  SELECT encrypted_access_token_id INTO existing_secret_id
  FROM calendar_connections
  WHERE id = _connection_id;
  
  -- Delete old secret if exists
  IF existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_secret_id;
  END IF;
  
  -- Store new token in vault
  INSERT INTO vault.secrets (secret, description)
  VALUES (_token, 'Calendar access token for connection ' || _connection_id)
  RETURNING id INTO secret_id;
  
  -- Update connection with new secret reference
  UPDATE calendar_connections
  SET encrypted_access_token_id = secret_id,
      access_token = NULL  -- Clear plaintext token
  WHERE id = _connection_id;
END;
$$;


--
-- Name: store_calendar_refresh_token(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_calendar_refresh_token(_connection_id uuid, _token text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  secret_id uuid;
  existing_secret_id uuid;
BEGIN
  -- Get existing secret ID if any
  SELECT encrypted_refresh_token_id INTO existing_secret_id
  FROM calendar_connections
  WHERE id = _connection_id;
  
  -- Delete old secret if exists
  IF existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_secret_id;
  END IF;
  
  -- Store new token in vault
  INSERT INTO vault.secrets (secret, description)
  VALUES (_token, 'Calendar refresh token for connection ' || _connection_id)
  RETURNING id INTO secret_id;
  
  -- Update connection with new secret reference
  UPDATE calendar_connections
  SET encrypted_refresh_token_id = secret_id,
      refresh_token = NULL  -- Clear plaintext token
  WHERE id = _connection_id;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: achievement_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievement_definitions (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    cluster text,
    icon_name text,
    badge_color text,
    threshold_scenarios integer DEFAULT 5,
    threshold_skill_progress integer,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    threshold_points integer
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor text,
    action text NOT NULL,
    table_name text,
    record_id text,
    metadata jsonb
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: calendar_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    provider text NOT NULL,
    token_expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    last_sync timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    encrypted_access_token_id uuid,
    encrypted_refresh_token_id uuid,
    access_token_enc text,
    refresh_token_enc text,
    token_iv text,
    token_enc_v integer DEFAULT 1,
    CONSTRAINT calendar_connections_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'microsoft'::text])))
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    external_id text NOT NULL,
    title text,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    attendees_count integer DEFAULT 0,
    is_organizer boolean DEFAULT false,
    is_recurring boolean DEFAULT false,
    event_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: certificate_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificate_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    achievement_id text NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    mailing_address text,
    city text,
    country text,
    postal_code text,
    request_status text DEFAULT 'pending'::text,
    tracking_number text,
    notes text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    shipped_at timestamp with time zone,
    address_blob_enc text,
    address_iv text,
    address_enc_v integer DEFAULT 1
);

ALTER TABLE ONLY public.certificate_requests FORCE ROW LEVEL SECURITY;


--
-- Name: checkin_skip_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkin_skip_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    skip_date date NOT NULL,
    has_wearable boolean DEFAULT false,
    has_calendar boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: checkin_tag_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkin_tag_definitions (
    key text NOT NULL,
    display_name text NOT NULL,
    mapped_outcome text,
    energy_balance_min integer,
    energy_balance_max integer,
    description text,
    CONSTRAINT checkin_tag_definitions_mapped_outcome_check CHECK ((mapped_outcome = ANY (ARRAY['pause'::text, 'power-up'::text, 'presence'::text, 'steady'::text, 'focused'::text, 'ready'::text])))
);


--
-- Name: content_relevance_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_relevance_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    feedback_type text NOT NULL,
    star_rating integer,
    session_id uuid,
    trigger_context text,
    feedback_text text,
    feedback_reason text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    context_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_relevance_feedback_content_type_check CHECK ((content_type = ANY (ARRAY['soundbath'::text, 'guided-practice'::text, 'micro-practice'::text]))),
    CONSTRAINT content_relevance_feedback_feedback_text_check CHECK ((char_length(feedback_text) <= 500)),
    CONSTRAINT content_relevance_feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['star_rating'::text, 'thumbs_up'::text, 'thumbs_down'::text, 'report_issue'::text]))),
    CONSTRAINT content_relevance_feedback_star_rating_check CHECK (((star_rating >= 1) AND (star_rating <= 5)))
);


--
-- Name: daily_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    checkin_date date NOT NULL,
    outcome text NOT NULL,
    skipped boolean DEFAULT false,
    "timestamp" timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    data_sources jsonb DEFAULT '{}'::jsonb,
    energy_balance integer,
    state_tags text[]
);


--
-- Name: daily_ritual_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_ritual_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    ritual_date date NOT NULL,
    soundscape_completed boolean DEFAULT false,
    soundscape_completed_at timestamp with time zone,
    guided_practice_completed boolean DEFAULT false,
    guided_practice_completed_at timestamp with time zone,
    micro_exercise_completed boolean DEFAULT false,
    micro_exercise_completed_at timestamp with time zone,
    completion_status text DEFAULT 'skipped'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recommended_practices_count integer DEFAULT 3,
    recommended_practice_ids text[] DEFAULT '{}'::text[],
    completed_practice_ids text[] DEFAULT '{}'::text[]
);


--
-- Name: detected_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detected_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    message_id uuid,
    sentiment jsonb DEFAULT '{}'::jsonb,
    emotions jsonb DEFAULT '[]'::jsonb,
    ei_behaviors jsonb DEFAULT '{}'::jsonb,
    skill_gaps jsonb DEFAULT '[]'::jsonb,
    skill_strengths jsonb DEFAULT '[]'::jsonb,
    conversation_flow jsonb DEFAULT '{}'::jsonb,
    risk_assessment jsonb DEFAULT '{}'::jsonb,
    coaching_readiness jsonb DEFAULT '{}'::jsonb,
    raw_signals jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.detected_signals FORCE ROW LEVEL SECURITY;


--
-- Name: dialogue_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dialogue_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id text NOT NULL,
    strengths_identified jsonb DEFAULT '[]'::jsonb,
    growth_areas jsonb DEFAULT '[]'::jsonb,
    key_moments jsonb DEFAULT '[]'::jsonb,
    meta_skill_scores jsonb DEFAULT '{}'::jsonb,
    overall_performance_score numeric(5,2),
    ai_summary text,
    recommendations jsonb DEFAULT '[]'::jsonb,
    transcript_highlights jsonb DEFAULT '[]'::jsonb,
    generated_at timestamp with time zone DEFAULT now()
);


--
-- Name: dialogue_interventions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dialogue_interventions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    triggered_by_message_id uuid,
    intervention_type text NOT NULL,
    meta_skill_target text,
    sub_skill_target text,
    observation text,
    framework_used text,
    wisdom_source jsonb,
    action_suggested text,
    coach_personality text,
    user_acknowledged boolean DEFAULT false,
    displayed_at timestamp with time zone DEFAULT now(),
    dismissed_at timestamp with time zone,
    meta_data jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.dialogue_interventions FORCE ROW LEVEL SECURITY;


--
-- Name: dialogue_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dialogue_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    message_index integer NOT NULL,
    sender_type text NOT NULL,
    content text NOT NULL,
    emotion_displayed text,
    audio_url text,
    "timestamp" timestamp with time zone DEFAULT now(),
    meta_data jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.dialogue_messages FORCE ROW LEVEL SECURITY;


--
-- Name: dialogue_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dialogue_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    scenario_id text,
    persona_id text,
    context_type text DEFAULT 'scenario'::text NOT NULL,
    scenario_context jsonb DEFAULT '{}'::jsonb,
    coach_personality text DEFAULT 'supportive'::text,
    session_status text DEFAULT 'active'::text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    duration_seconds integer,
    total_messages integer DEFAULT 0,
    total_interventions integer DEFAULT 0,
    meta_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.dialogue_sessions FORCE ROW LEVEL SECURITY;


--
-- Name: dialogue_skill_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dialogue_skill_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    message_id uuid,
    event_type text NOT NULL,
    meta_skill text NOT NULL,
    sub_skill text,
    cluster text,
    confidence numeric(3,2),
    indicators text[],
    context_note text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.dialogue_skill_events FORCE ROW LEVEL SECURITY;


--
-- Name: energy_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energy_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    snapshot_date date NOT NULL,
    energy_balance numeric(5,2),
    dominant_state text,
    pause_percentage numeric(5,2),
    powerup_percentage numeric(5,2),
    presence_percentage numeric(5,2),
    total_sessions integer DEFAULT 0,
    oura_readiness numeric(5,2),
    calendar_density integer,
    computed_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mental_fitness_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mental_fitness_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    score_date date NOT NULL,
    score integer NOT NULL,
    ritual_completion_score numeric,
    checkin_consistency_score numeric,
    content_engagement_score numeric,
    streak_bonus numeric,
    current_streak integer DEFAULT 0,
    is_baseline_period boolean DEFAULT false,
    baseline_avg numeric,
    trend text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mental_fitness_scores_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: meta_skill_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_skill_definitions (
    key text NOT NULL,
    display_name text NOT NULL,
    cluster text NOT NULL,
    core_function text,
    description text,
    display_order integer DEFAULT 0,
    CONSTRAINT meta_skill_definitions_cluster_check CHECK ((cluster = ANY (ARRAY['self_mastery'::text, 'social_mastery'::text])))
);


--
-- Name: meta_skill_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_skill_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    meta_skill_key text NOT NULL,
    cluster text NOT NULL,
    baseline_score numeric,
    current_score numeric DEFAULT 0,
    scenarios_practiced integer DEFAULT 0,
    strengths_demonstrated integer DEFAULT 0,
    gaps_identified integer DEFAULT 0,
    last_session_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: micro_intervention_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.micro_intervention_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    event_type text NOT NULL,
    intervention_id text NOT NULL,
    intervention_type text NOT NULL,
    trigger_event_id text,
    trigger_reason text,
    timing_window text,
    urgency_level text,
    recommended_content_id text,
    recommended_content_type text,
    time_to_action_seconds integer,
    dismissed_reason text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    context_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT micro_intervention_events_event_type_check CHECK ((event_type = ANY (ARRAY['nudge_sent'::text, 'nudge_clicked'::text, 'nudge_dismissed'::text, 'nudge_ignored'::text]))),
    CONSTRAINT micro_intervention_events_urgency_level_check CHECK ((urgency_level = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: oura_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oura_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    token_expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    last_sync timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    encrypted_access_token_id uuid,
    encrypted_refresh_token_id uuid
);


--
-- Name: oura_daily_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oura_daily_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    summary_date date NOT NULL,
    readiness_score integer,
    sleep_score integer,
    activity_score integer,
    hrv numeric(6,2),
    resting_heart_rate integer,
    raw_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: persona_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persona_definitions (
    id text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    personality_traits jsonb DEFAULT '[]'::jsonb,
    communication_style text,
    challenge_level integer DEFAULT 5,
    background_context text,
    scenario_ids text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- Name: practice_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    category text NOT NULL,
    duration_seconds integer,
    completed boolean DEFAULT false,
    part_of_ritual boolean DEFAULT false,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    effectiveness_rating integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id text NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    onboarding_completed_at timestamp with time zone,
    identity_role text,
    biggest_pressure text,
    q1_setback_response text,
    q2_pressure_response text,
    q3_communication_style text,
    q4_self_assessed_strength text,
    energy_regulation_response text,
    focus_recovery_response text,
    energy_renewal_response text,
    growth_priority text,
    mental_fitness_baseline integer,
    component_scores jsonb,
    meta_skill_scores jsonb,
    profile_type text,
    profile_description text,
    user_archetype text,
    alignment_status text,
    onboarding_session_id text,
    subscription_status text,
    subscription_plan text,
    total_self_mastery_points integer DEFAULT 0,
    total_social_mastery_points integer DEFAULT 0,
    current_streak integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    last_streak_celebration integer DEFAULT 0,
    CONSTRAINT profiles_subscription_status_check CHECK (((subscription_status = ANY (ARRAY['active'::text, 'inactive'::text, 'trial'::text])) OR (subscription_status IS NULL)))
);

ALTER TABLE ONLY public.profiles FORCE ROW LEVEL SECURITY;


--
-- Name: sanctuary_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sanctuary_content (
    id text NOT NULL,
    title text NOT NULL,
    content_type text NOT NULL,
    category text NOT NULL,
    duration numeric NOT NULL,
    difficulty text,
    creator text,
    origin text,
    story_hook text,
    used_by text,
    sub_type text,
    voice text,
    language text DEFAULT 'en'::text,
    thumbnail_url text,
    audio_url text,
    steps_count integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    protocol_type text,
    CONSTRAINT sanctuary_content_category_check CHECK ((category = ANY (ARRAY['pause'::text, 'power-up'::text, 'presence'::text]))),
    CONSTRAINT sanctuary_content_content_type_check CHECK ((content_type = ANY (ARRAY['soundbath'::text, 'guided-practice'::text, 'micro-practice'::text]))),
    CONSTRAINT sanctuary_content_difficulty_check CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))),
    CONSTRAINT sanctuary_content_protocol_type_check CHECK ((protocol_type = ANY (ARRAY['mindset'::text, 'somatic'::text, 'audio'::text, 'hybrid'::text]))),
    CONSTRAINT sanctuary_content_sub_type_check CHECK ((sub_type = ANY (ARRAY['mindset'::text, 'tool'::text]))),
    CONSTRAINT sanctuary_content_voice_check CHECK ((voice = ANY (ARRAY['male'::text, 'female'::text, 'neutral'::text, 'none'::text, 'ai'::text])))
);


--
-- Name: sanctuary_content_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sanctuary_content_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_id text NOT NULL,
    structured_tags jsonb DEFAULT '{}'::jsonb,
    full_story text,
    technique text,
    benefits text[] DEFAULT '{}'::text[],
    completion_quote text,
    intro_summary text,
    what_you_need text[] DEFAULT '{}'::text[],
    expected_outcomes text[] DEFAULT '{}'::text[],
    essence text,
    parallel text,
    cue text,
    real_examples jsonb DEFAULT '[]'::jsonb,
    why_this_works text,
    delivery_modality text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    meta_skills jsonb DEFAULT '{"primary": [], "secondary": []}'::jsonb,
    sub_skills jsonb DEFAULT '{"primary": [], "secondary": []}'::jsonb,
    soft_skills text[] DEFAULT '{}'::text[],
    usage_occasions text[] DEFAULT '{}'::text[],
    checkin_tags jsonb DEFAULT '{"primary": [], "secondary": []}'::jsonb,
    mastery_category jsonb DEFAULT '{"primary": null, "secondary": []}'::jsonb
);


--
-- Name: sanctuary_content_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sanctuary_content_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_id text NOT NULL,
    step_order integer NOT NULL,
    title text NOT NULL,
    instruction text NOT NULL,
    duration integer,
    breathing_pattern text,
    wisdom_note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sanctuary_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sanctuary_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    event_type text NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    category text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    duration_seconds integer,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    context_data jsonb DEFAULT '{}'::jsonb,
    effectiveness_rating integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sanctuary_events_category_check CHECK ((category = ANY (ARRAY['pause'::text, 'power-up'::text, 'presence'::text]))),
    CONSTRAINT sanctuary_events_content_type_check CHECK ((content_type = ANY (ARRAY['soundbath'::text, 'guided-practice'::text, 'micro-practice'::text]))),
    CONSTRAINT sanctuary_events_effectiveness_rating_check CHECK (((effectiveness_rating >= 1) AND (effectiveness_rating <= 5))),
    CONSTRAINT sanctuary_events_event_type_check CHECK ((event_type = ANY (ARRAY['session_start'::text, 'session_complete'::text, 'session_pause'::text, 'session_skip'::text])))
);


--
-- Name: saved_debriefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_debriefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    session_id uuid,
    title text,
    scenario_domain text,
    scenario_context text,
    persona_type text,
    duration_seconds integer,
    debrief_summary jsonb DEFAULT '{}'::jsonb,
    transcript_json jsonb DEFAULT '[]'::jsonb,
    strengths jsonb DEFAULT '[]'::jsonb,
    development_areas jsonb DEFAULT '[]'::jsonb,
    frameworks_used jsonb DEFAULT '[]'::jsonb,
    personal_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: scenario_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenario_definitions (
    id text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    description text,
    context_type text DEFAULT 'scenario'::text NOT NULL,
    difficulty_level text DEFAULT 'intermediate'::text,
    target_meta_skills jsonb DEFAULT '[]'::jsonb,
    scenario_context jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    conversation_dynamics jsonb DEFAULT '{"style": "balanced", "initiative": "mutual"}'::jsonb
);


--
-- Name: session_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    session_id uuid,
    resonance text NOT NULL,
    deeper_focus text,
    next_session_focus text[],
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: soft_skill_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.soft_skill_definitions (
    key text NOT NULL,
    display_name text NOT NULL,
    related_meta_skills text[],
    description text
);


--
-- Name: sub_skill_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_skill_definitions (
    key text NOT NULL,
    display_name text NOT NULL,
    parent_meta_skill text,
    description text
);


--
-- Name: usage_occasion_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_occasion_definitions (
    key text NOT NULL,
    display_name text NOT NULL,
    category text,
    description text,
    CONSTRAINT usage_occasion_definitions_category_check CHECK ((category = ANY (ARRAY['timing'::text, 'event'::text, 'context'::text, 'energy_state'::text])))
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    achievement_id text NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL,
    scenarios_at_earn integer,
    skill_progress_at_earn numeric,
    shared_to_linkedin boolean DEFAULT false,
    shared_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_engagements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_engagements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    event_type text NOT NULL,
    category text,
    content_id text,
    content_type text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    category text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    preferred_times jsonb DEFAULT '{}'::jsonb,
    effective_content_types jsonb DEFAULT '{}'::jsonb,
    favorite_content_ids text[] DEFAULT '{}'::text[],
    energy_patterns jsonb DEFAULT '{}'::jsonb,
    last_updated timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: achievement_definitions achievement_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievement_definitions
    ADD CONSTRAINT achievement_definitions_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: calendar_connections calendar_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_pkey PRIMARY KEY (id);


--
-- Name: calendar_connections calendar_connections_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_user_id_key UNIQUE (user_id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_user_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_user_id_external_id_key UNIQUE (user_id, external_id);


--
-- Name: certificate_requests certificate_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_requests
    ADD CONSTRAINT certificate_requests_pkey PRIMARY KEY (id);


--
-- Name: checkin_skip_events checkin_skip_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_skip_events
    ADD CONSTRAINT checkin_skip_events_pkey PRIMARY KEY (id);


--
-- Name: checkin_skip_events checkin_skip_events_user_id_skip_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_skip_events
    ADD CONSTRAINT checkin_skip_events_user_id_skip_date_key UNIQUE (user_id, skip_date);


--
-- Name: checkin_tag_definitions checkin_tag_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_tag_definitions
    ADD CONSTRAINT checkin_tag_definitions_pkey PRIMARY KEY (key);


--
-- Name: content_relevance_feedback content_relevance_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_relevance_feedback
    ADD CONSTRAINT content_relevance_feedback_pkey PRIMARY KEY (id);


--
-- Name: daily_checkins daily_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_checkins
    ADD CONSTRAINT daily_checkins_pkey PRIMARY KEY (id);


--
-- Name: daily_checkins daily_checkins_user_id_checkin_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_checkins
    ADD CONSTRAINT daily_checkins_user_id_checkin_date_key UNIQUE (user_id, checkin_date);


--
-- Name: daily_ritual_completions daily_ritual_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ritual_completions
    ADD CONSTRAINT daily_ritual_completions_pkey PRIMARY KEY (id);


--
-- Name: daily_ritual_completions daily_ritual_completions_user_id_ritual_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ritual_completions
    ADD CONSTRAINT daily_ritual_completions_user_id_ritual_date_key UNIQUE (user_id, ritual_date);


--
-- Name: detected_signals detected_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detected_signals
    ADD CONSTRAINT detected_signals_pkey PRIMARY KEY (id);


--
-- Name: dialogue_analytics dialogue_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_analytics
    ADD CONSTRAINT dialogue_analytics_pkey PRIMARY KEY (id);


--
-- Name: dialogue_interventions dialogue_interventions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_interventions
    ADD CONSTRAINT dialogue_interventions_pkey PRIMARY KEY (id);


--
-- Name: dialogue_messages dialogue_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_messages
    ADD CONSTRAINT dialogue_messages_pkey PRIMARY KEY (id);


--
-- Name: dialogue_sessions dialogue_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_sessions
    ADD CONSTRAINT dialogue_sessions_pkey PRIMARY KEY (id);


--
-- Name: dialogue_skill_events dialogue_skill_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_skill_events
    ADD CONSTRAINT dialogue_skill_events_pkey PRIMARY KEY (id);


--
-- Name: energy_snapshots energy_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_snapshots
    ADD CONSTRAINT energy_snapshots_pkey PRIMARY KEY (id);


--
-- Name: energy_snapshots energy_snapshots_user_id_snapshot_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energy_snapshots
    ADD CONSTRAINT energy_snapshots_user_id_snapshot_date_key UNIQUE (user_id, snapshot_date);


--
-- Name: mental_fitness_scores mental_fitness_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mental_fitness_scores
    ADD CONSTRAINT mental_fitness_scores_pkey PRIMARY KEY (id);


--
-- Name: mental_fitness_scores mental_fitness_scores_user_id_score_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mental_fitness_scores
    ADD CONSTRAINT mental_fitness_scores_user_id_score_date_key UNIQUE (user_id, score_date);


--
-- Name: meta_skill_definitions meta_skill_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_skill_definitions
    ADD CONSTRAINT meta_skill_definitions_pkey PRIMARY KEY (key);


--
-- Name: meta_skill_progress meta_skill_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_skill_progress
    ADD CONSTRAINT meta_skill_progress_pkey PRIMARY KEY (id);


--
-- Name: meta_skill_progress meta_skill_progress_user_id_meta_skill_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_skill_progress
    ADD CONSTRAINT meta_skill_progress_user_id_meta_skill_key_key UNIQUE (user_id, meta_skill_key);


--
-- Name: micro_intervention_events micro_intervention_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.micro_intervention_events
    ADD CONSTRAINT micro_intervention_events_pkey PRIMARY KEY (id);


--
-- Name: oura_connections oura_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oura_connections
    ADD CONSTRAINT oura_connections_pkey PRIMARY KEY (id);


--
-- Name: oura_connections oura_connections_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oura_connections
    ADD CONSTRAINT oura_connections_user_id_key UNIQUE (user_id);


--
-- Name: oura_daily_data oura_daily_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oura_daily_data
    ADD CONSTRAINT oura_daily_data_pkey PRIMARY KEY (id);


--
-- Name: oura_daily_data oura_daily_data_user_id_summary_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oura_daily_data
    ADD CONSTRAINT oura_daily_data_user_id_summary_date_key UNIQUE (user_id, summary_date);


--
-- Name: persona_definitions persona_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persona_definitions
    ADD CONSTRAINT persona_definitions_pkey PRIMARY KEY (id);


--
-- Name: practice_sessions practice_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_sessions
    ADD CONSTRAINT practice_sessions_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: sanctuary_content_metadata sanctuary_content_metadata_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_content_metadata
    ADD CONSTRAINT sanctuary_content_metadata_content_id_key UNIQUE (content_id);


--
-- Name: sanctuary_content_metadata sanctuary_content_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_content_metadata
    ADD CONSTRAINT sanctuary_content_metadata_pkey PRIMARY KEY (id);


--
-- Name: sanctuary_content sanctuary_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_content
    ADD CONSTRAINT sanctuary_content_pkey PRIMARY KEY (id);


--
-- Name: sanctuary_content_steps sanctuary_content_steps_content_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_content_steps
    ADD CONSTRAINT sanctuary_content_steps_content_id_step_order_key UNIQUE (content_id, step_order);


--
-- Name: sanctuary_content_steps sanctuary_content_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_content_steps
    ADD CONSTRAINT sanctuary_content_steps_pkey PRIMARY KEY (id);


--
-- Name: sanctuary_events sanctuary_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_events
    ADD CONSTRAINT sanctuary_events_pkey PRIMARY KEY (id);


--
-- Name: saved_debriefs saved_debriefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_debriefs
    ADD CONSTRAINT saved_debriefs_pkey PRIMARY KEY (id);


--
-- Name: scenario_definitions scenario_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_definitions
    ADD CONSTRAINT scenario_definitions_pkey PRIMARY KEY (id);


--
-- Name: session_feedback session_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_pkey PRIMARY KEY (id);


--
-- Name: soft_skill_definitions soft_skill_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.soft_skill_definitions
    ADD CONSTRAINT soft_skill_definitions_pkey PRIMARY KEY (key);


--
-- Name: sub_skill_definitions sub_skill_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_skill_definitions
    ADD CONSTRAINT sub_skill_definitions_pkey PRIMARY KEY (key);


--
-- Name: usage_occasion_definitions usage_occasion_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_occasion_definitions
    ADD CONSTRAINT usage_occasion_definitions_pkey PRIMARY KEY (key);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_user_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);


--
-- Name: user_engagements user_engagements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_engagements
    ADD CONSTRAINT user_engagements_pkey PRIMARY KEY (id);


--
-- Name: user_favorites user_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favorites
    ADD CONSTRAINT user_favorites_pkey PRIMARY KEY (id);


--
-- Name: user_favorites user_favorites_user_id_content_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_favorites
    ADD CONSTRAINT user_favorites_user_id_content_id_key UNIQUE (user_id, content_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: certificate_requests_user_achievement_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX certificate_requests_user_achievement_uniq ON public.certificate_requests USING btree (user_id, achievement_id);


--
-- Name: idx_calendar_events_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_user_time ON public.calendar_events USING btree (user_id, start_time DESC);


--
-- Name: idx_content_feedback_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_feedback_rating ON public.content_relevance_feedback USING btree (star_rating) WHERE (star_rating IS NOT NULL);


--
-- Name: idx_content_feedback_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_feedback_type ON public.content_relevance_feedback USING btree (content_type, feedback_type);


--
-- Name: idx_content_feedback_user_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_feedback_user_content ON public.content_relevance_feedback USING btree (user_id, content_id, "timestamp" DESC);


--
-- Name: idx_daily_checkins_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_checkins_user_date ON public.daily_checkins USING btree (user_id, checkin_date DESC);


--
-- Name: idx_daily_ritual_completions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_ritual_completions_user_date ON public.daily_ritual_completions USING btree (user_id, ritual_date DESC);


--
-- Name: idx_detected_signals_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detected_signals_session ON public.detected_signals USING btree (session_id);


--
-- Name: idx_dialogue_analytics_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dialogue_analytics_user ON public.dialogue_analytics USING btree (user_id);


--
-- Name: idx_dialogue_interventions_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dialogue_interventions_session ON public.dialogue_interventions USING btree (session_id);


--
-- Name: idx_dialogue_messages_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dialogue_messages_session ON public.dialogue_messages USING btree (session_id);


--
-- Name: idx_dialogue_messages_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dialogue_messages_timestamp ON public.dialogue_messages USING btree ("timestamp");


--
-- Name: idx_dialogue_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dialogue_sessions_status ON public.dialogue_sessions USING btree (session_status);


--
-- Name: idx_dialogue_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dialogue_sessions_user ON public.dialogue_sessions USING btree (user_id);


--
-- Name: idx_dialogue_skill_events_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dialogue_skill_events_session ON public.dialogue_skill_events USING btree (session_id);


--
-- Name: idx_energy_snapshots_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_energy_snapshots_user_date ON public.energy_snapshots USING btree (user_id, snapshot_date DESC);


--
-- Name: idx_mental_fitness_scores_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mental_fitness_scores_user_date ON public.mental_fitness_scores USING btree (user_id, score_date DESC);


--
-- Name: idx_micro_intervention_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_micro_intervention_type ON public.micro_intervention_events USING btree (intervention_type, event_type);


--
-- Name: idx_micro_intervention_user_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_micro_intervention_user_timestamp ON public.micro_intervention_events USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_oura_daily_data_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oura_daily_data_user_date ON public.oura_daily_data USING btree (user_id, summary_date DESC);


--
-- Name: idx_practice_sessions_user_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_sessions_user_started ON public.practice_sessions USING btree (user_id, started_at DESC);


--
-- Name: idx_sanctuary_content_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_content_active ON public.sanctuary_content USING btree (is_active);


--
-- Name: idx_sanctuary_content_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_content_category ON public.sanctuary_content USING btree (category);


--
-- Name: idx_sanctuary_content_steps_content_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_content_steps_content_id ON public.sanctuary_content_steps USING btree (content_id);


--
-- Name: idx_sanctuary_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_content_type ON public.sanctuary_content USING btree (content_type);


--
-- Name: idx_sanctuary_events_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_events_content_type ON public.sanctuary_events USING btree (content_type);


--
-- Name: idx_sanctuary_events_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_events_tags ON public.sanctuary_events USING gin (tags);


--
-- Name: idx_sanctuary_events_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_events_timestamp ON public.sanctuary_events USING btree ("timestamp" DESC);


--
-- Name: idx_sanctuary_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sanctuary_events_user_id ON public.sanctuary_events USING btree (user_id);


--
-- Name: idx_user_engagements_user_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_engagements_user_timestamp ON public.user_engagements USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_user_favorites_user_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_favorites_user_content ON public.user_favorites USING btree (user_id, content_id);


--
-- Name: daily_ritual_completions update_daily_ritual_completions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_daily_ritual_completions_updated_at BEFORE UPDATE ON public.daily_ritual_completions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meta_skill_progress update_meta_skill_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_meta_skill_progress_updated_at BEFORE UPDATE ON public.meta_skill_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sanctuary_content_metadata update_sanctuary_content_metadata_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sanctuary_content_metadata_updated_at BEFORE UPDATE ON public.sanctuary_content_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sanctuary_content update_sanctuary_content_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sanctuary_content_updated_at BEFORE UPDATE ON public.sanctuary_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: certificate_requests certificate_requests_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificate_requests
    ADD CONSTRAINT certificate_requests_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievement_definitions(id);


--
-- Name: detected_signals detected_signals_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detected_signals
    ADD CONSTRAINT detected_signals_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.dialogue_messages(id) ON DELETE CASCADE;


--
-- Name: detected_signals detected_signals_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detected_signals
    ADD CONSTRAINT detected_signals_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE;


--
-- Name: dialogue_analytics dialogue_analytics_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_analytics
    ADD CONSTRAINT dialogue_analytics_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE;


--
-- Name: dialogue_interventions dialogue_interventions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_interventions
    ADD CONSTRAINT dialogue_interventions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE;


--
-- Name: dialogue_interventions dialogue_interventions_triggered_by_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_interventions
    ADD CONSTRAINT dialogue_interventions_triggered_by_message_id_fkey FOREIGN KEY (triggered_by_message_id) REFERENCES public.dialogue_messages(id);


--
-- Name: dialogue_messages dialogue_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_messages
    ADD CONSTRAINT dialogue_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE;


--
-- Name: dialogue_sessions dialogue_sessions_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_sessions
    ADD CONSTRAINT dialogue_sessions_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.persona_definitions(id);


--
-- Name: dialogue_sessions dialogue_sessions_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_sessions
    ADD CONSTRAINT dialogue_sessions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenario_definitions(id);


--
-- Name: dialogue_skill_events dialogue_skill_events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_skill_events
    ADD CONSTRAINT dialogue_skill_events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.dialogue_messages(id);


--
-- Name: dialogue_skill_events dialogue_skill_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogue_skill_events
    ADD CONSTRAINT dialogue_skill_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE;


--
-- Name: meta_skill_progress meta_skill_progress_last_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_skill_progress
    ADD CONSTRAINT meta_skill_progress_last_session_id_fkey FOREIGN KEY (last_session_id) REFERENCES public.dialogue_sessions(id);


--
-- Name: sanctuary_content_metadata sanctuary_content_metadata_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_content_metadata
    ADD CONSTRAINT sanctuary_content_metadata_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.sanctuary_content(id) ON DELETE CASCADE;


--
-- Name: sanctuary_content_steps sanctuary_content_steps_content_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanctuary_content_steps
    ADD CONSTRAINT sanctuary_content_steps_content_id_fkey FOREIGN KEY (content_id) REFERENCES public.sanctuary_content(id) ON DELETE CASCADE;


--
-- Name: saved_debriefs saved_debriefs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_debriefs
    ADD CONSTRAINT saved_debriefs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dialogue_sessions(id);


--
-- Name: session_feedback session_feedback_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE;


--
-- Name: sub_skill_definitions sub_skill_definitions_parent_meta_skill_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_skill_definitions
    ADD CONSTRAINT sub_skill_definitions_parent_meta_skill_fkey FOREIGN KEY (parent_meta_skill) REFERENCES public.meta_skill_definitions(key) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievement_definitions(id);


--
-- Name: sanctuary_content Admins can delete content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete content" ON public.sanctuary_content AS RESTRICTIVE FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sanctuary_content Admins can insert content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert content" ON public.sanctuary_content AS RESTRICTIVE FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sanctuary_content Admins can update content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update content" ON public.sanctuary_content AS RESTRICTIVE FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: achievement_definitions Anyone can view achievement definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view achievement definitions" ON public.achievement_definitions FOR SELECT USING ((is_active = true));


--
-- Name: sanctuary_content Anyone can view active content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active content" ON public.sanctuary_content FOR SELECT USING ((is_active = true));


--
-- Name: persona_definitions Anyone can view active personas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active personas" ON public.persona_definitions FOR SELECT USING ((is_active = true));


--
-- Name: scenario_definitions Anyone can view active scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active scenarios" ON public.scenario_definitions FOR SELECT USING ((is_active = true));


--
-- Name: checkin_tag_definitions Anyone can view checkin tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view checkin tags" ON public.checkin_tag_definitions FOR SELECT USING (true);


--
-- Name: sanctuary_content_metadata Anyone can view content metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view content metadata" ON public.sanctuary_content_metadata FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.sanctuary_content
  WHERE ((sanctuary_content.id = sanctuary_content_metadata.content_id) AND (sanctuary_content.is_active = true)))));


--
-- Name: sanctuary_content_steps Anyone can view content steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view content steps" ON public.sanctuary_content_steps FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.sanctuary_content
  WHERE ((sanctuary_content.id = sanctuary_content_steps.content_id) AND (sanctuary_content.is_active = true)))));


--
-- Name: meta_skill_definitions Anyone can view meta skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view meta skills" ON public.meta_skill_definitions FOR SELECT USING (true);


--
-- Name: soft_skill_definitions Anyone can view soft skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view soft skills" ON public.soft_skill_definitions FOR SELECT USING (true);


--
-- Name: sub_skill_definitions Anyone can view sub skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view sub skills" ON public.sub_skill_definitions FOR SELECT USING (true);


--
-- Name: usage_occasion_definitions Anyone can view usage occasions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view usage occasions" ON public.usage_occasion_definitions FOR SELECT USING (true);


--
-- Name: user_roles Only admins can assign roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can assign roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Only admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: checkin_tag_definitions Only admins can modify checkin tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify checkin tags" ON public.checkin_tag_definitions USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: meta_skill_definitions Only admins can modify meta skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify meta skills" ON public.meta_skill_definitions USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sanctuary_content_metadata Only admins can modify metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify metadata" ON public.sanctuary_content_metadata USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: soft_skill_definitions Only admins can modify soft skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify soft skills" ON public.soft_skill_definitions USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sanctuary_content_steps Only admins can modify steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify steps" ON public.sanctuary_content_steps USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: sub_skill_definitions Only admins can modify sub skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify sub skills" ON public.sub_skill_definitions USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: usage_occasion_definitions Only admins can modify usage occasions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can modify usage occasions" ON public.usage_occasion_definitions USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Only admins can view roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can view roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Roles cannot be updated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Roles cannot be updated" ON public.user_roles FOR UPDATE USING (false);


--
-- Name: audit_logs Service role can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: dialogue_analytics Service role can manage all analytics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all analytics" ON public.dialogue_analytics USING ((auth.role() = 'service_role'::text));


--
-- Name: calendar_connections Service role can manage all calendar connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all calendar connections" ON public.calendar_connections USING ((auth.role() = 'service_role'::text));


--
-- Name: calendar_events Service role can manage all calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all calendar events" ON public.calendar_events USING ((auth.role() = 'service_role'::text));


--
-- Name: certificate_requests Service role can manage all certificate requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all certificate requests" ON public.certificate_requests USING ((auth.role() = 'service_role'::text));


--
-- Name: checkin_skip_events Service role can manage all checkin skip events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all checkin skip events" ON public.checkin_skip_events USING ((auth.role() = 'service_role'::text));


--
-- Name: content_relevance_feedback Service role can manage all content feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all content feedback" ON public.content_relevance_feedback USING ((auth.role() = 'service_role'::text));


--
-- Name: daily_checkins Service role can manage all daily checkins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all daily checkins" ON public.daily_checkins USING ((auth.role() = 'service_role'::text));


--
-- Name: daily_ritual_completions Service role can manage all daily ritual completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all daily ritual completions" ON public.daily_ritual_completions USING ((auth.role() = 'service_role'::text));


--
-- Name: energy_snapshots Service role can manage all energy snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all energy snapshots" ON public.energy_snapshots USING ((auth.role() = 'service_role'::text));


--
-- Name: dialogue_interventions Service role can manage all interventions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all interventions" ON public.dialogue_interventions USING ((auth.role() = 'service_role'::text));


--
-- Name: mental_fitness_scores Service role can manage all mental fitness scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all mental fitness scores" ON public.mental_fitness_scores USING ((auth.role() = 'service_role'::text));


--
-- Name: dialogue_messages Service role can manage all messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all messages" ON public.dialogue_messages USING ((auth.role() = 'service_role'::text));


--
-- Name: practice_sessions Service role can manage all practice sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all practice sessions" ON public.practice_sessions USING ((auth.role() = 'service_role'::text));


--
-- Name: profiles Service role can manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all profiles" ON public.profiles USING ((auth.role() = 'service_role'::text));


--
-- Name: daily_ritual_completions Service role can manage all ritual completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all ritual completions" ON public.daily_ritual_completions USING ((auth.role() = 'service_role'::text));


--
-- Name: saved_debriefs Service role can manage all saved debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all saved debriefs" ON public.saved_debriefs USING ((auth.role() = 'service_role'::text));


--
-- Name: dialogue_sessions Service role can manage all sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all sessions" ON public.dialogue_sessions USING ((auth.role() = 'service_role'::text));


--
-- Name: detected_signals Service role can manage all signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all signals" ON public.detected_signals USING ((auth.role() = 'service_role'::text));


--
-- Name: dialogue_skill_events Service role can manage all skill events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all skill events" ON public.dialogue_skill_events USING ((auth.role() = 'service_role'::text));


--
-- Name: user_achievements Service role can manage all user achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all user achievements" ON public.user_achievements USING ((auth.role() = 'service_role'::text));


--
-- Name: user_engagements Service role can manage all user engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all user engagements" ON public.user_engagements USING ((auth.role() = 'service_role'::text));


--
-- Name: user_favorites Service role can manage all user favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all user favorites" ON public.user_favorites USING ((auth.role() = 'service_role'::text));


--
-- Name: user_preferences Service role can manage all user preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all user preferences" ON public.user_preferences USING ((auth.role() = 'service_role'::text));


--
-- Name: persona_definitions Service role can manage personas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage personas" ON public.persona_definitions USING ((auth.role() = 'service_role'::text));


--
-- Name: scenario_definitions Service role can manage scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage scenarios" ON public.scenario_definitions USING ((auth.role() = 'service_role'::text));


--
-- Name: user_favorites Users can delete their own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own favorites" ON public.user_favorites FOR DELETE USING (((auth.uid())::text = user_id));


--
-- Name: oura_connections Users can delete their own oura connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own oura connections" ON public.oura_connections FOR DELETE USING (((auth.uid())::text = user_id));


--
-- Name: daily_ritual_completions Users can delete their own ritual completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own ritual completions" ON public.daily_ritual_completions FOR DELETE USING (((auth.uid())::text = user_id));


--
-- Name: saved_debriefs Users can delete their own saved debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own saved debriefs" ON public.saved_debriefs FOR DELETE USING (((auth.uid())::text = user_id));


--
-- Name: checkin_skip_events Users can insert own skip events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own skip events" ON public.checkin_skip_events FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: user_achievements Users can insert their own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own achievements" ON public.user_achievements FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: certificate_requests Users can insert their own certificate requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own certificate requests" ON public.certificate_requests FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: daily_checkins Users can insert their own checkins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own checkins" ON public.daily_checkins FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: user_engagements Users can insert their own engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own engagements" ON public.user_engagements FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: sanctuary_events Users can insert their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own events" ON public.sanctuary_events FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: user_favorites Users can insert their own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own favorites" ON public.user_favorites FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: content_relevance_feedback Users can insert their own feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own feedback" ON public.content_relevance_feedback FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: mental_fitness_scores Users can insert their own fitness scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own fitness scores" ON public.mental_fitness_scores FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: micro_intervention_events Users can insert their own intervention events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own intervention events" ON public.micro_intervention_events FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: meta_skill_progress Users can insert their own meta skill progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own meta skill progress" ON public.meta_skill_progress FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: oura_connections Users can insert their own oura connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own oura connections" ON public.oura_connections FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: practice_sessions Users can insert their own practice sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own practice sessions" ON public.practice_sessions FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: user_preferences Users can insert their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own preferences" ON public.user_preferences FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (((auth.uid())::text = id));


--
-- Name: daily_ritual_completions Users can insert their own ritual completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own ritual completions" ON public.daily_ritual_completions FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: saved_debriefs Users can insert their own saved debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own saved debriefs" ON public.saved_debriefs FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: session_feedback Users can insert their own session feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own session feedback" ON public.session_feedback FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: energy_snapshots Users can insert their own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own snapshots" ON public.energy_snapshots FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: oura_daily_data Users can manage their own oura data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own oura data" ON public.oura_daily_data USING (((auth.uid())::text = user_id));


--
-- Name: user_achievements Users can update their own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own achievements" ON public.user_achievements FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: mental_fitness_scores Users can update their own fitness scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own fitness scores" ON public.mental_fitness_scores FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: meta_skill_progress Users can update their own meta skill progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own meta skill progress" ON public.meta_skill_progress FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: oura_connections Users can update their own oura connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own oura connections" ON public.oura_connections FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: practice_sessions Users can update their own practice sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own practice sessions" ON public.practice_sessions FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: user_preferences Users can update their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (((auth.uid())::text = id));


--
-- Name: daily_ritual_completions Users can update their own ritual completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own ritual completions" ON public.daily_ritual_completions FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: saved_debriefs Users can update their own saved debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own saved debriefs" ON public.saved_debriefs FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: energy_snapshots Users can update their own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own snapshots" ON public.energy_snapshots FOR UPDATE USING (((auth.uid())::text = user_id));


--
-- Name: checkin_skip_events Users can view own skip events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own skip events" ON public.checkin_skip_events FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: user_achievements Users can view their own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own achievements" ON public.user_achievements FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: certificate_requests Users can view their own certificate requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own certificate requests" ON public.certificate_requests FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: daily_checkins Users can view their own checkins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own checkins" ON public.daily_checkins FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: user_engagements Users can view their own engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own engagements" ON public.user_engagements FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: sanctuary_events Users can view their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own events" ON public.sanctuary_events FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: user_favorites Users can view their own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own favorites" ON public.user_favorites FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: content_relevance_feedback Users can view their own feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own feedback" ON public.content_relevance_feedback FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: mental_fitness_scores Users can view their own fitness scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own fitness scores" ON public.mental_fitness_scores FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: micro_intervention_events Users can view their own intervention events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own intervention events" ON public.micro_intervention_events FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: meta_skill_progress Users can view their own meta skill progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own meta skill progress" ON public.meta_skill_progress FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: oura_connections Users can view their own oura connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own oura connections" ON public.oura_connections FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: oura_daily_data Users can view their own oura data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own oura data" ON public.oura_daily_data FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: practice_sessions Users can view their own practice sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own practice sessions" ON public.practice_sessions FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: user_preferences Users can view their own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (((auth.uid())::text = id));


--
-- Name: daily_ritual_completions Users can view their own ritual completions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own ritual completions" ON public.daily_ritual_completions FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: saved_debriefs Users can view their own saved debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own saved debriefs" ON public.saved_debriefs FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: session_feedback Users can view their own session feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own session feedback" ON public.session_feedback FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: energy_snapshots Users can view their own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own snapshots" ON public.energy_snapshots FOR SELECT USING (((auth.uid())::text = user_id));


--
-- Name: achievement_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: certificate_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificate_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: checkin_skip_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkin_skip_events ENABLE ROW LEVEL SECURITY;

--
-- Name: checkin_tag_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checkin_tag_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: content_relevance_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_relevance_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_ritual_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_ritual_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: detected_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detected_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: dialogue_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dialogue_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: dialogue_interventions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dialogue_interventions ENABLE ROW LEVEL SECURITY;

--
-- Name: dialogue_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dialogue_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: dialogue_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dialogue_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: dialogue_skill_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dialogue_skill_events ENABLE ROW LEVEL SECURITY;

--
-- Name: energy_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.energy_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: mental_fitness_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mental_fitness_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_skill_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_skill_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_skill_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_skill_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: micro_intervention_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.micro_intervention_events ENABLE ROW LEVEL SECURITY;

--
-- Name: oura_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oura_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: oura_daily_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oura_daily_data ENABLE ROW LEVEL SECURITY;

--
-- Name: persona_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.persona_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: practice_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: sanctuary_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sanctuary_content ENABLE ROW LEVEL SECURITY;

--
-- Name: sanctuary_content_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sanctuary_content_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: sanctuary_content_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sanctuary_content_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: sanctuary_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sanctuary_events ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_debriefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_debriefs ENABLE ROW LEVEL SECURITY;

--
-- Name: scenario_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scenario_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: session_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: soft_skill_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.soft_skill_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: sub_skill_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sub_skill_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_occasion_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_occasion_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: user_engagements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_engagements ENABLE ROW LEVEL SECURITY;

--
-- Name: user_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;