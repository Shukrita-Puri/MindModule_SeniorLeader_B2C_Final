-- Lock plan_ledger to service role only.
-- Users can still update completed_practice_ids etc., but cannot tamper with
-- the structured plan ledger that drives the next regeneration.

CREATE OR REPLACE FUNCTION public.daily_ritual_completions_ledger_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_ledger IS DISTINCT FROM OLD.plan_ledger THEN
    RAISE EXCEPTION 'plan_ledger is managed by the server and cannot be modified by users';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_ritual_completions_ledger_guard_trg ON public.daily_ritual_completions;
CREATE TRIGGER daily_ritual_completions_ledger_guard_trg
BEFORE UPDATE ON public.daily_ritual_completions
FOR EACH ROW
EXECUTE FUNCTION public.daily_ritual_completions_ledger_guard();

-- Also block direct INSERT of plan_ledger by non-service writers
CREATE OR REPLACE FUNCTION public.daily_ritual_completions_ledger_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Strip any client-provided ledger on insert
  NEW.plan_ledger := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_ritual_completions_ledger_insert_guard_trg ON public.daily_ritual_completions;
CREATE TRIGGER daily_ritual_completions_ledger_insert_guard_trg
BEFORE INSERT ON public.daily_ritual_completions
FOR EACH ROW
EXECUTE FUNCTION public.daily_ritual_completions_ledger_insert_guard();