/**
 * 날짜·시간 계산 유틸.
 *
 * JS Date 의 로컬 타임존에 의존하면 서버(UTC)와 브라우저(KST)에서 요일·날짜가 달라지는
 * 버그가 생긴다. 그래서 날짜는 "YYYY-MM-DD" 문자열, 시각은 자정 기준 분(minute) 정수로만
 * 다루고, 요일/날짜 이동은 UTC 기준 달력 연산으로 계산한다. (한국은 서머타임이 없다)
 */
import type { ArrivalTime, ClockTime, DayOfWeek, ISODate } from "@/types/domain";

export const MINUTES_PER_DAY = 24 * 60;
const KST_OFFSET_MINUTES = 9 * 60;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** 유효한 달력 날짜인지 검사 (2026-02-30 같은 값은 거부) */
export function isValidDate(value: string): value is ISODate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  );
}

/** "HH:MM" → 자정 기준 분. 유효하지 않으면 null */
export function parseClockTime(value: string): number | null {
  const m = TIME_RE.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 자정 기준 분 → "HH:MM". 24시간을 넘거나 음수여도 하루 안으로 정규화한다. */
export function formatClockTime(minutes: number): ClockTime {
  const normalized = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toUtcDate(date: ISODate): Date {
  if (!isValidDate(date)) throw new RangeError(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(dt: Date): ISODate {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDayOfWeek(date: ISODate): DayOfWeek {
  return toUtcDate(date).getUTCDay() as DayOfWeek;
}

export function addDays(date: ISODate, days: number): ISODate {
  const dt = toUtcDate(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtcDate(dt);
}

/**
 * 출발 날짜·시각에 소요시간을 더해 도착 날짜·시각을 계산한다.
 * 예) 2026-10-02 23:00 + 100분 → 2026-10-03 00:40 (dayOffset 1)
 */
export function addMinutesToDateTime(
  date: ISODate,
  departureMinutes: number,
  durationMinutes: number,
): ArrivalTime {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
    throw new RangeError(`Invalid duration: ${durationMinutes}`);
  }
  const total = departureMinutes + Math.round(durationMinutes);
  const dayOffset = Math.floor(total / MINUTES_PER_DAY);
  return {
    date: addDays(date, dayOffset),
    time: formatClockTime(total),
    dayOffset,
  };
}

/** 한국 시간 기준 오늘 날짜 */
export function todayInKorea(now: Date = new Date()): ISODate {
  const kst = new Date(now.getTime() + KST_OFFSET_MINUTES * 60_000);
  return fromUtcDate(kst);
}

/** 한국 시간 기준 현재 시각(자정 기준 분) */
export function nowMinutesInKorea(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MINUTES * 60_000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** 128 → "2시간 8분", 45 → "45분", 120 → "2시간" */
export function formatDuration(minutes: number): string {
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 128 → "2h 08m" (차트 등 좁은 공간용) */
export function formatDurationCompact(minutes: number): string {
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** 28 → "+28분", -5 → "-5분", 0 → "±0분" */
export function formatDelay(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "±0분";
  return `${rounded > 0 ? "+" : "-"}${formatDuration(Math.abs(rounded))}`;
}

const DAY_NAMES_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function dayOfWeekLabel(day: DayOfWeek): string {
  return DAY_NAMES_KO[day];
}

/** "2026-10-02" → "10월 2일 (금)" */
export function formatDateKo(date: ISODate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 (${dayOfWeekLabel(getDayOfWeek(date))})`;
}
