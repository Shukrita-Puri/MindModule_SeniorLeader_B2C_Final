UPDATE sanctuary_events SET event_type = 'completed' WHERE event_type = 'session_complete';
UPDATE sanctuary_events SET event_type = 'started' WHERE event_type = 'session_start';
UPDATE sanctuary_events SET event_type = 'paused' WHERE event_type = 'session_pause';
UPDATE sanctuary_events SET event_type = 'skipped' WHERE event_type = 'session_skip';