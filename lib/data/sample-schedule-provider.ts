import { SAMPLE_ROUTES, SAMPLE_SCHEDULES, SAMPLE_TERMINALS } from "@/data/samples/timetable";
import type { BusSchedule, Route, Terminal } from "@/types/domain";
import { SAMPLE_TIMETABLE_SOURCE } from "./sources";
import type { ScheduleDataProvider } from "./types";

/** 예시 시간표(data/samples/timetable.ts)를 제공한다. Phase 3 에서 TAGO API 구현체로 교체 예정. */
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

  async listSchedules(routeId: string): Promise<BusSchedule[]> {
    return this.schedules
      .filter((s) => s.routeId === routeId)
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }
}
