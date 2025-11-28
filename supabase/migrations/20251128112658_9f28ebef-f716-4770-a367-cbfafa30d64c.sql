-- =====================================================
-- COMPREHENSIVE CONTENT TAGGING SYSTEM MIGRATION
-- =====================================================

-- 1. CREATE TAG DEFINITION TABLES
-- =====================================================

-- Meta Skill Definitions (6 skills in 2 clusters)
CREATE TABLE IF NOT EXISTS meta_skill_definitions (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  cluster TEXT NOT NULL CHECK (cluster IN ('self_mastery', 'social_mastery')),
  core_function TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0
);

-- Sub-Skill Definitions (under each Meta Skill)
CREATE TABLE IF NOT EXISTS sub_skill_definitions (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  parent_meta_skill TEXT REFERENCES meta_skill_definitions(key) ON DELETE CASCADE,
  description TEXT
);

-- Soft Skill Definitions (behavioral manifestations)
CREATE TABLE IF NOT EXISTS soft_skill_definitions (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  related_meta_skills TEXT[],
  description TEXT
);

-- Usage Occasion Definitions (for packs/interventions)
CREATE TABLE IF NOT EXISTS usage_occasion_definitions (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT CHECK (category IN ('timing', 'event', 'context', 'energy_state')),
  description TEXT
);

-- Check-in Tag Definitions
CREATE TABLE IF NOT EXISTS checkin_tag_definitions (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  mapped_outcome TEXT CHECK (mapped_outcome IN ('pause', 'power-up', 'presence', 'steady', 'focused', 'ready')),
  energy_balance_min INTEGER,
  energy_balance_max INTEGER,
  description TEXT
);

-- 2. ADD NEW COLUMNS TO SANCTUARY_CONTENT_METADATA
-- =====================================================

ALTER TABLE sanctuary_content_metadata 
  ADD COLUMN IF NOT EXISTS meta_skills JSONB DEFAULT '{"primary": [], "secondary": []}'::jsonb;

ALTER TABLE sanctuary_content_metadata 
  ADD COLUMN IF NOT EXISTS sub_skills JSONB DEFAULT '{"primary": [], "secondary": []}'::jsonb;

ALTER TABLE sanctuary_content_metadata 
  ADD COLUMN IF NOT EXISTS soft_skills TEXT[] DEFAULT '{}';

ALTER TABLE sanctuary_content_metadata 
  ADD COLUMN IF NOT EXISTS usage_occasions TEXT[] DEFAULT '{}';

ALTER TABLE sanctuary_content_metadata 
  ADD COLUMN IF NOT EXISTS checkin_tags JSONB DEFAULT '{"primary": [], "secondary": []}'::jsonb;

ALTER TABLE sanctuary_content_metadata 
  ADD COLUMN IF NOT EXISTS mastery_category JSONB DEFAULT '{"primary": null, "secondary": []}'::jsonb;

-- 3. POPULATE META SKILL DEFINITIONS
-- =====================================================

INSERT INTO meta_skill_definitions (key, display_name, cluster, core_function, display_order) VALUES
  ('emotional_intelligence', 'Emotional Intelligence', 'self_mastery', 'Managing the Inner World — cultivating awareness, resilience, and self-direction', 1),
  ('self_regulation', 'Self-Regulation', 'self_mastery', 'Managing the Inner World — cultivating awareness, resilience, and self-direction', 2),
  ('learning_agility', 'Learning Agility', 'self_mastery', 'Managing the Inner World — cultivating awareness, resilience, and self-direction', 3),
  ('emotional_resilience', 'Emotional Resilience', 'self_mastery', 'Managing the Inner World — cultivating awareness, resilience, and self-direction', 4),
  ('social_intelligence', 'Social Intelligence', 'social_mastery', 'Navigating Relationships — understanding and influencing others', 5),
  ('performance_intelligence', 'Performance Intelligence', 'social_mastery', 'Navigating Relationships — understanding and influencing others', 6)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  cluster = EXCLUDED.cluster,
  core_function = EXCLUDED.core_function,
  display_order = EXCLUDED.display_order;

-- 4. POPULATE SUB-SKILL DEFINITIONS
-- =====================================================

INSERT INTO sub_skill_definitions (key, display_name, parent_meta_skill) VALUES
  -- Emotional Intelligence sub-skills
  ('emotional_regulation', 'Emotional Regulation', 'emotional_intelligence'),
  ('self_awareness', 'Self-Awareness', 'emotional_intelligence'),
  ('mindfulness', 'Mindfulness', 'emotional_intelligence'),
  ('emotional_mastery', 'Emotional Mastery', 'emotional_intelligence'),
  ('self_compassion', 'Self-Compassion', 'emotional_intelligence'),
  
  -- Self-Regulation sub-skills
  ('goal_setting', 'Goal Setting', 'self_regulation'),
  ('purpose_alignment', 'Purpose Alignment', 'self_regulation'),
  ('identity_alignment', 'Identity Alignment', 'self_regulation'),
  ('focus', 'Focus', 'self_regulation'),
  ('discipline', 'Discipline', 'self_regulation'),
  
  -- Learning Agility sub-skills
  ('self_directed_learning', 'Self-Directed Learning', 'learning_agility'),
  ('reflective_thinking', 'Reflective Thinking', 'learning_agility'),
  ('unlearning', 'Unlearning', 'learning_agility'),
  ('adaptability_to_feedback', 'Adaptability to Feedback', 'learning_agility'),
  ('continuous_improvement', 'Continuous Improvement', 'learning_agility'),
  
  -- Emotional Resilience sub-skills
  ('stress_management', 'Stress Management', 'emotional_resilience'),
  ('perseverance', 'Perseverance', 'emotional_resilience'),
  ('optimism', 'Optimism', 'emotional_resilience'),
  
  -- Social Intelligence sub-skills
  ('perspective_taking', 'Perspective-Taking', 'social_intelligence'),
  ('cultural_awareness', 'Cultural Awareness', 'social_intelligence'),
  ('value_clarification', 'Value Clarification', 'social_intelligence'),
  ('moral_reasoning', 'Moral Reasoning', 'social_intelligence'),
  ('ethical_judgment', 'Ethical Judgment', 'social_intelligence'),
  
  -- Performance Intelligence sub-skills
  ('pre_performance_priming', 'Pre-Performance Priming', 'performance_intelligence'),
  ('mental_switching', 'Mental Switching', 'performance_intelligence'),
  ('focus_on_command', 'Focus on Command', 'performance_intelligence'),
  ('cognitive_sharpening', 'Cognitive Sharpening', 'performance_intelligence'),
  ('high_pressure_management', 'High Pressure Arousal Management', 'performance_intelligence')
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  parent_meta_skill = EXCLUDED.parent_meta_skill;

-- 5. POPULATE SOFT SKILL DEFINITIONS
-- =====================================================

INSERT INTO soft_skill_definitions (key, display_name, related_meta_skills) VALUES
  ('empathy', 'Empathy', ARRAY['emotional_intelligence', 'social_intelligence']),
  ('active_listening', 'Active Listening', ARRAY['emotional_intelligence', 'social_intelligence']),
  ('compassion', 'Compassion', ARRAY['emotional_intelligence', 'emotional_resilience']),
  ('self_motivation', 'Self-Motivation', ARRAY['self_regulation']),
  ('integrity', 'Integrity', ARRAY['self_regulation']),
  ('growth_mindset', 'Growth Mindset', ARRAY['self_regulation', 'learning_agility']),
  ('curiosity', 'Curiosity', ARRAY['learning_agility']),
  ('openness_to_change', 'Openness to Change', ARRAY['learning_agility']),
  ('positivity', 'Positivity', ARRAY['emotional_resilience']),
  ('self_confidence', 'Self-Confidence', ARRAY['emotional_resilience', 'performance_intelligence']),
  ('trust_building', 'Trust-Building', ARRAY['social_intelligence']),
  ('intercultural_sensitivity', 'Intercultural Sensitivity', ARRAY['social_intelligence']),
  ('communication', 'Communication', ARRAY['social_intelligence']),
  ('presence', 'Presence', ARRAY['performance_intelligence', 'self_regulation']),
  ('assertiveness', 'Assertiveness', ARRAY['performance_intelligence', 'social_intelligence']),
  ('composure', 'Composure', ARRAY['performance_intelligence', 'emotional_resilience']),
  ('boldness', 'Boldness', ARRAY['performance_intelligence', 'emotional_resilience']),
  ('determination', 'Determination', ARRAY['self_regulation', 'emotional_resilience']),
  ('confidence', 'Confidence', ARRAY['performance_intelligence', 'emotional_resilience']),
  ('courage', 'Courage', ARRAY['emotional_resilience', 'performance_intelligence'])
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  related_meta_skills = EXCLUDED.related_meta_skills;

-- 6. POPULATE USAGE OCCASION DEFINITIONS
-- =====================================================

INSERT INTO usage_occasion_definitions (key, display_name, category) VALUES
  -- Timing-based occasions
  ('morning_activation', 'Morning Activation', 'timing'),
  ('afternoon_slump', 'Afternoon Slump', 'timing'),
  ('evening_winddown', 'Evening Wind-Down', 'timing'),
  ('rapid_recharge', 'Rapid Recharge', 'timing'),
  
  -- Event-based occasions
  ('pre_exam', 'Pre-Exam', 'event'),
  ('pre_meeting', 'Pre-Meeting', 'event'),
  ('pre_presentation', 'Pre-Presentation', 'event'),
  ('pre_negotiation', 'Pre-Negotiation', 'event'),
  ('pre_interview', 'Pre-Interview', 'event'),
  ('pre_performance', 'Pre-Performance', 'event'),
  ('pre_social_event', 'Pre-Social Event', 'event'),
  
  -- Context-based occasions
  ('high_pressure_event', 'High Pressure Event', 'context'),
  ('decision_making', 'Decision Making', 'context'),
  ('creative_focus', 'Creative Focus', 'context'),
  ('stress_release', 'Stress Release', 'context'),
  ('mind_body_alignment', 'Mind-Body Alignment', 'context'),
  ('overcoming_procrastination', 'Overcoming Procrastination', 'context'),
  ('focus_and_readiness', 'Focus and Readiness', 'context'),
  ('recharging_energy', 'Recharging Energy', 'context'),
  ('energy_synchronisation', 'Energy Synchronisation', 'context'),
  ('overcoming_mental_lulls', 'Overcoming Mental Lulls', 'context'),
  
  -- Energy state occasions
  ('performance_preparation', 'Performance Preparation', 'energy_state'),
  ('cognitive_clarity', 'Cognitive Clarity', 'energy_state'),
  ('emotional_regulation', 'Emotional Regulation', 'energy_state')
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category;

-- 7. POPULATE CHECK-IN TAG DEFINITIONS
-- =====================================================

INSERT INTO checkin_tag_definitions (key, display_name, mapped_outcome, energy_balance_min, energy_balance_max) VALUES
  ('stressed_overwhelmed', 'Stressed or Overwhelmed', 'pause', 0, 40),
  ('drained_tired', 'Drained or Tired', 'power-up', 0, 40),
  ('scattered_unfocused', 'Scattered or Unfocused', 'presence', 40, 60),
  ('steady_balanced', 'Steady and Balanced', 'steady', 60, 80),
  ('focused_energised', 'Focused and Energized', 'focused', 70, 90),
  ('motivated_ready', 'Motivated and Ready', 'ready', 80, 100),
  ('on_edge', 'On Edge', 'pause', 20, 50),
  ('low_drive', 'Low Drive', 'power-up', 10, 40)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  mapped_outcome = EXCLUDED.mapped_outcome,
  energy_balance_min = EXCLUDED.energy_balance_min,
  energy_balance_max = EXCLUDED.energy_balance_max;

-- 8. RLS POLICIES FOR TAG DEFINITION TABLES
-- =====================================================

-- Enable RLS
ALTER TABLE meta_skill_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_skill_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE soft_skill_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_occasion_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_tag_definitions ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view meta skills" ON meta_skill_definitions FOR SELECT USING (true);
CREATE POLICY "Anyone can view sub skills" ON sub_skill_definitions FOR SELECT USING (true);
CREATE POLICY "Anyone can view soft skills" ON soft_skill_definitions FOR SELECT USING (true);
CREATE POLICY "Anyone can view usage occasions" ON usage_occasion_definitions FOR SELECT USING (true);
CREATE POLICY "Anyone can view checkin tags" ON checkin_tag_definitions FOR SELECT USING (true);

-- Admin-only write access
CREATE POLICY "Only admins can modify meta skills" ON meta_skill_definitions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can modify sub skills" ON sub_skill_definitions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can modify soft skills" ON soft_skill_definitions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can modify usage occasions" ON usage_occasion_definitions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Only admins can modify checkin tags" ON checkin_tag_definitions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));