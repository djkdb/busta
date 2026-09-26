/**
 * 한국천문연구원 특일 정보 API(getRestDeInfo) 기반 공휴일 달력.
 *
 * 실제 응답 (2026-09-26 확인, tests/fixtures/data-go-kr/kasi-holidays-2026.json)
 *   item: { dateKind: "01", dateName: "1월1일", isHoliday: "Y", locdate: 20260101, seq: 1 }
 *
 * 연도 단위로 불러와 캐시한다. 조회에 실패한 연도는 covers() === false 로 두어
 * 엔진이 "공휴일 정보 없이 요일 기준으로 계산"했다고 안내하게 한다 (정적 목록으로 조용히 대체하지 않음).
 */
import { extractItems, type PublicDataClient } from "@/lib/data/public-data/client";
import type { ISODate } from "@/types/domain";
import type { HolidayCalendar, HolidayInfo } from "./types";

interface KasiItem {
  dateName?: string;
  isHoliday?: string;
  locdate?: number | string;
}

const PATH = "/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

export function parseKasiHolidays(json: unknown): Record<ISODate, string> {
  const out: Record<ISODate, string> = {};
  for (const item of extractItems<KasiItem>(json)) {
    const raw = String(item.locdate ?? "");
    if (item.isHoliday !== "Y" || !/^\d{8}$/.test(raw)) continue;
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const name = item.dateName?.trim() || "공휴일";
    out[date] = out[date] ? `${out[date]} · ${name}` : name;
  }
  return out;
}

export class KasiHolidayCalendar implements HolidayCalendar {
  private readonly years = new Map<number, Promise<Record<ISODate, string> | null>>();
  private readonly loaded = new Map<number, Record<ISODate, string>>();

  constructor(private readonly client: PublicDataClient) {}

  async prepare(date: ISODate): Promise<void> {
    const year = Number(date.slice(0, 4));
    // 12월 31일 출발 버스는 다음 해에 도착할 수 있다
    const years = date.endsWith("-12-31") ? [year, year + 1] : [year];
    await Promise.all(years.map((y) => this.loadYear(y)));
  }

  covers(date: ISODate): boolean {
    return this.loaded.has(Number(date.slice(0, 4)));
  }

  getHoliday(date: ISODate): HolidayInfo | null {
    const name = this.loaded.get(Number(date.slice(0, 4)))?.[date];
    return name ? { name } : null;
  }

  private loadYear(year: number): Promise<Record<ISODate, string> | null> {
    let pending = this.years.get(year);
    if (!pending) {
      pending = this.client
        .getJson(PATH, { solYear: year, numOfRows: 100 }, "ServiceKey")
        .then((json) => {
          const holidays = parseKasiHolidays(json);
          this.loaded.set(year, holidays);
          return holidays;
        })
        .catch((e: unknown) => {
          console.error(`[BUSTA] 특일정보 ${year}년 조회 실패:`, e instanceof Error ? e.message : e);
          this.years.delete(year); // 다음 요청에서 재시도
          return null;
        });
      this.years.set(year, pending);
    }
    return pending;
  }
}
