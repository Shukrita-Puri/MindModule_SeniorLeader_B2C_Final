
-- Add DELETE policy for ritual restarts
CREATE POLICY "Allow authenticated users to delete ritual completions"
ON daily_ritual_completions FOR DELETE
TO authenticated, anon
USING (true);
