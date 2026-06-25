type CalendarReservation = {
  address: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  parking_available: boolean;
  parking_notes: string | null;
  scheduled_at: string;
  service_content: string;
};

type GoogleCalendarEvent = {
  id: string;
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
    location: reservation.address,
    start: {
      dateTime: reservation.scheduled_at,
      timeZone: "Asia/Tokyo",
    },
    summary: `${reservation.customer_name ? `${reservation.customer_name} ` : ""}${reservation.service_content}`,
  };
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

export async function deleteGoogleCalendarEvent(eventId: string | null) {
  const config = getGoogleCalendarConfig();
  if (!config || !eventId) return;

  await requestGoogleCalendar(
    `/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
    },
    config,
  );
}
