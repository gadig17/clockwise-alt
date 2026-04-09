// Extended property keys used to tag managed events
const EP_SOURCE_ID = "clockwiseAltSourceId";
const EP_TYPE = "clockwiseAltType";

interface SimpleEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  sourceId?: string;
  eventType?: string;
}

// ── Personal calendar (read via OAuth2) ──────────────────────────────

interface GCalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
}

interface GCalEventList {
  items?: GCalEvent[];
  nextPageToken?: string;
}

function fetchPersonalEvents(
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  tz: string
): SimpleEvent[] {
  const events: SimpleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: tz,
    };
    if (pageToken) params.pageToken = pageToken;

    const data = fetchPersonalCalendarApi(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      params
    ) as GCalEventList;

    for (const item of data.items || []) {
      if (item.status === "cancelled") continue;
      const isAllDay = !item.start?.dateTime;
      events.push({
        id: item.id,
        summary: item.summary || "(no title)",
        start: new Date(item.start?.dateTime || item.start?.date || ""),
        end: new Date(item.end?.dateTime || item.end?.date || ""),
        isAllDay,
      });
    }
    pageToken = (data as GCalEventList).nextPageToken;
  } while (pageToken);

  return events;
}

// ── Work calendar (read/write via CalendarApp + Advanced Calendar API) ──

function getWorkCalendar(config: ClockwiseConfig): GoogleAppsScript.Calendar.Calendar {
  if (config.workCalendarId === "primary") {
    return CalendarApp.getDefaultCalendar();
  }
  const cal = CalendarApp.getCalendarById(config.workCalendarId);
  if (!cal) {
    throw new Error(
      `Work calendar not found: ${config.workCalendarId}. ` +
        `Make sure WORK_CALENDAR_ID is correct.`
    );
  }
  return cal;
}

function fetchWorkEvents(
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  tz: string
): SimpleEvent[] {
  const events: SimpleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const opts: GoogleAppsScript.Calendar.Schema.Events = Calendar.Events!.list(
      calendarId,
      {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
        timeZone: tz,
        pageToken: pageToken,
      }
    );

    for (const item of opts.items || []) {
      if (item.status === "cancelled") continue;
      const isAllDay = !item.start?.dateTime;

      let sourceId: string | undefined;
      let eventType: string | undefined;
      if (item.extendedProperties?.private) {
        sourceId = item.extendedProperties.private[EP_SOURCE_ID];
        eventType = item.extendedProperties.private[EP_TYPE];
      }

      events.push({
        id: item.id!,
        summary: item.summary || "",
        start: new Date(item.start?.dateTime || item.start?.date || ""),
        end: new Date(item.end?.dateTime || item.end?.date || ""),
        isAllDay,
        sourceId,
        eventType,
      });
    }
    pageToken = opts.nextPageToken;
  } while (pageToken);

  return events;
}

function createWorkEvent(
  calendarId: string,
  summary: string,
  start: Date,
  end: Date,
  extendedProps: Record<string, string>,
  tz: string,
  colorId?: string
): string {
  const event: GoogleAppsScript.Calendar.Schema.Event = {
    summary,
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
    visibility: "private",
    transparency: "opaque",
    description: "Managed by clockwise-alt. Do not edit.",
    extendedProperties: { private: extendedProps },
  };
  if (colorId) {
    event.colorId = colorId;
  }
  const created = Calendar.Events!.insert(event, calendarId);
  Logger.log("Created event: %s (%s)", summary, created.id);
  return created.id!;
}

function updateWorkEvent(
  calendarId: string,
  eventId: string,
  start: Date,
  end: Date,
  tz: string,
  colorId?: string
): void {
  const patch: GoogleAppsScript.Calendar.Schema.Event = {
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
  };
  if (colorId) {
    patch.colorId = colorId;
  }
  Calendar.Events!.patch(patch, calendarId, eventId);
  Logger.log("Updated event: %s", eventId);
}

function recolorWorkEvent(
  calendarId: string,
  eventId: string,
  colorId: string
): void {
  Calendar.Events!.patch({ colorId: colorId }, calendarId, eventId);
}

function deleteWorkEvent(calendarId: string, eventId: string): void {
  try {
    Calendar.Events!.remove(calendarId, eventId);
    Logger.log("Deleted event: %s", eventId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.includes("Not Found")) {
      Logger.log("Event already deleted: %s", eventId);
    } else {
      throw e;
    }
  }
}
