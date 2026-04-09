/**
 * Main lunch-scheduling entry point — called by time-driven triggers.
 *
 * Runs once in the morning and then every 15 minutes during the lunch window
 * to handle rescheduling when meetings move.
 */
function scheduleLunch(targetDate?: Date | object): void {
  const config = getConfig();
  const tz = config.timezone;
  const today =
    targetDate instanceof Date ? targetDate : new Date();

  const dayOfWeek = getDayOfWeek(today, tz);
  if (!config.workDays.includes(dayOfWeek)) {
    Logger.log("Not a work day — skipping lunch scheduling.");
    return;
  }

  const windowStart = timeToDate(config.lunchWindowStart, today, tz);
  const windowEnd = timeToDate(config.lunchWindowEnd, today, tz);
  const maxMs = config.lunchMaxMinutes * 60 * 1000;
  const minMs = config.lunchMinMinutes * 60 * 1000;

  const dayStart = timeToDate(config.workHoursStart, today, tz);
  const dayEnd = timeToDate(config.workHoursEnd, today, tz);
  const workEvents = fetchWorkEvents(config.workCalendarId, dayStart, dayEnd, tz);

  const existingLunch = workEvents.find((e) => e.eventType === "lunch");

  if (existingLunch) {
    const hasConflict = workEvents.some(
      (e) =>
        e.id !== existingLunch.id &&
        e.eventType !== "lunch" &&
        eventsOverlap(e, existingLunch)
    );

    if (!hasConflict) {
      Logger.log("Lunch already scheduled and conflict-free.");
      return;
    }
    Logger.log("Lunch block has a conflict — rescheduling.");
  }

  const busyBlocks = workEvents
    .filter((e) => e.id !== existingLunch?.id)
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Try preferred start time first, then fall back to full window
  const preferredStart = timeToDate(config.lunchPreferredStart, today, tz);
  let slot = findBestFreeSlot(preferredStart, windowEnd, maxMs, minMs, busyBlocks);
  if (!slot && preferredStart > windowStart) {
    slot = findBestFreeSlot(windowStart, windowEnd, maxMs, minMs, busyBlocks);
  }

  if (!slot) {
    Logger.log(
      "No free slot for lunch (even %s min) between %s and %s.",
      config.lunchMinMinutes,
      config.lunchWindowStart,
      config.lunchWindowEnd
    );
    if (existingLunch) {
      deleteWorkEvent(config.workCalendarId, existingLunch.id);
      Logger.log("Removed conflicted lunch block (no alternative slot).");
    }
    return;
  }

  const durationMin = (slot.end.getTime() - slot.start.getTime()) / 60000;

  if (existingLunch) {
    updateWorkEvent(
      config.workCalendarId,
      existingLunch.id,
      slot.start,
      slot.end,
      tz
    );
    Logger.log(
      "Rescheduled lunch to %s (%s min)",
      slot.start.toISOString(),
      durationMin
    );
  } else {
    createWorkEvent(
      config.workCalendarId,
      "Lunch",
      slot.start,
      slot.end,
      { [EP_TYPE]: "lunch" },
      tz,
      config.lunchColor || undefined
    );
    Logger.log(
      "Created lunch block at %s (%s min)",
      slot.start.toISOString(),
      durationMin
    );
  }
}

interface TimeSlot {
  start: Date;
  end: Date;
}

/**
 * Find the best free slot by collecting all gaps, then picking the first
 * one that fits. Prefers the max duration; falls back to whatever fits
 * down to the min duration.
 */
function findBestFreeSlot(
  windowStart: Date,
  windowEnd: Date,
  maxMs: number,
  minMs: number,
  busyBlocks: SimpleEvent[]
): TimeSlot | null {
  const gaps = collectGaps(windowStart, windowEnd, busyBlocks);

  for (const gap of gaps) {
    const gapMs = gap.end.getTime() - gap.start.getTime();
    if (gapMs >= maxMs) {
      return { start: gap.start, end: new Date(gap.start.getTime() + maxMs) };
    }
    if (gapMs >= minMs) {
      return { start: gap.start, end: gap.end };
    }
  }

  return null;
}

function collectGaps(
  windowStart: Date,
  windowEnd: Date,
  busyBlocks: SimpleEvent[]
): TimeSlot[] {
  const gaps: TimeSlot[] = [];
  let cursor = windowStart;

  for (const busy of busyBlocks) {
    if (busy.end <= cursor) continue;
    if (busy.start >= windowEnd) break;

    if (busy.start > cursor) {
      gaps.push({
        start: cursor,
        end: new Date(Math.min(busy.start.getTime(), windowEnd.getTime())),
      });
    }

    if (busy.end > cursor) {
      cursor = busy.end;
    }
  }

  if (cursor < windowEnd) {
    gaps.push({ start: cursor, end: windowEnd });
  }

  return gaps;
}

function eventsOverlap(a: SimpleEvent, b: SimpleEvent): boolean {
  return a.start < b.end && a.end > b.start;
}
