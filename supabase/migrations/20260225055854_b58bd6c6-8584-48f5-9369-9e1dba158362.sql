-- Add unique constraint for device token upsert
ALTER TABLE public.notification_device_tokens 
ADD CONSTRAINT notification_device_tokens_user_device_unique 
UNIQUE (user_id, device_token);