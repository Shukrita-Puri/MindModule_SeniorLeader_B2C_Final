
UPDATE profiles 
SET onboarding_completed_at = NULL, 
    subscription_status = NULL, 
    subscription_tier = 'none'
WHERE id = 'auth0|69c97b23403fe9d37cd992b8';

UPDATE onboarding_progress 
SET payment_at = NOW(), 
    completed_at = NULL, 
    context_connection_at = NULL,
    first_session_walkthrough_at = NULL
WHERE user_id = 'auth0|69c97b23403fe9d37cd992b8';
