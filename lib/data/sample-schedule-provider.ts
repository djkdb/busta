import { SAMPLE_ROUTES, SAMPLE_SCHEDULES, SAMPLE_TERMINALS } from "@/data/samples/timetable";
import { getDayOfWeek, isValidDate } from "@/lib/utils/time";
import type { BusSchedule, ISODate, Route, Terminal } from "@/types/domain";
import { SAMPLE_TIMETABLE_SOURCE } from "./sources";
import { ScheduleUnavailableError, type ScheduleDataProvider, type Timetable } from "./types";

/** 예시 시간표(data/samples/timetable.ts)를 제공한다. 실제 데이터는 TagoScheduleDataProvider. */
export class SampleScheduleDataProvider implements ScheduleDataProvider {
  readonly source = SAMPLE_TIMETABLE_SOURCE;

  constructor(
    private readonly terminals: Terminal[] = SAMPLE_TERMINALS,
    private readonly routes: Route[] = SAMPLE_ROUTES,
    private readonly schedules: BusSchedule[] = SAMPLE_SCHEDULES,
  ) {}

  async listTerminals(): Promise<Terminal[]> {
    return this.terminals;
  }

  async listRoutes(): Promise<Route[]> {
    return this.routes;
  }

  async findRoute(originId: string, destinationId: string): Promise<Route | null> {
    return (
      this.routes.find((r) => r.originId === originId && r.destinationId === destinationId) ??
      null
    );
  }

  async getTimetable(routeId: string, date: ISODate): Promise<Timetable> {
    if (!this.routes.some((r) => r.id === routeId)) {
      throw new ScheduleUnavailableError(`알 수 없는 노선: ${routeId}`);
    }
    if (!isValidDate(date)) throw new ScheduleUnavailableError(`잘못된 날짜: ${date}`);
    const dow = getDayOfWeek(date);
    const departures = this.schedules
      .filter((s) => s.routeId === routeId && s.operatingDays.includes(dow))
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    return { routeId, date, referenceDate: date, departures, source: this.source, notes: [] };
  }
}
