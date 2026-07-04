// Local subset of build-executive-home-cards/scheduler.ts.
// Duplicated intentionally: the edge function bundler does not follow imports
// across sibling function directories.

export interface ExecutiveHomeWindowConfig {
  morning: string;
  afternoon: string;
  evening: string;
}

export interface ExecutiveHomeCronConfig {
  jobKey: string;
  jobName: string;
  functionName: string;
  enabled: boolean;
  scheduleMode: "dispatcher";
  cronExpression: string | null;
  dispatcherIntervalMinutes: number;
  timezoneMode: "user_timezone";
  maxUsersPerRun: number;
  retryAttempts: number;
  retryDelaySeconds: number;
  configJson: {
    windows: ExecutiveHomeWindowConfig;
    allowedDays: string[];
    runOnWeekends: boolean;
    respectTravelTimezone: boolean;
    skipIfAlreadyBuilt: boolean;
    buildSequence: string[];
    mode: "scheduled";
    dryRun?: boolean;
  };
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DEFAULT_WINDOWS: ExecutiveHomeWindowConfig = {
  morning: "05:00",
  afternoon: "12:00",
  evening: "18:00",
};

export function defaultExecutiveHomeCronConfig(): ExecutiveHomeCronConfig {
  return {
    jobKey: "executive_home_cards",
    jobName: "Executive Home Cards",
    functionName: "build-executive-home-cards",
    enabled: true,
    scheduleMode: "dispatcher",
    cronExpression: null,
    dispatcherIntervalMinutes: 5,
    timezoneMode: "user_timezone",
    maxUsersPerRun: 100,
    retryAttempts: 2,
    retryDelaySeconds: 30,
    configJson: {
      windows: DEFAULT_WINDOWS,
      allowedDays: [...DAY_KEYS],
      runOnWeekends: true,
      respectTravelTimezone: true,
      skipIfAlreadyBuilt: true,
      buildSequence: ["mrs", "brief", "plan"],
      mode: "scheduled",
      dryRun: false,
    },
  };
}

export function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function validateWindowConfig(windows: ExecutiveHomeWindowConfig): string[] {
  const errors: string[] = [];
  const morning = parseClock(windows.morning);
  const afternoon = parseClock(windows.afternoon);
  const evening = parseClock(windows.evening);
  if (morning === null) errors.push("Morning time must be HH:mm.");
  if (afternoon === null) errors.push("Afternoon time must be HH:mm.");
  if (evening === null) errors.push("Evening time must be HH:mm.");
  if (errors.length > 0) return errors;
  if (!(morning! < afternoon! && afternoon! < evening!)) {
    errors.push("Morning, afternoon, and evening must be strictly increasing and non-overlapping.");
  }
  return errors;
}

export function mergeExecutiveHomeCronConfig(
  raw: Partial<ExecutiveHomeCronConfig & { config_json?: Record<string, unknown> }> | null | undefined,
): ExecutiveHomeCronConfig {
  const base = defaultExecutiveHomeCronConfig();
  const rawJson = (raw?.config_json ?? (raw as Record<string, unknown> | undefined)?.configJson ?? {}) as Record<string, unknown>;
  const rawWindows = (rawJson.windows ?? {}) as Partial<ExecutiveHomeWindowConfig>;
  const rr = raw as Record<string, unknown> | undefined;
  return {
    jobKey: typeof rr?.jobKey === "string" ? rr.jobKey as string : typeof rr?.job_key === "string" ? rr.job_key as string : base.jobKey,
    jobName: typeof rr?.jobName === "string" ? rr.jobName as string : typeof rr?.job_name === "string" ? rr.job_name as string : base.jobName,
    functionName: typeof rr?.functionName === "string" ? rr.functionName as string : typeof rr?.function_name === "string" ? rr.function_name as string : base.functionName,
    enabled: typeof rr?.enabled === "boolean" ? rr.enabled as boolean : base.enabled,
    scheduleMode: "dispatcher",
    cronExpression: typeof rr?.cronExpression === "string" ? rr.cronExpression as string : typeof rr?.cron_expression === "string" ? rr.cron_expression as string : base.cronExpression,
    dispatcherIntervalMinutes: typeof rr?.dispatcherIntervalMinutes === "number" ? rr.dispatcherIntervalMinutes as number : typeof rr?.dispatcher_interval_minutes === "number" ? rr.dispatcher_interval_minutes as number : base.dispatcherIntervalMinutes,
    timezoneMode: "user_timezone",
    maxUsersPerRun: typeof rr?.maxUsersPerRun === "number" ? rr.maxUsersPerRun as number : typeof rr?.max_users_per_run === "number" ? rr.max_users_per_run as number : base.maxUsersPerRun,
    retryAttempts: typeof rr?.retryAttempts === "number" ? rr.retryAttempts as number : typeof rr?.retry_attempts === "number" ? rr.retry_attempts as number : base.retryAttempts,
    retryDelaySeconds: typeof rr?.retryDelaySeconds === "number" ? rr.retryDelaySeconds as number : typeof rr?.retry_delay_seconds === "number" ? rr.retry_delay_seconds as number : base.retryDelaySeconds,
    configJson: {
      windows: {
        morning: typeof rawWindows.morning === "string" ? rawWindows.morning : base.configJson.windows.morning,
        afternoon: typeof rawWindows.afternoon === "string" ? rawWindows.afternoon : base.configJson.windows.afternoon,
        evening: typeof rawWindows.evening === "string" ? rawWindows.evening : base.configJson.windows.evening,
      },
      allowedDays: Array.isArray(rawJson.allowedDays)
        ? (rawJson.allowedDays as unknown[]).filter((day): day is string => typeof day === "string")
        : base.configJson.allowedDays,
      runOnWeekends: typeof rawJson.runOnWeekends === "boolean" ? rawJson.runOnWeekends as boolean : base.configJson.runOnWeekends,
      respectTravelTimezone: typeof rawJson.respectTravelTimezone === "boolean" ? rawJson.respectTravelTimezone as boolean : base.configJson.respectTravelTimezone,
      skipIfAlreadyBuilt: typeof rawJson.skipIfAlreadyBuilt === "boolean" ? rawJson.skipIfAlreadyBuilt as boolean : base.configJson.skipIfAlreadyBuilt,
      buildSequence: Array.isArray(rawJson.buildSequence)
        ? (rawJson.buildSequence as unknown[]).filter((item): item is string => typeof item === "string")
        : base.configJson.buildSequence,
      mode: "scheduled",
      dryRun: typeof rawJson.dryRun === "boolean" ? rawJson.dryRun as boolean : Boolean(base.configJson.dryRun),
    },
  };
}

export function nextExpectedRunAt(now: Date, intervalMinutes: number): string {
  const ms = Math.max(1, intervalMinutes) * 60_000;
  const next = new Date(Math.ceil(now.getTime() / ms) * ms);
  return next.toISOString();
}