-- Update personas to be generic role-based (no names)
UPDATE persona_definitions 
SET name = 'Senior Admissions Interviewer',
    role = 'University Admissions Officer',
    background_context = 'Experienced interviewer who has conducted hundreds of university admissions interviews. Evaluates candidates on academic potential, intellectual curiosity, and personal qualities.',
    communication_style = 'Professional and thorough'
WHERE id = 'oxbridge-interviewer';

UPDATE persona_definitions 
SET name = 'Successful Graduate',
    role = 'Recent University Alumnus',
    background_context = 'Recently graduated from a top university. Went through the admissions process and can share authentic insights about what worked.',
    communication_style = 'Friendly and relatable'
WHERE id = 'oxbridge-student';

-- Add more generic personas for other scenarios
INSERT INTO persona_definitions (id, name, role, communication_style, background_context, personality_traits, challenge_level, is_active)
VALUES 
  ('academic-teacher', 'Subject Teacher', 'Academic Instructor', 'Encouraging but rigorous', 'Experienced teacher who challenges students to think deeply about their subject.', '["knowledgeable", "patient", "demanding"]', 6, true),
  ('debate-judge', 'Debate Adjudicator', 'Competition Judge', 'Formal and evaluative', 'Experienced debate judge who evaluates argument structure, evidence, and delivery.', '["analytical", "fair", "precise"]', 7, true),
  ('careers-advisor', 'Careers Counselor', 'School Careers Advisor', 'Supportive and practical', 'Helps students explore options and prepare for applications and interviews.', '["supportive", "practical", "encouraging"]', 4, true),
  ('peer-student', 'Fellow Student', 'Classmate', 'Casual and authentic', 'A peer who can provide a student perspective on social and academic situations.', '["relatable", "honest", "casual"]', 3, true),
  ('head-teacher', 'School Principal', 'Head of School', 'Authoritative but fair', 'School leader who holds high standards and expects maturity from students.', '["authoritative", "fair", "experienced"]', 8, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  communication_style = EXCLUDED.communication_style,
  background_context = EXCLUDED.background_context,
  personality_traits = EXCLUDED.personality_traits,
  challenge_level = EXCLUDED.challenge_level;