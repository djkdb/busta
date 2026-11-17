/**
 * 수집기가 보관한 실제 시간표 (busta-data/timetables/YYYY-MM-DD/<노선>.json).
 * TAGO 는 며칠 치만 제공하므로, 공개 전 날짜에는 "같은 요일의 가장 최근 실제 시간표"를 참고한다.
 */
import type { FetchLike } from "@/lib/data/public-data/client";
import { addDays } from "@/lib/utils/time";
import type { ClockTime, ISODate } from "@/types/domain";

export interface ArchivedTimetable {
  routeId: string;
  date: ISODate;
  departures: { t: ClockTime; m: number; g: string | null }[];
}

export interface TimetableArchive {
  /**
   * target 과 같은 요일이면서 target 이전이고 latest 이하인 날짜를 최근 것부터 weeks 개까지 찾는다.
   * (latest = 실제로 보관됐을 수 있는 마지막 날짜, 보통 내일)
   */
  findSameWeekday(routeId: string, target: ISODate, latest: ISODate, weeks?: number): Promise<ArchivedTimetable | null>;
}

/** findSameWeekday 가 확인하는 날짜들 (테스트·설명용으로 공개) */
export function sameWeekdayCandidates(target: ISODate, latest: ISODate, weeks = 4): ISODate[] {
  let d = addDays(target, -7);
  while (d > latest) d = addDays(d, -7);
  const out: ISODate[] = [];
  for (let i = 0; i < weeks; i++, d = addDays(d, -7)) out.push(d);
  return out;
}

function isArchived(x: unknown): x is ArchivedTimetable {
  const v = x as ArchivedTimetable;
  return !!v && typeof v.routeId === "string" && Array.isArray(v.departures) && v.departures.length > 0;
}

abstract class BaseArchive implements TimetableArchive {
  protected abstract read(date: ISODate, routeId: string): Promise<string | null>;

  async findSameWeekday(routeId: string, target: ISODate, latest: ISODate, weeks = 4): Promise<ArchivedTimetable | null> {
    for (const date of sameWeekdayCandidates(target, latest, weeks)) {
      const text = await this.read(date, routeId).catch(() => null);
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        if (isArchived(parsed)) return parsed;
      } catch {
        /* 깨진 파일은 건너뛴다 */
      }
    }
    return null;
  }
}

export class HttpTimetableArchive extends BaseArchive {
  private readonly fetchImpl: FetchLike;
  constructor(
    private readonly baseUrl: string,
    fetchImpl?: FetchLike,
  ) {
    super();
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }
  protected async read(date: ISODate, routeId: string) {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/${date}/${routeId}.json`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok ? res.text() : null;
  }
}

export class FileTimetableArchive extends BaseArchive {
  constructor(private readonly dir: string) {
    super();
  }
  protected async read(date: ISODate, routeId: string) {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return readFile(join(this.dir, date, `${routeId}.json`), "utf8").catch(() => null);
  }
}
