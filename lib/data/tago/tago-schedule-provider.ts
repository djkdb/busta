/**
 * 공공데이터포털 TAGO 고속/시외버스 배차 정보 기반 시간표 제공자.
 *
 * 확인된 API 특성 (2026-09-26 실측)
 *  - 조회 가능 기간이 짧다: 어제~모레 정도만 결과가 있고, 그 이후 날짜는 "0건 정상 응답"이다.
 *    → 공개 전 날짜는 가까운 날의 시간표를 "참고 시간표"로 명시해 보여준다 (조용히 대체하지 않음).
 *  - 자정 출발편은 전날 목록에 "24:00"으로 들어 있다 → 날짜 D 의 시간표 = D 목록 + (D-1 목록 중 실제 출발일이 D 인 편)
 */
import type { TagoRoute } from "@/data/catalog/tago-routes";
import { extractItems, PublicDataApiError, type PublicDataClient } from "@/lib/data/public-data/client";
import { addDays, formatDateKo, getDayOfWeek, isValidDate, todayInKorea } from "@/lib/utils/time";
import type { BusSchedule, DataSourceInfo, ISODate, Route, Terminal } from "@/types/domain";
import {
  ScheduleUnavailableError,
  type ScheduleDataProvider,
  type Timetable,
} from "../types";
import { parseTagoSchedules, type ParsedDeparture, type TagoScheduleItem } from "./parse";

export const TAGO_SCHEDULE_SOURCE: DataSourceInfo = {
  kind: "public-api",
  label: "공공데이터포털 TAGO 고속·시외버스정보",
  description: "국토교통부 TAGO 배차 정보의 출발·도착 예정시각으로 만든 실제 시간표입니다.",
  isRealData: true,
};

const SERVICE_SOURCE: Record<TagoRoute["tago"]["service"], DataSourceInfo> = {
  express: {
    ...TAGO_SCHEDULE_SOURCE,
    label: "공공데이터포털 TAGO 고속버스정보",
    description: "국토교통부 TAGO 고속버스 배차 정보의 출발·도착 예정시각입니다.",
  },
  intercity: {
    ...TAGO_SCHEDULE_SOURCE,
    label: "공공데이터포털 TAGO 시외버스정보",
    description: "국토교통부 TAGO 시외버스 배차 정보의 출발·도착 예정시각입니다.",
  },
};

const ENDPOINT = {
  express: "/1613000/ExpBusInfo/GetStrtpntAlocFndExpbusInfo",
  intercity: "/1613000/SuburbsBusInfo/GetStrtpntAlocFndSuberbsBusInfo",
} as const;

const PAGE_SIZE = 500;
const MAX_PAGES = 5;

export interface TagoScheduleProviderOptions {
  now?: () => Date;
  cacheTtlMs?: number;
}

const isWeekendLike = (date: ISODate) => [0, 6].includes(getDayOfWeek(date));

export class TagoScheduleDataProvider implements ScheduleDataProvider {
  readonly source = TAGO_SCHEDULE_SOURCE;
  private readonly now: () => Date;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, { expires: number; value: Promise<ParsedDay> }>();

  constructor(
    private readonly client: PublicDataClient,
    private readonly terminals: Terminal[],
    private readonly routes: TagoRoute[],
    options: TagoScheduleProviderOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.cacheTtlMs = options.cacheTtlMs ?? 30 * 60_000;
  }

  async listTerminals(): Promise<Terminal[]> {
    return this.terminals;
  }

  async listRoutes(): Promise<Route[]> {
    return this.routes;
  }

  async findRoute(originId: string, destinationId: string): Promise<Route | null> {
    return this.routes.find((r) => r.originId === originId && r.destinationId === destinationId) ?? null;
  }

  async getTimetable(routeId: string, date: ISODate): Promise<Timetable> {
    const route = this.routes.find((r) => r.id === routeId);
    if (!route) throw new ScheduleUnavailableError(`알 수 없는 노선: ${routeId}`);
    if (!isValidDate(date)) throw new ScheduleUnavailableError(`잘못된 날짜: ${date}`);

    const source = SERVICE_SOURCE[route.tago.service];
    const own = await this.departuresOn(route, date);
    if (own.departures.length > 0 || this.isInPublishedWindow(date)) {
      return this.toTimetable(route, date, date, own, source, []);
    }

    // 공개 전(또는 지난) 날짜: 공개된 날 중 주말/평일 성격이 같은 날을 우선 참고
    const today = todayInKorea(this.now());
    const candidates = [today, addDays(today, 1)].sort(
      (a, b) => Number(isWeekendLike(b) === isWeekendLike(date)) - Number(isWeekendLike(a) === isWeekendLike(date)),
    );
    for (const candidate of candidates) {
      const ref = await this.departuresOn(route, candidate);
      if (ref.departures.length === 0) continue;
      return this.toTimetable(route, date, candidate, ref, source, [
        `${formatDateKo(date)} 시간표는 아직 공개되지 않아 ${formatDateKo(candidate)} 시간표를 참고해 보여드려요. 실제 배차와 다를 수 있습니다.`,
      ]);
    }
    return this.toTimetable(route, date, date, own, source, ["이 날짜의 시간표 정보가 없습니다."]);
  }

  /** 실측상 결과가 오는 기간 (어제 ~ 내일). 이 안에서 0건이면 "운행 없음"으로 본다. */
  private isInPublishedWindow(date: ISODate): boolean {
    const today = todayInKorea(this.now());
    return date >= addDays(today, -1) && date <= addDays(today, 1);
  }

  private async departuresOn(route: TagoRoute, date: ISODate): Promise<ParsedDay> {
    const [prev, same] = await Promise.all([
      this.fetchServiceDay(route, addDays(date, -1)),
      this.fetchServiceDay(route, date),
    ]);
    const byTime = new Map<string, ParsedDeparture>();
    for (const d of [...prev.departures, ...same.departures]) {
      if (d.departure.date !== date) continue;
      const existing = byTime.get(d.departure.time);
      if (!existing) byTime.set(d.departure.time, d);
      else if (d.grade && existing.grade && !existing.grade.split("/").includes(d.grade)) {
        byTime.set(d.departure.time, { ...existing, grade: `${existing.grade}/${d.grade}` });
      }
    }
    return {
      departures: [...byTime.values()].sort((a, b) => a.departure.minutes - b.departure.minutes),
      skipped: same.skipped,
    };
  }

  /** 운행일(serviceDate) 하나의 배차 목록. 캐시·페이지네이션 포함 */
  private fetchServiceDay(route: TagoRoute, serviceDate: ISODate): Promise<ParsedDay> {
    const key = `${route.tago.service}:${route.tago.depTerminalId}:${route.tago.arrTerminalId}:${serviceDate}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const value = this.loadServiceDay(route, serviceDate);
    this.cache.set(key, { expires: Date.now() + this.cacheTtlMs, value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  private async loadServiceDay(route: TagoRoute, serviceDate: ISODate): Promise<ParsedDay> {
    const items: TagoScheduleItem[] = [];
    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const json = await this.client.getJson(ENDPOINT[route.tago.service], {
          depTerminalId: route.tago.depTerminalId,
          arrTerminalId: route.tago.arrTerminalId,
          depPlandTime: serviceDate.replaceAll("-", ""),
          numOfRows: PAGE_SIZE,
          pageNo: page,
        });
        const pageItems = extractItems<TagoScheduleItem>(json);
        items.push(...pageItems);
        const total = Number((json as { response?: { body?: { totalCount?: number } } }).response?.body?.totalCount ?? 0);
        if (pageItems.length < PAGE_SIZE || items.length >= total) break;
      }
    } catch (e) {
      const reason = e instanceof PublicDataApiError ? e.message : "알 수 없는 오류";
      throw new ScheduleUnavailableError(`TAGO 시간표 조회 실패 (${reason})`, { cause: e });
    }
    return parseTagoSchedules(items);
  }

  private toTimetable(
    route: TagoRoute,
    date: ISODate,
    referenceDate: ISODate,
    day: ParsedDay,
    source: DataSourceInfo,
    notes: string[],
  ): Timetable {
    const dow = getDayOfWeek(date);
    const departures: BusSchedule[] = day.departures.map((d) => ({
      id: `${route.id}@${d.departure.time}`,
      routeId: route.id,
      departureTime: d.departure.time,
      operatingDays: [dow],
      scheduledDurationMinutes: d.durationMinutes,
      grade: d.grade ?? undefined,
    }));
    if (day.skipped > 0) notes = [...notes, `형식이 올바르지 않은 배차 ${day.skipped}건은 제외했습니다.`];
    return { routeId: route.id, date, referenceDate, departures, source, notes };
  }
}

interface ParsedDay {
  departures: ParsedDeparture[];
  skipped: number;
}
