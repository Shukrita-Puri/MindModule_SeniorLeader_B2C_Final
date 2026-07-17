import { localParts } from "../_shared/effective-timezone.ts";

export type TimeWindow = "morning" | "afternoon" | "evening";

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
    /**
     * CONFIG-ONLY: labels the intended pipeline sequence for observability.
     * The MRS → Brief → Plan order is hard-coded in `buildForUser` inside
     * `index.ts`; changing this array in `admin_cron_job_configs` will NOT
     * reorder execution. If the sequence must change, change the code.
     * See mem://architecture/mastery-plan-server-side-derivation.
     *
     * NOTE: All three cards (MRS, Brief, Plan) are generated in EVERY
     * window — morning, afternoon, and evening — so context changes
     * across the day (calendar, physiology, check-in) can reshape each
     * card. Each window persists its own snapshot row; the UI resolves
     * current-window first and falls back to the latest ready row.
     */
    buildSequence: string[];
    mode: "scheduled";
    dryRun?: boolean;
  };
}

type RawExecutiveHomeCronConfig = Partial<ExecutiveHomeCronConfig> & {
  job_key?: string | null;
  job_name?: string | null;
  function_name?: string | null;
  cron_expression?: string | null;
  dispatcher_interval_minutes?: number | null;
  max_users_per_run?: number | null;
  retry_attempts?: number | null;
  retry_delay_seconds?: number | null;
  config_json?: Record<string, unknown> | null;
};

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

export function validateWindowConfig(
  windows: ExecutiveHomeWindowConfig,
): string[] {
  const errors: string[] = [];
  const morning = parseClock(windows.morning);
  const afternoon = parseClock(windows.afternoon);
  const evening = parseClock(windows.evening);

  if (morning === null) errors.push("Morning time must be HH:mm.");
  if (afternoon === null) errors.push("Afternoon time must be HH:mm.");
  if (evening === null) errors.push("Evening time must be HH:mm.");
  if (errors.length > 0) return errors;

  if (!(morning! < afternoon! && afternoon! < evening!)) {
    errors.push(
      "Morning, afternoon, and evening must be strictly increasing and non-overlapping.",
    );
  }
  return errors;
}

export function mergeExecutiveHomeCronConfig(
  raw: RawExecutiveHomeCronConfig | null | undefined,
): ExecutiveHomeCronConfig {
  const base = defaultExecutiveHomeCronConfig();
  const rawJson =
    (raw?.config_json ?? (raw as any)?.configJson ?? {}) as Record<
      string,
      unknown
    >;
  const rawWindows = (rawJson.windows ?? {}) as Partial<
    ExecutiveHomeWindowConfig
  >;

  return {
    jobKey: typeof raw?.jobKey === "string"
      ? raw.jobKey
      : typeof raw?.job_key === "string"
      ? raw.job_key
      : base.jobKey,
    jobName: typeof raw?.jobName === "string"
      ? raw.jobName
      : typeof raw?.job_name === "string"
      ? raw.job_name
      : base.jobName,
    functionName: typeof raw?.functionName === "string"
      ? raw.functionName
      : typeof raw?.function_name === "string"
      ? raw.function_name
      : base.functionName,
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : base.enabled,
    scheduleMode: "dispatcher",
    cronExpression: typeof raw?.cronExpression === "string"
      ? raw.cronExpression
      : typeof raw?.cron_expression === "string"
      ? raw.cron_expression
      : base.cronExpression,
    dispatcherIntervalMinutes:
      typeof raw?.dispatcherIntervalMinutes === "number"
        ? raw.dispatcherIntervalMinutes
        : typeof raw?.dispatcher_interval_minutes === "number"
        ? raw.dispatcher_interval_minutes
        : base.dispatcherIntervalMinutes,
    timezoneMode: "user_timezone",
    maxUsersPerRun: typeof raw?.maxUsersPerRun === "number"
      ? raw.maxUsersPerRun
      : typeof raw?.max_users_per_run === "number"
      ? raw.max_users_per_run
      : base.maxUsersPerRun,
    retryAttempts: typeof raw?.retryAttempts === "number"
      ? raw.retryAttempts
      : typeof raw?.retry_attempts === "number"
      ? raw.retry_attempts
      : base.retryAttempts,
    retryDelaySeconds: typeof raw?.retryDelaySeconds === "number"
      ? raw.retryDelaySeconds
      : typeof raw?.retry_delay_seconds === "number"
      ? raw.retry_delay_seconds
      : base.retryDelaySeconds,
    configJson: {
      windows: {
        morning: typeof rawWindows.morning === "string"
          ? rawWindows.morning
          : base.configJson.windows.morning,
        afternoon: typeof rawWindows.afternoon === "string"
          ? rawWindows.afternoon
          : base.configJson.windows.afternoon,
        evening: typeof rawWindows.evening === "string"
          ? rawWindows.evening
          : base.configJson.windows.evening,
      },
      allowedDays: Array.isArray(rawJson.allowedDays)
        ? rawJson.allowedDays.filter((day): day is string =>
          typeof day === "string"
        )
        : base.configJson.allowedDays,
      runOnWeekends: typeof rawJson.runOnWeekends === "boolean"
        ? rawJson.runOnWeekends
        : base.configJson.runOnWeekends,
      respectTravelTimezone: typeof rawJson.respectTravelTimezone === "boolean"
        ? rawJson.respectTravelTimezone
        : base.configJson.respectTravelTimezone,
      skipIfAlreadyBuilt: typeof rawJson.skipIfAlreadyBuilt === "boolean"
        ? rawJson.skipIfAlreadyBuilt
        : base.configJson.skipIfAlreadyBuilt,
      buildSequence: Array.isArray(rawJson.buildSequence)
        ? rawJson.buildSequence.filter((item): item is string =>
          typeof item === "string"
        )
        : base.configJson.buildSequence,
      mode: "scheduled",
      dryRun: typeof rawJson.dryRun === "boolean"
        ? rawJson.dryRun
        : Boolean(base.configJson.dryRun),
    },
  };
}

export function resolveDueWindow(
  timeZone: string,
  now: Date,
  config: ExecutiveHomeCronConfig,
): TimeWindow | null {
  if (!config.enabled) return null;
  const local = localParts(timeZone, now);
  const weekdayIndex = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(now).toLowerCase().slice(0, 3);

  const isWeekend = weekdayIndex === "sat" || weekdayIndex === "sun";
  if (!config.configJson.runOnWeekends && isWeekend) return null;
  if (
    config.configJson.allowedDays.length > 0 &&
    !config.configJson.allowedDays.includes(weekdayIndex)
  ) return null;

  const localMinutes = local.hour * 60 + local.minute;
  const windows: TimeWindow[] = ["morning", "afternoon", "evening"];
  for (const window of windows) {
    const scheduledMinutes = parseClock(config.configJson.windows[window]);
    if (scheduledMinutes === null) continue;
    if (
      localMinutes >= scheduledMinutes &&
      localMinutes < scheduledMinutes + config.dispatcherIntervalMinutes
    ) {
      return window;
    }
  }
  return null;
}

export function nextExpectedRunAt(now: Date, intervalMinutes: number): string {
  const ms = Math.max(1, intervalMinutes) * 60_000;
  const next = new Date(Math.ceil(now.getTime() / ms) * ms);
  return next.toISOString();
}
