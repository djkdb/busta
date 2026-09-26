/**
 * TAGO 고속/시외버스 배차 응답 파서.
 *
 * 실제 응답에서 확인한 형식 (2026-09-26)
 *  - 고속(ExpBusInfo):   depPlandTime = 202609260550      (12자리 YYYYMMDDHHmm, 숫자)
 *  - 시외(SuburbsBusInfo): depPlandTime = 20260926071600  (14자리 YYYYMMDDHHmmss, 숫자)
 *  - 자정 출발편이 "202609262400" 처럼 전날 24:00 으로 표기되는 경우가 있다 → 다음날 00:00 으로 정규화
 *  - 같은 노선이라도 출발편마다 소요시간이 다를 수 있다 (청주→수원: 85분 / 90분)
 */
import { addMinutesToDateTime, isValidDate, parseClockTime } from "@/lib/utils/time";
import type { ClockTime, ISODate } from "@/types/domain";

export interface TagoScheduleItem {
  routeId?: string;
  depPlaceNm?: string;
  arrPlaceNm?: string;
  depPlandTime?: number | string;
  arrPlandTime?: number | string;
  charge?: number;
  gradeNm?: string;
}

export interface TagoDateTime {
  date: ISODate;
  time: ClockTime;
  /** 날짜 기준 절대 분 비교용 (date 의 자정 = 0) */
  minutes: number;
}

export interface ParsedDeparture {
  departure: TagoDateTime;
  durationMinutes: number;
  grade: string | null;
  charge: number | null;
}

/** 12자리 또는 14자리 TAGO 시각 → 정규화된 날짜·시각. 형식이 틀리면 null */
export function parseTagoDateTime(value: number | string | undefined): TagoDateTime | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!/^\d{12}(\d{2})?$/.test(raw)) return null;
  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const hh = Number(raw.slice(8, 10));
  const mm = Number(raw.slice(10, 12));
  if (!isValidDate(date) || mm > 59 || hh > 24 || (hh === 24 && mm !== 0)) return null;
  // 24:00 → 다음날 00:00
  const normalized = addMinutesToDateTime(date, 0, hh * 60 + mm);
  return {
    date: normalized.date,
    time: normalized.time,
    minutes: parseClockTime(normalized.time)!,
  };
}

function absoluteMinutes(from: TagoDateTime, to: TagoDateTime): number {
  // 두 날짜의 차이(일) * 1440 + 분 차이. 날짜 차이는 최대 1~2일이므로 Date.UTC 로 계산
  const day = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;
  return (day(to.date) - day(from.date)) * 1440 + (to.minutes - from.minutes);
}

/**
 * 배차 목록 → 출발편 목록. 형식이 틀리거나 소요시간이 비정상(0 이하, 24시간 이상)인 항목은 버린다.
 * 버린 개수는 skipped 로 알려준다 (조용히 숨기지 않기 위해).
 */
export function parseTagoSchedules(items: TagoScheduleItem[]): {
  departures: ParsedDeparture[];
  skipped: number;
} {
  const departures: ParsedDeparture[] = [];
  let skipped = 0;
  for (const item of items) {
    const dep = parseTagoDateTime(item.depPlandTime);
    const arr = parseTagoDateTime(item.arrPlandTime);
    if (!dep || !arr) {
      skipped++;
      continue;
    }
    const duration = absoluteMinutes(dep, arr);
    if (duration <= 0 || duration >= 24 * 60) {
      skipped++;
      continue;
    }
    departures.push({
      departure: dep,
      durationMinutes: duration,
      grade: item.gradeNm?.trim() || null,
      charge: typeof item.charge === "number" ? item.charge : null,
    });
  }
  return { departures, skipped };
}
