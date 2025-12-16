-- Update Self Mastery badge thresholds
UPDATE achievement_definitions SET threshold_points = 25 WHERE id = 'awareness-initiate';
UPDATE achievement_definitions SET threshold_points = 60 WHERE id = 'emotional-navigator';
UPDATE achievement_definitions SET threshold_points = 150 WHERE id = 'regulation-adept';
UPDATE achievement_definitions SET threshold_points = 300 WHERE id = 'self-mastery-badge';
UPDATE achievement_definitions SET threshold_points = 500 WHERE id = 'self-mastery-certificate';

-- Update Social Mastery badge thresholds
UPDATE achievement_definitions SET threshold_points = 25 WHERE id = 'connection-initiate';
UPDATE achievement_definitions SET threshold_points = 60 WHERE id = 'empathy-practitioner';
UPDATE achievement_definitions SET threshold_points = 150 WHERE id = 'influence-adept';
UPDATE achievement_definitions SET threshold_points = 300 WHERE id = 'social-mastery-badge';
UPDATE achievement_definitions SET threshold_points = 500 WHERE id = 'social-mastery-certificate';