/**
 * Main sync entry point — called by a time-driven trigger every 5 minutes.
 *
 * Reads personal calendar events via OAuth2, diffs against existing synced
 * busy blocks on the work calendar, and creates/updates/deletes as needed.
 */
function syncPersonalToWork(): void {
  const config = getConfig();
  const tz = config.timezone;

  const now = new Date();
  const lookaheadEnd = new Date(
    now.getTime() + config.syncLookaheadDays * 24 * 60 * 60 * 1000
  );

  // 1. Fetch personal events
  const personalEvents = fetchPersonalEvents(
    config.personalCalendarId,
    now,
    lookaheadEnd,
    tz
  );

  // 2. Filter: remove all-day events, weekends, outside work hours
  const eligible = personalEvents.filter((e) =>
    isEligibleForSync(e, config)
  );

  // 3. Fetch existing synced events from work calendar
  const workEvents = fetchWorkEvents(config.workCalendarId, now, lookaheadEnd, tz);
  const syncedEvents = workEvents.filter((e) => e.sourceId !== undefined);

  // Build lookup maps
  const personalById = new Map(eligible.map((e) => [e.id, e]));
  const syncedBySourceId = new Map(syncedEvents.map((e) => [e.sourceId!, e]));

  let created = 0;
  let updated = 0;
  let deleted = 0;

  // 4. Create or update
  for (const [personalId, personal] of personalById) {
    const existing = syncedBySourceId.get(personalId);
    if (!existing) {
      createWorkEvent(
        config.workCalendarId,
        config.busyBlockTitle,
        personal.start,
        personal.end,
        { [EP_SOURCE_ID]: personalId },
        tz,
        config.busyBlockColor || undefined
      );
      created++;
    } else if (
      existing.start.getTime() !== personal.start.getTime() ||
      existing.end.getTime() !== personal.end.getTime()
    ) {
      updateWorkEvent(
        config.workCalendarId,
        existing.id,
        personal.start,
        personal.end,
        tz
      );
      updated++;
    }
  }

  // 5. Delete orphaned synced events (personal event was removed or no longer eligible)
  for (const [sourceId, synced] of syncedBySourceId) {
    if (!personalById.has(sourceId)) {
      deleteWorkEvent(config.workCalendarId, synced.id);
      deleted++;
    }
  }

  Logger.log(
    "Sync complete — created: %s, updated: %s, deleted: %s",
    created,
    updated,
    deleted
  );
}

function isEligibleForSync(
  event: SimpleEvent,
  config: ClockwiseConfig
): boolean {
  if (event.isAllDay) return false;

  const tz = config.timezone;
  const dayOfWeek = getDayOfWeek(event.start, tz);
  if (!config.workDays.includes(dayOfWeek)) return false;

  if (!config.syncOutsideWorkHours) {
    const workStart = timeToDate(config.workHoursStart, event.start, tz);
    const workEnd = timeToDate(config.workHoursEnd, event.start, tz);
    if (event.end <= workStart || event.start >= workEnd) return false;
  }

  return true;
}

/**
 * Get the day of week (0=Sun … 6=Sat) for a Date in a specific timezone.
 */
function getDayOfWeek(date: Date, tz: string): number {
  const dayStr = Utilities.formatDate(date, tz, "u"); // 1=Mon ... 7=Sun (ISO)
  const iso = parseInt(dayStr, 10);
  return iso === 7 ? 0 : iso; // convert to 0=Sun
}
