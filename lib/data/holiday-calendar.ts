import { COVERED_HOLIDAY_YEARS, KR_HOLIDAYS } from "@/data/calendar/holidays-kr";
import { getDayOfWeek } from "@/lib/utils/time";
import type { DayType, ISODate } from "@/types/domain";
import type { HolidayCalendar, HolidayInfo } from "./types";

export class StaticHolidayCalendar implements HolidayCalendar {
  constructor(
    private readonly holidays: Record<string, string> = KR_HOLIDAYS,
    private readonly coveredYears: readonly number[] = COVERED_HOLIDAY_YEARS,
  ) {}

  covers(date: ISODate): boolean {
    return this.coveredYears.includes(Number(date.slice(0, 4)));
  }

  getHoliday(date: ISODate): HolidayInfo | null {
    const name = this.holidays[date];
    return name ? { name } : null;
  }
}

/** 공휴일 > 요일 순으로 교통 패턴용 날짜 분류를 정한다. */
export function classifyDay(date: ISODate, calendar: HolidayCalendar): DayType {
  if (calendar.getHoliday(date)) return "holiday";
  const dow = getDayOfWeek(date);
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  if (dow === 5) return "friday";
  return "weekday";
}

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  weekday: "평일",
  friday: "금요일",
  saturday: "토요일",
  sunday: "일요일",
  holiday: "공휴일",
};
