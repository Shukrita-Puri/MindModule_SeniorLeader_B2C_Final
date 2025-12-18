-- Add conversation_dynamics column to scenario_definitions
ALTER TABLE scenario_definitions 
ADD COLUMN IF NOT EXISTS conversation_dynamics JSONB DEFAULT '{"initiative": "mutual", "style": "balanced"}'::jsonb;

-- Update existing scenarios with appropriate conversation_dynamics
UPDATE scenario_definitions SET conversation_dynamics = '{"initiative": "persona_primary", "style": "evaluative", "user_can_question": true, "intensity": "high"}'::jsonb WHERE id = 'oxbridge_interview';
UPDATE scenario_definitions SET conversation_dynamics = '{"initiative": "user_primary", "style": "conversational", "user_can_question": true, "intensity": "moderate"}'::jsonb WHERE id = 'alumni_networking';

-- Insert missing scenarios with conversation_dynamics
INSERT INTO scenario_definitions (id, category, title, description, context_type, difficulty_level, scenario_context, target_meta_skills, conversation_dynamics, is_active)
VALUES
  -- Academic Confidence scenarios
  ('scholarship_interview', 'academic_confidence', 'Scholarship Interview', 'Practice for a scholarship application interview where you need to demonstrate worthiness and articulate your goals.', 'interview', 'intermediate', '{"interview_type": "scholarship", "evaluation_focus": ["motivation", "achievement", "potential"]}'::jsonb, '["emotional_intelligence", "communication_excellence"]'::jsonb, '{"initiative": "persona_primary", "style": "evaluative", "user_can_question": true, "intensity": "high"}'::jsonb, true),
  
  ('apprenticeship_interview', 'academic_confidence', 'Apprenticeship Interview', 'Practice for an apprenticeship program interview demonstrating practical skills and career motivation.', 'interview', 'intermediate', '{"interview_type": "professional", "evaluation_focus": ["motivation", "skills", "fit"]}'::jsonb, '["emotional_intelligence", "communication_excellence"]'::jsonb, '{"initiative": "persona_primary", "style": "evaluative", "user_can_question": true, "intensity": "moderate"}'::jsonb, true),
  
  ('model_un_speech', 'academic_confidence', 'Model UN Speech', 'Practice presenting a position and handling questions in a Model UN debate setting.', 'presentation', 'advanced', '{"context_type": "debate", "evaluation_focus": ["argumentation", "composure", "knowledge"]}'::jsonb, '["communication_excellence", "self_regulation"]'::jsonb, '{"initiative": "user_initiates", "style": "presentation_then_qa", "user_can_question": false, "intensity": "high"}'::jsonb, true),
  
  ('debate_tournament', 'academic_confidence', 'Debate Tournament', 'Practice debating skills with challenging questions and counterarguments.', 'debate', 'advanced', '{"context_type": "competitive", "evaluation_focus": ["argumentation", "rebuttal", "composure"]}'::jsonb, '["communication_excellence", "learning_agility"]'::jsonb, '{"initiative": "mutual", "style": "challenging", "user_can_question": true, "intensity": "very_high"}'::jsonb, true),
  
  ('academic_presentation', 'academic_confidence', 'Presenting in Class', 'Practice presenting academic work and handling questions from teachers and classmates.', 'presentation', 'beginner', '{"context_type": "classroom", "evaluation_focus": ["clarity", "knowledge", "confidence"]}'::jsonb, '["communication_excellence", "emotional_resilience"]'::jsonb, '{"initiative": "user_initiates", "style": "presentation_then_qa", "user_can_question": false, "intensity": "moderate"}'::jsonb, true),

  -- Social Navigation scenarios  
  ('social_dynamics', 'social_navigation', 'Boarding House Dynamics', 'Navigate complex social situations in a boarding house environment.', 'social', 'intermediate', '{"context_type": "peer_dynamics", "evaluation_focus": ["diplomacy", "boundaries", "rapport"]}'::jsonb, '["social_intelligence", "emotional_intelligence"]'::jsonb, '{"initiative": "mutual", "style": "collaborative", "user_can_question": true, "intensity": "moderate"}'::jsonb, true),

  -- Growth & Opportunity scenarios
  ('head_student_interview', 'growth_opportunity', 'Head Student Interview', 'Interview for Head Boy/Girl position demonstrating leadership qualities.', 'interview', 'advanced', '{"interview_type": "leadership", "evaluation_focus": ["leadership", "vision", "character"]}'::jsonb, '["communication_excellence", "self_regulation"]'::jsonb, '{"initiative": "persona_primary", "style": "evaluative", "user_can_question": true, "intensity": "high"}'::jsonb, true),
  
  ('gap_year_planning', 'growth_opportunity', 'Gap Year Planning', 'Discuss and justify gap year plans with an advisor or parent figure.', 'advisory', 'beginner', '{"context_type": "planning", "evaluation_focus": ["reasoning", "maturity", "goals"]}'::jsonb, '["self_regulation", "communication_excellence"]'::jsonb, '{"initiative": "mutual", "style": "advisory", "user_can_question": true, "intensity": "low"}'::jsonb, true),
  
  ('leadership_speech', 'growth_opportunity', 'Sports Captain Address', 'Address your team as a captain, motivating and leading them.', 'presentation', 'intermediate', '{"context_type": "leadership", "evaluation_focus": ["inspiration", "authority", "connection"]}'::jsonb, '["communication_excellence", "emotional_intelligence"]'::jsonb, '{"initiative": "user_initiates", "style": "presentation", "user_can_question": false, "intensity": "moderate"}'::jsonb, true),
  
  ('leadership_role', 'growth_opportunity', 'Prefect Responsibilities', 'Discuss and navigate prefect duties with teachers and peers.', 'discussion', 'intermediate', '{"context_type": "responsibility", "evaluation_focus": ["judgment", "diplomacy", "authority"]}'::jsonb, '["social_intelligence", "self_regulation"]'::jsonb, '{"initiative": "mutual", "style": "collaborative", "user_can_question": true, "intensity": "moderate"}'::jsonb, true)

ON CONFLICT (id) DO UPDATE SET
  conversation_dynamics = EXCLUDED.conversation_dynamics,
  description = EXCLUDED.description,
  scenario_context = EXCLUDED.scenario_context,
  target_meta_skills = EXCLUDED.target_meta_skills;