interface ClockwiseConfig {
  oauthClientId: string;
  oauthClientSecret: string;
  personalCalendarId: string;
  workCalendarId: string;
  timezone: string;
  workHoursStart: string;
  workHoursEnd: string;
  workDays: number[];
  lunchWindowStart: string;
  lunchWindowEnd: string;
  lunchPreferredStart: string;
  lunchMinMinutes: number;
  lunchMaxMinutes: number;
  syncLookaheadDays: number;
  syncOutsideWorkHours: boolean;
  busyBlockTitle: string;
  busyBlockColor: string;
  lunchColor: string;
}

const DEFAULTS: Partial<Record<keyof ClockwiseConfig, string>> = {
  workCalendarId: "primary",
  timezone: "America/New_York",
  workHoursStart: "09:00",
  workHoursEnd: "17:00",
  lunchWindowStart: "11:30",
  lunchWindowEnd: "13:30",
  busyBlockTitle: "Busy (Synced)",
};

const DEFAULTS_NUMERIC: Partial<Record<keyof ClockwiseConfig, number>> = {
  lunchMinMinutes: 30,
  lunchMaxMinutes: 60,
  syncLookaheadDays: 14,
};

const REQUIRED_KEYS = [
  "OAUTH_CLIENT_ID",
  "OAUTH_CLIENT_SECRET",
  "PERSONAL_CALENDAR_ID",
] as const;

function getProp(key: string, fallback?: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (value !== null && value !== "") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(
    `Missing required Script Property: ${key}. ` +
      `Set it in File > Project settings > Script properties.`
  );
}

function parseWorkDays(raw: string): number[] {
  return raw.split(",").map((d) => {
    const n = parseInt(d.trim(), 10);
    if (isNaN(n) || n < 0 || n > 6) {
      throw new Error(
        `Invalid WORK_DAYS value "${d}". Use comma-separated 0-6 (0=Sun).`
      );
    }
    return n;
  });
}

function validateTimeFormat(value: string, key: string): void {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(
      `Invalid ${key} format "${value}". Use HH:MM (24-hour), e.g. "09:00".`
    );
  }
}

function getConfig(): ClockwiseConfig {
  for (const key of REQUIRED_KEYS) {
    getProp(key);
  }

  const workHoursStart = getProp("WORK_HOURS_START", DEFAULTS.workHoursStart);
  const workHoursEnd = getProp("WORK_HOURS_END", DEFAULTS.workHoursEnd);
  const lunchWindowStart = getProp(
    "LUNCH_WINDOW_START",
    DEFAULTS.lunchWindowStart
  );
  const lunchWindowEnd = getProp("LUNCH_WINDOW_END", DEFAULTS.lunchWindowEnd);

  validateTimeFormat(workHoursStart, "WORK_HOURS_START");
  validateTimeFormat(workHoursEnd, "WORK_HOURS_END");
  const lunchPreferredStart = getProp("LUNCH_PREFERRED_START", "12:00");

  validateTimeFormat(lunchWindowStart, "LUNCH_WINDOW_START");
  validateTimeFormat(lunchWindowEnd, "LUNCH_WINDOW_END");
  validateTimeFormat(lunchPreferredStart, "LUNCH_PREFERRED_START");

  const lunchMin = parseInt(
    getProp("LUNCH_MIN_MINUTES", String(DEFAULTS_NUMERIC.lunchMinMinutes)),
    10
  );
  const lunchMax = parseInt(
    getProp("LUNCH_MAX_MINUTES", String(DEFAULTS_NUMERIC.lunchMaxMinutes)),
    10
  );
  const lookahead = parseInt(
    getProp(
      "SYNC_LOOKAHEAD_DAYS",
      String(DEFAULTS_NUMERIC.syncLookaheadDays)
    ),
    10
  );

  if (isNaN(lunchMin) || lunchMin <= 0) {
    throw new Error("LUNCH_MIN_MINUTES must be a positive integer.");
  }
  if (isNaN(lunchMax) || lunchMax <= 0) {
    throw new Error("LUNCH_MAX_MINUTES must be a positive integer.");
  }
  if (lunchMin > lunchMax) {
    throw new Error("LUNCH_MIN_MINUTES cannot be greater than LUNCH_MAX_MINUTES.");
  }
  if (isNaN(lookahead) || lookahead <= 0) {
    throw new Error("SYNC_LOOKAHEAD_DAYS must be a positive integer.");
  }

  return {
    oauthClientId: getProp("OAUTH_CLIENT_ID"),
    oauthClientSecret: getProp("OAUTH_CLIENT_SECRET"),
    personalCalendarId: getProp("PERSONAL_CALENDAR_ID"),
    workCalendarId: getProp("WORK_CALENDAR_ID", DEFAULTS.workCalendarId),
    timezone: getProp("TIMEZONE", DEFAULTS.timezone),
    workHoursStart,
    workHoursEnd,
    lunchWindowStart,
    lunchWindowEnd,
    lunchPreferredStart,
    workDays: parseWorkDays(getProp("WORK_DAYS", "1,2,3,4,5")),
    lunchMinMinutes: lunchMin,
    lunchMaxMinutes: lunchMax,
    syncLookaheadDays: lookahead,
    syncOutsideWorkHours:
      getProp("SYNC_OUTSIDE_WORK_HOURS", "false").toLowerCase() === "true",
    busyBlockTitle: getProp("BUSY_BLOCK_TITLE", DEFAULTS.busyBlockTitle),
    busyBlockColor: getProp("BUSY_BLOCK_COLOR", ""),
    lunchColor: getProp("LUNCH_COLOR", ""),
  };
}

/**
 * Parse an "HH:MM" string and apply it to a Date, returning a new Date
 * in the script's configured timezone.
 */
function timeToDate(hhmm: string, baseDate: Date, tz: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const iso = Utilities.formatDate(baseDate, tz, "yyyy-MM-dd");
  return new Date(`${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
}
