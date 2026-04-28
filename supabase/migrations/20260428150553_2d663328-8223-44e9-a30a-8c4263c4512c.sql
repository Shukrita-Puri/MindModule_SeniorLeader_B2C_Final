-- Backfill tierLabel into existing brief_snapshots.signal_pills entries.
-- Uses a fixed mapping per pill key + tier. The writer was just updated to
-- emit the same labels going forward.

ALTER TABLE public.brief_snapshots DISABLE TRIGGER brief_snapshots_user_update_guard_trg;

WITH labeled AS (
  SELECT
    bs.id,
    jsonb_agg(
      CASE
        WHEN pill ? 'tierLabel' THEN pill
        ELSE pill || jsonb_build_object(
          'tierLabel',
          CASE pill->>'key'
            WHEN 'decision_readiness' THEN
              CASE pill->>'tier'
                WHEN 'green' THEN 'Mind Sharp'
                WHEN 'amber' THEN 'Mind Mixed'
                WHEN 'red'   THEN 'Mind Foggy'
                ELSE 'Mind Unread'
              END
            WHEN 'physical_reserves' THEN
              CASE pill->>'tier'
                WHEN 'green' THEN 'Body Steady'
                WHEN 'amber' THEN 'Body Strained'
                WHEN 'red'   THEN 'Body Depleted'
                ELSE 'Body Unread'
              END
            WHEN 'resilience_capacity' THEN
              CASE pill->>'tier'
                WHEN 'green' THEN 'Reserve Strong'
                WHEN 'amber' THEN 'Reserve Thin'
                WHEN 'red'   THEN 'Reserve Spent'
                ELSE 'Reserve Unread'
              END
            ELSE NULL
          END
        )
      END
      ORDER BY ord
    ) AS new_pills
  FROM public.brief_snapshots bs,
       LATERAL jsonb_array_elements(bs.signal_pills) WITH ORDINALITY AS t(pill, ord)
  WHERE bs.signal_pills IS NOT NULL
    AND jsonb_typeof(bs.signal_pills) = 'array'
  GROUP BY bs.id
)
UPDATE public.brief_snapshots bs
SET signal_pills = labeled.new_pills
FROM labeled
WHERE bs.id = labeled.id
  AND bs.signal_pills IS DISTINCT FROM labeled.new_pills;

ALTER TABLE public.brief_snapshots ENABLE TRIGGER brief_snapshots_user_update_guard_trg;