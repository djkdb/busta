import { classifyDay, StaticHolidayCalendar } from "@/lib/data/holiday-calendar";
import { MockTravelTimeDataProvider } from "@/lib/data/mock-travel-time-provider";
import { SampleScheduleDataProvider } from "@/lib/data/sample-schedule-provider";
import type {
  HolidayCalendar,
  ScheduleDataProvider,
  TravelTimeDataProvider,
} from "@/lib/data/types";
import {
  addMinutesToDateTime,
  formatClockTime,
  getDayOfWeek,
  isValidDate,
  parseClockTime,
} from "@/lib/utils/time";
import type { TravelTimePrediction } from "@/types/domain";
import type {
  PredictionEngine,
  PredictionError,
  PredictionInput,
  PredictionResult,
} from "./types";

export interface EngineDependencies {
  schedules: ScheduleDataProvider;
  travelTime: TravelTimeDataProvider;
  holidays: HolidayCalendar;
}

const fail = (code: PredictionError["code"], message: string): PredictionResult => ({
  ok: false,
  error: { code, message },
});

/**
 * 공통 예측 파이프라인: 입력 검증 → 노선 조회 → 소요시간 데이터 → 도착/지연 계산.
 * 엔진 종류는 주입되는 TravelTimeDataProvider 로 결정되므로, 새 데이터 소스가 생겨도
 * 도착시간·지연·검증 로직은 재사용된다.
 */
export class ProviderPredictionEngine implements PredictionEngine {
  constructor(
    readonly id: string,
    private readonly deps: EngineDependencies,
  ) {}

  async predict(input: PredictionInput): Promise<PredictionResult> {
    const { schedules, travelTime, holidays } = this.deps;

    if (!isValidDate(input.date)) {
      return fail("INVALID_DATE", "날짜 형식이 올바르지 않습니다. (예: 2026-10-02)");
    }
    const departureMinutes = parseClockTime(input.departureTime);
    if (departureMinutes === null) {
      return fail("INVALID_TIME", "출발시간 형식이 올바르지 않습니다. (예: 17:00)");
    }
    if (input.originId === input.destinationId) {
      return fail("SAME_ORIGIN_DESTINATION", "출발지와 도착지가 같습니다.");
    }

    const terminals = await schedules.listTerminals();
    const origin = terminals.find((t) => t.id === input.originId);
    const destination = terminals.find((t) => t.id === input.destinationId);
    if (!origin || !destination) {
      return fail("UNKNOWN_TERMINAL", "알 수 없는 터미널입니다.");
    }

    const route = await schedules.findRoute(origin.id, destination.id);
    if (!route) {
      return fail("ROUTE_NOT_FOUND", `${origin.name} → ${destination.name} 노선 정보가 없습니다.`);
    }

    const data = await travelTime.getTravelTime({ route, date: input.date, departureMinutes });
    if (!data) {
      return fail("NO_TRAVEL_TIME_DATA", "이 조건에 대한 소요시간 데이터가 없습니다.");
    }

    const dayOfWeek = getDayOfWeek(input.date);
    const holiday = holidays.getHoliday(input.date);
    const scheduled = route.scheduledDurationMinutes;
    const departureTime = formatClockTime(departureMinutes);

    const prediction: TravelTimePrediction = {
      routeId: route.id,
      date: input.date,
      dayOfWeek,
      dayType: classifyDay(input.date, holidays),
      holidayName: holiday?.name ?? null,
      departureTime,
      scheduledDurationMinutes: scheduled,
      predictedDurationMinutes: data.durationMinutes,
      scheduledArrival: addMinutesToDateTime(input.date, departureMinutes, scheduled),
      predictedArrival: addMinutesToDateTime(input.date, departureMinutes, data.durationMinutes),
      delayMinutes: data.durationMinutes - scheduled,
      factors: data.factors,
      source: data.source,
    };

    const routeSchedules = await schedules.listSchedules(route.id);
    const isScheduledDeparture = routeSchedules.some(
      (s) => s.departureTime === departureTime && s.operatingDays.includes(dayOfWeek),
    );

    const notes: string[] = [];
    if (!holidays.covers(input.date)) {
      notes.push("이 날짜는 공휴일 정보가 없어 요일 기준으로만 계산했습니다.");
    }
    if (!isScheduledDeparture) {
      notes.push("선택한 시각은 (예시) 시간표에 없는 출발시각입니다. 해당 시각 출발을 가정해 계산했습니다.");
    }

    return {
      ok: true,
      prediction,
      route,
      origin,
      destination,
      isScheduledDeparture,
      dataStatus: { schedule: schedules.source, travelTime: data.source, notes },
    };
  }
}

/** 예시 시간표 + Mock 패턴을 사용하는 현재(Phase 1~2) 엔진 */
export class MockPredictionEngine extends ProviderPredictionEngine {
  constructor(holidays: HolidayCalendar = new StaticHolidayCalendar()) {
    super("mock", {
      schedules: new SampleScheduleDataProvider(),
      travelTime: new MockTravelTimeDataProvider(holidays),
      holidays,
    });
  }
}
