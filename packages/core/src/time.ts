/**
 * IST helpers. India has no DST, so IST is a fixed UTC+05:30 and plain arithmetic is safe.
 */
export const IST_OFFSET_MIN = 330;
const MIN = 60_000;

/** Wall-clock parts of a Date in IST. */
export function istParts(d: Date): { y: number; m: number; day: number; hour: number; minute: number } {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * MIN);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Build a Date from an IST wall-clock time. */
export function fromIst(y: number, m: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(y, m, day, hour, minute) - IST_OFFSET_MIN * MIN);
}

export interface QuietHours {
  startHour: number; // e.g. 21
  endHour: number; // e.g. 9
}

export const DEFAULT_QUIET_HOURS: QuietHours = { startHour: 21, endHour: 9 };

export function isQuietHours(d: Date, q: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  const { hour } = istParts(d);
  return q.startHour > q.endHour ? hour >= q.startHour || hour < q.endHour : hour >= q.startHour && hour < q.endHour;
}

/** Returns d if allowed, otherwise the next quiet-hours end (e.g. 09:00 IST). */
export function nextAllowedTime(d: Date, q: QuietHours = DEFAULT_QUIET_HOURS): Date {
  if (!isQuietHours(d, q)) return d;
  const p = istParts(d);
  const sameDayEnd = fromIst(p.y, p.m, p.day, q.endHour, 0);
  return sameDayEnd.getTime() > d.getTime() ? sameDayEnd : fromIst(p.y, p.m, p.day + 1, q.endHour, 0);
}

/** Day-offset scheduling: `base` + N days, at `hhmm` IST if given, pushed out of quiet hours. */
export function scheduleAtDayOffset(base: Date, dayOffset: number, hhmm?: string | null, q: QuietHours = DEFAULT_QUIET_HOURS): Date {
  let target: Date;
  if (hhmm) {
    const [h, mi] = hhmm.split(':').map(Number);
    const p = istParts(base);
    target = fromIst(p.y, p.m, p.day + dayOffset, h ?? 10, mi ?? 0);
    if (target.getTime() < base.getTime()) target = base;
  } else {
    target = new Date(base.getTime() + dayOffset * 24 * 60 * MIN);
  }
  return nextAllowedTime(target, q);
}
