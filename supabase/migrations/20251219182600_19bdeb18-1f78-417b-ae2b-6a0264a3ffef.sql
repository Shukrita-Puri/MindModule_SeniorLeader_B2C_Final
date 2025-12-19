-- Add service role policies for mental_fitness_scores, energy_snapshots, and content_relevance_feedback

-- mental_fitness_scores: Add service role policy
CREATE POLICY "Service role can manage all mental fitness scores"
ON public.mental_fitness_scores
FOR ALL
USING (auth.role() = 'service_role'::text);

-- energy_snapshots: Add service role policy
CREATE POLICY "Service role can manage all energy snapshots"
ON public.energy_snapshots
FOR ALL
USING (auth.role() = 'service_role'::text);

-- content_relevance_feedback: Add service role policy
CREATE POLICY "Service role can manage all content feedback"
ON public.content_relevance_feedback
FOR ALL
USING (auth.role() = 'service_role'::text);