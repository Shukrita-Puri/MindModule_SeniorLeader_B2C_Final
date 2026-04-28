ALTER TABLE public.brief_snapshots DISABLE TRIGGER brief_snapshots_user_update_guard_trg;

WITH s AS (
  SELECT id, payload_json->'signals' AS sig
  FROM brief_snapshots
  WHERE signal_pills IS NULL AND payload_json ? 'signals'
),
parsed AS (
  SELECT
    id,
    NULLIF(sig->>'checkInOutcome','') AS outcome,
    NULLIF(sig->>'clarityLevel','')::int AS clarity,
    NULLIF(sig->>'confidenceLevel','')::int AS confidence,
    NULLIF(sig->>'mentalSharpnessLevel','')::int AS sharpness,
    NULLIF(sig->>'hrvDeviation','')::numeric AS hrv_dev,
    NULLIF(sig->>'rhrDeviation','')::numeric AS rhr_dev,
    NULLIF(sig->>'sleepDeviation','')::numeric AS sleep_dev,
    NULLIF(sig->>'wearableTrend7d','') AS wearable_trend,
    NULLIF(sig->>'scoreTrajectory7d','') AS score_traj,
    NULLIF(sig->>'consecutiveLowConfidence','')::int AS consec_conf,
    NULLIF(sig->>'consecutiveLowClarity','')::int AS consec_clar
  FROM s
),
tiers AS (
  SELECT
    id,
    GREATEST(
      CASE WHEN hrv_dev IS NOT NULL
        THEN CASE WHEN hrv_dev <= -20 THEN 3 WHEN hrv_dev < -8 THEN 2 ELSE 1 END
        ELSE 0 END,
      CASE WHEN sharpness IS NULL THEN 0
           WHEN sharpness <= 2 THEN 3 WHEN sharpness = 3 THEN 2 ELSE 1 END,
      CASE WHEN clarity IS NULL THEN 0
           WHEN clarity <= 2 THEN 3 WHEN clarity = 3 THEN 2 ELSE 1 END,
      CASE WHEN outcome = 'scattered' THEN 3
           WHEN outcome IN ('focused','thriving') THEN 1
           ELSE 0 END
    ) AS cog_rank,
    GREATEST(
      CASE WHEN sleep_dev IS NOT NULL
        THEN CASE WHEN sleep_dev < -15 THEN 3 WHEN sleep_dev < -8 THEN 2 ELSE 1 END
        ELSE 0 END,
      CASE WHEN rhr_dev IS NOT NULL
        THEN CASE WHEN rhr_dev > 20 THEN 3 WHEN rhr_dev > 10 THEN 2 ELSE 1 END
        ELSE 0 END
    ) AS phys_rank,
    GREATEST(
      CASE WHEN outcome IN ('overwhelmed','drained') THEN 3
           WHEN outcome IN ('anxious','frustrated') THEN 2
           WHEN outcome IN ('steady','calm','energised','thriving') THEN 1
           ELSE 0 END,
      CASE WHEN hrv_dev IS NOT NULL
        THEN CASE WHEN hrv_dev <= -25 THEN 3 WHEN hrv_dev < -15 THEN 2 ELSE 1 END
        ELSE 0 END,
      CASE WHEN confidence IS NULL THEN 0
           WHEN confidence <= 2 THEN 3 WHEN confidence = 3 THEN 2 ELSE 1 END
    ) AS res_rank,
    outcome, clarity, confidence, sharpness, hrv_dev, rhr_dev, sleep_dev,
    wearable_trend, score_traj, consec_conf, consec_clar
  FROM parsed
),
tier_text AS (
  SELECT
    id, outcome, clarity, confidence, sharpness,
    hrv_dev, rhr_dev, sleep_dev,
    wearable_trend, score_traj, consec_conf, consec_clar,
    CASE cog_rank WHEN 0 THEN 'neutral' WHEN 1 THEN 'green' WHEN 2 THEN 'amber' ELSE 'red' END AS cog_tier,
    CASE phys_rank WHEN 0 THEN 'neutral' WHEN 1 THEN 'green' WHEN 2 THEN 'amber' ELSE 'red' END AS phys_tier,
    CASE res_rank WHEN 0 THEN 'neutral' WHEN 1 THEN 'green' WHEN 2 THEN 'amber' ELSE 'red' END AS res_tier
  FROM tiers
)
UPDATE brief_snapshots b
SET
  signal_pills = jsonb_build_array(
    jsonb_build_object(
      'key','decision_readiness','label','Decision Readiness','tier', t.cog_tier,'backfilled', true,
      'contributors', jsonb_build_object(
        'hrvDeviation', t.hrv_dev,'clarityLevel', t.clarity,
        'mentalSharpnessLevel', t.sharpness,'checkInOutcome', t.outcome)
    ),
    jsonb_build_object(
      'key','physical_reserves','label','Physical Reserves','tier', t.phys_tier,'backfilled', true,
      'contributors', jsonb_build_object('sleepDeviation', t.sleep_dev,'rhrDeviation', t.rhr_dev)
    ),
    jsonb_build_object(
      'key','resilience_capacity','label','Resilience Capacity','tier', t.res_tier,'backfilled', true,
      'contributors', jsonb_build_object(
        'checkInOutcome', t.outcome,'hrvDeviation', t.hrv_dev,'confidenceLevel', t.confidence)
    )
  ),
  checkin_snapshot = COALESCE(b.checkin_snapshot, jsonb_build_object(
    'checkInOutcome', t.outcome,'clarityLevel', t.clarity,
    'confidenceLevel', t.confidence,'mentalSharpnessLevel', t.sharpness,
    'consecutiveLowConfidence', t.consec_conf,'consecutiveLowClarity', t.consec_clar,
    'backfilled', true)),
  wearable_snapshot = COALESCE(b.wearable_snapshot, CASE
    WHEN t.hrv_dev IS NULL AND t.rhr_dev IS NULL AND t.sleep_dev IS NULL THEN NULL
    ELSE jsonb_build_object(
      'hrvDeviation', t.hrv_dev,'rhrDeviation', t.rhr_dev,'sleepDeviation', t.sleep_dev,
      'wearableTrend7d', t.wearable_trend,'scoreTrajectory7d', t.score_traj,'backfilled', true)
  END)
FROM tier_text t
WHERE b.id = t.id;

ALTER TABLE public.brief_snapshots ENABLE TRIGGER brief_snapshots_user_update_guard_trg;