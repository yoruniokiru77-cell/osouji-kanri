type CalendarReservation = {
  address: string;
  customer_name: string | null;
  id: string;
  customer_phone: string | null;
  notes: string | null;
  parking_available: boolean;
  parking_notes: string | null;
  scheduled_at: string;
  service_content: string;
};

type GoogleCalendarEvent = {
  id: string;
  location?: string;
  start?: {
    dateTime?: string;
  };
  summary?: string;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars";
const DEFAULT_EVENT_MINUTES = 120;

function getGoogleCalendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

  if (!clientId || !clientSecret || !refreshToken) return null;

  return {
    calendarId,
    clientId,
    clientSecret,
    refreshToken,
  };
}

function addMinutes(value: string, minutes: number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function buildEventBody(reservation: CalendarReservation) {
  const description = [
    reservation.customer_name ? `お客様名: ${reservation.customer_name}` : null,
    reservation.customer_phone ? `電話番号: ${reservation.customer_phone}` : null,
    `駐車場: ${reservation.parking_available ? "あり" : "なし"}`,
    reservation.parking_notes ? `駐車場メモ: ${reservation.parking_notes}` : null,
    reservation.notes ? `備考: ${reservation.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    description,
    end: {
      dateTime: addMinutes(reservation.scheduled_at, DEFAULT_EVENT_MINUTES),
      timeZone: "Asia/Tokyo",
    },
    extendedProperties: {
      private: {
        reservation_id: reservation.id,
      },
    },
    location: reservation.address,
    start: {
      dateTime: reservation.scheduled_at,
      timeZone: "Asia/Tokyo",
    },
    summary: `${reservation.customer_name ? `${reservation.customer_name} ` : ""}${reservation.service_content}`,
  };
}

function getEventSummary(reservation: CalendarReservation) {
  return `${reservation.customer_name ? `${reservation.customer_name} ` : ""}${reservation.service_content}`;
}

function isSameStartTime(left: string | undefined, right: string) {
  if (!left) return false;
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) < 60_000;
}

async function getAccessToken(config: NonNullable<ReturnType<typeof getGoogleCalendarConfig>>) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    }),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Google Calendar token error: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google Calendar access token was not returned.");
  }

  return data.access_token;
}

async function requestGoogleCalendar(
  path: string,
  init: RequestInit,
  config: NonNullable<ReturnType<typeof getGoogleCalendarConfig>>,
) {
  const accessToken = await getAccessToken(config);
  const response = await fetch(
    `${GOOGLE_CALENDAR_BASE_URL}/${encodeURIComponent(config.calendarId)}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Google Calendar API error: ${response.status}`);
  }

  return response;
}

export function isGoogleCalendarEnabled() {
  return Boolean(getGoogleCalendarConfig());
}

export async function createGoogleCalendarEvent(reservation: CalendarReservation) {
  const config = getGoogleCalendarConfig();
  if (!config) return null;

  const response = await requestGoogleCalendar(
    "/events",
    {
      body: JSON.stringify(buildEventBody(reservation)),
      method: "POST",
    },
    config,
  );
  const event = (await response.json()) as GoogleCalendarEvent;
  return event.id;
}

export async function upsertGoogleCalendarEvent(
  eventId: string | null,
  reservation: CalendarReservation,
) {
  const config = getGoogleCalendarConfig();
  if (!config) return null;
  if (!eventId) return createGoogleCalendarEvent(reservation);

  const response = await requestGoogleCalendar(
    `/events/${encodeURIComponent(eventId)}`,
    {
      body: JSON.stringify(buildEventBody(reservation)),
      method: "PATCH",
    },
    config,
  );

  if (response.status === 404) {
    return createGoogleCalendarEvent(reservation);
  }

  return eventId;
}

async function findGoogleCalendarEventId(
  reservation: CalendarReservation,
  config: NonNullable<ReturnType<typeof getGoogleCalendarConfig>>,
) {
  const privateSearch = await requestGoogleCalendar(
    `/events?${new URLSearchParams({
      privateExtendedProperty: `reservation_id=${reservation.id}`,
      singleEvents: "true",
    }).toString()}`,
    { method: "GET" },
    config,
  );
  const privateData = (await privateSearch.json()) as { items?: GoogleCalendarEvent[] };
  const privateMatch = privateData.items?.find((event) => event.id);
  if (privateMatch?.id) return privateMatch.id;

  const start = new Date(reservation.scheduled_at);
  const timeMin = new Date(start.getTime() - 60 * 60 * 1000).toISOString();
  const timeMax = new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60 * 1000 + 60 * 60 * 1000).toISOString();
  const response = await requestGoogleCalendar(
    `/events?${new URLSearchParams({
      q: reservation.customer_name || reservation.service_content,
      singleEvents: "true",
      timeMax,
      timeMin,
    }).toString()}`,
    { method: "GET" },
    config,
  );
  const data = (await response.json()) as { items?: GoogleCalendarEvent[] };
  const expectedSummary = getEventSummary(reservation);
  const fallbackMatch = data.items?.find(
    (event) =>
      event.id &&
      event.summary === expectedSummary &&
      event.location === reservation.address &&
      isSameStartTime(event.start?.dateTime, reservation.scheduled_at),
  );

  return fallbackMatch?.id ?? null;
}

export async function deleteGoogleCalendarEvent(
  eventId: string | null,
  reservation?: CalendarReservation | null,
) {
  const config = getGoogleCalendarConfig();
  if (!config) return;

  const targetEventId = eventId || (reservation ? await findGoogleCalendarEventId(reservation, config) : null);
  if (!targetEventId) return;

  await requestGoogleCalendar(
    `/events/${encodeURIComponent(targetEventId)}`,
    {
      method: "DELETE",
    },
    config,
  );
}
