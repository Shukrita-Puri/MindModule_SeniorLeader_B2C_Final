-- Add RLS policy for DEV_MODE user to allow direct database operations
-- This allows the 'dev-user-123' ID to perform CRUD operations on user_favorites

CREATE POLICY "Dev user can view favorites" 
ON public.user_favorites 
FOR SELECT 
USING (user_id = 'dev-user-123');

CREATE POLICY "Dev user can insert favorites" 
ON public.user_favorites 
FOR INSERT 
WITH CHECK (user_id = 'dev-user-123');

CREATE POLICY "Dev user can delete favorites" 
ON public.user_favorites 
FOR DELETE 
USING (user_id = 'dev-user-123');