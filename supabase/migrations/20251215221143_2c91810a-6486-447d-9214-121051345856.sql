-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their own ritual completions" ON daily_ritual_completions;
DROP POLICY IF EXISTS "Users can update their own ritual completions" ON daily_ritual_completions;
DROP POLICY IF EXISTS "Users can view their own ritual completions" ON daily_ritual_completions;

-- Create new policies that work with Auth0 (application-level user validation)
CREATE POLICY "Allow authenticated users to insert ritual completions"
ON daily_ritual_completions FOR INSERT
TO authenticated, anon
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update ritual completions"
ON daily_ritual_completions FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to select ritual completions"
ON daily_ritual_completions FOR SELECT
TO authenticated, anon
USING (true);