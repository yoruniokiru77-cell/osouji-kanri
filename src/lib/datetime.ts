const TIME_ZONE_PATTERN = /[zZ]|[+-]\d{2}:\d{2}$/;

export function parseReservationDate(value: string) {
  return new Date(TIME_ZONE_PATTERN.test(value) ? value : `${value}+09:00`);
}

export function formatReservationDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parseReservationDate(value));
}

export function formatReservationMonthKey(value: string) {
  return formatReservationDateKey(value).slice(0, 7);
}

export function formatReservationDateTimeLocal(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parseReservationDate(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatReservationTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(parseReservationDate(value));
}

export function formatReservationDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(parseReservationDate(value));
}
