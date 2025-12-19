-- Add service role policies for user_favorites, saved_debriefs, and user_preferences

-- user_favorites: Add service role policy
CREATE POLICY "Service role can manage all user favorites"
ON public.user_favorites
FOR ALL
USING (auth.role() = 'service_role'::text);

-- saved_debriefs: Add service role policy
CREATE POLICY "Service role can manage all saved debriefs"
ON public.saved_debriefs
FOR ALL
USING (auth.role() = 'service_role'::text);

-- user_preferences: Add service role policy
CREATE POLICY "Service role can manage all user preferences"
ON public.user_preferences
FOR ALL
USING (auth.role() = 'service_role'::text);