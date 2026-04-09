/**
 * Install all time-driven triggers. Run this once from the script editor
 * after initial setup is complete.
 */
function installTriggers(): void {
  removeTriggers();

  // Sync personal → work every 5 minutes
  ScriptApp.newTrigger("syncPersonalToWork")
    .timeBased()
    .everyMinutes(5)
    .create();

  // Schedule lunch every morning at 7 AM
  ScriptApp.newTrigger("scheduleLunch")
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .create();

  // Re-check lunch every 15 minutes (handles rescheduling)
  ScriptApp.newTrigger("scheduleLunch")
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log(
    "Triggers installed:\n" +
      "  • syncPersonalToWork — every 5 min\n" +
      "  • scheduleLunch — daily at 7 AM + every 15 min"
  );
}

/**
 * Remove all triggers owned by this project.
 */
function removeTriggers(): void {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }
  Logger.log("Removed %s existing trigger(s).", triggers.length);
}

/**
 * Run a one-time manual sync. Useful for testing.
 */
function runSyncNow(): void {
  Logger.log("=== Manual sync started ===");
  syncPersonalToWork();
  Logger.log("=== Manual sync complete ===");
}

/**
 * Run a one-time lunch schedule for today.
 */
function runLunchNow(): void {
  Logger.log("=== Manual lunch scheduling started ===");
  scheduleLunch();
  Logger.log("=== Manual lunch scheduling complete ===");
}

/**
 * Schedule lunch for the next 14 days (skips weekends/non-work days).
 */
function runLunchBulk(): void {
  const config = getConfig();
  Logger.log("=== Scheduling lunch for the next %s days ===", config.syncLookaheadDays);
  const now = new Date();
  for (let i = 0; i < config.syncLookaheadDays; i++) {
    const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const label = Utilities.formatDate(day, config.timezone, "EEE, MMM d");
    Logger.log("--- %s ---", label);
    scheduleLunch(day);
  }
  Logger.log("=== Bulk lunch scheduling complete ===");
}

/**
 * Recolor all existing clockwise-alt events to match current config.
 */
function recolorAllEvents(): void {
  const config = getConfig();
  const tz = config.timezone;
  const now = new Date();
  const lookaheadEnd = new Date(
    now.getTime() + config.syncLookaheadDays * 24 * 60 * 60 * 1000
  );

  const workEvents = fetchWorkEvents(config.workCalendarId, now, lookaheadEnd, tz);
  let updated = 0;

  for (const event of workEvents) {
    if (event.sourceId && config.busyBlockColor) {
      recolorWorkEvent(config.workCalendarId, event.id, config.busyBlockColor);
      updated++;
    } else if (event.eventType === "lunch" && config.lunchColor) {
      recolorWorkEvent(config.workCalendarId, event.id, config.lunchColor);
      updated++;
    }
  }

  Logger.log("Recolored %s event(s).", updated);
}

/**
 * List available event color IDs and their names.
 * Use these IDs for BUSY_BLOCK_COLOR and LUNCH_COLOR Script Properties.
 */
function showColors(): void {
  const colors = Calendar.Colors!.get();
  Logger.log("Available event colors (use the ID number as the value):\n");
  const eventColors = colors.event as Record<string, { background?: string }>;
  for (const id of Object.keys(eventColors).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10)
  )) {
    Logger.log("  %s  →  %s", id, eventColors[id].background);
  }
  Logger.log(
    "\nReference:\n" +
      "  1=Lavender  2=Sage      3=Grape     4=Flamingo\n" +
      "  5=Banana    6=Tangerine 7=Peacock   8=Graphite\n" +
      "  9=Blueberry 10=Basil    11=Tomato"
  );
}

/**
 * Print current configuration to the log. Useful for verifying setup.
 */
function showConfig(): void {
  const config = getConfig();
  Logger.log("Current configuration:\n%s", JSON.stringify(config, null, 2));
}

/**
 * Bulk-set Script Properties from a SETUP_PAYLOAD JSON blob.
 * Used by the CLI setup wizard (npm run setup).
 *
 * 1. Read the "SETUP_PAYLOAD" Script Property (a JSON string)
 * 2. Parse it into key-value pairs
 * 3. Set each pair as an individual Script Property
 * 4. Delete the SETUP_PAYLOAD key
 */
function applySetupPayload(): void {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty("SETUP_PAYLOAD");
  if (!raw) {
    Logger.log(
      "No SETUP_PAYLOAD found in Script Properties.\n" +
        "Set it first, then re-run this function."
    );
    return;
  }

  let payload: Record<string, string>;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    Logger.log("SETUP_PAYLOAD is not valid JSON: %s", e);
    return;
  }

  const keys = Object.keys(payload);
  for (const key of keys) {
    props.setProperty(key, String(payload[key]));
  }
  props.deleteProperty("SETUP_PAYLOAD");

  Logger.log("Applied %s Script Properties:", keys.length);
  for (const key of keys) {
    const display = key.includes("SECRET") ? "****" : payload[key];
    Logger.log("  %s = %s", key, display);
  }
  Logger.log("\nSetup payload applied and removed. Run healthCheck() to verify.");
}

/**
 * Full status check: config, auth, and a test read of both calendars.
 */
function healthCheck(): void {
  Logger.log("=== Health Check ===");

  // 1. Config
  let config: ClockwiseConfig;
  try {
    config = getConfig();
    Logger.log("Config: OK");
  } catch (e) {
    Logger.log("Config: FAILED — %s", e);
    return;
  }

  // 2. OAuth
  if (isPersonalCalendarAuthorized()) {
    Logger.log("Personal calendar OAuth: OK");
  } else {
    Logger.log(
      "Personal calendar OAuth: NOT AUTHORIZED\n" +
        "Run authorize() and open the logged URL."
    );
    return;
  }

  // 3. Read personal calendar
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const events = fetchPersonalEvents(
      config.personalCalendarId,
      now,
      tomorrow,
      config.timezone
    );
    Logger.log("Personal calendar: OK (%s events in next 24h)", events.length);
  } catch (e) {
    Logger.log("Personal calendar: FAILED — %s", e);
  }

  // 4. Read work calendar
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const events = fetchWorkEvents(
      config.workCalendarId,
      now,
      tomorrow,
      config.timezone
    );
    Logger.log("Work calendar: OK (%s events in next 24h)", events.length);
  } catch (e) {
    Logger.log("Work calendar: FAILED — %s", e);
  }

  // 5. Triggers
  const triggers = ScriptApp.getProjectTriggers();
  Logger.log("Active triggers: %s", triggers.length);
  for (const t of triggers) {
    Logger.log("  • %s (%s)", t.getHandlerFunction(), t.getEventType());
  }

  Logger.log("=== Health Check Complete ===");
}
