// src/services/time.ts
export function nowPartsInTZ(tz = "Europe/Berlin") {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value || "";
  const weekdayShort = get("weekday").toLowerCase(); // mon..sun
  const map: Record<string, number> = { mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,sun:7 };
  const weekday = map[weekdayShort.slice(0,3)] ?? 1;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { tz, weekday, hour, minute };
}

export function minutesSinceMidnightInTZ(tz = "Europe/Berlin") {
  const { hour, minute } = nowPartsInTZ(tz);
  return hour*60 + minute;
}
