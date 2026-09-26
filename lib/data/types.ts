/**
 * 데이터 제공 계층 인터페이스.
 *
 * Prediction Engine 과 UI 는 이 인터페이스에만 의존한다. 실제 데이터가 확보되면
 * 구현체만 교체한다.
 *
 *   ScheduleDataProvider   : Sample → TAGO 고속/시외버스 API
 *   TravelTimeDataProvider : Mock 패턴 → 실제 운행/통행 이력(Historical) → 교통 API
 *   HolidayCalendar        : 정적 목록 → 특일정보 API
 */
import type {
  BusSchedule,
  ClockTime,
  DataSourceInfo,
  DayType,
  ISODate,
  PredictionFactor,
  Route,
  Terminal,
} from "@/types/domain";

/**
 * 특정 날짜의 시간표.
 * 실제 시간표 API 는 가까운 며칠만 제공하므로, 요청 날짜의 시간표가 없으면 다른 날짜
 * (referenceDate)의 시간표를 참고용으로 돌려줄 수 있다. 이 경우 notes 에 반드시 이유를 적는다.
 */
export interface Timetable {
  routeId: string;
  date: ISODate;
  referenceDate: ISODate;
  /** 출발시각 오름차순, 출발시각 중복 없음 */
  departures: BusSchedule[];
  source: DataSourceInfo;
  notes: string[];
}

export interface ScheduleDataProvider {
  readonly source: DataSourceInfo;
  listTerminals(): Promise<Terminal[]>;
  listRoutes(): Promise<Route[]>;
  findRoute(originId: string, destinationId: string): Promise<Route | null>;
  /** 실패 시 ScheduleUnavailableError 를 던진다 */
  getTimetable(routeId: string, date: ISODate): Promise<Timetable>;
}

/** 시간표를 가져오지 못했을 때 (네트워크, 인증, API 오류) */
export class ScheduleUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ScheduleUnavailableError";
  }
}

export interface TravelTimeQuery {
  route: Route;
  date: ISODate;
  /** 자정 기준 분 */
  departureMinutes: number;
  /** 이 출발편의 시간표 소요시간(분) — 예측의 기준값 */
  scheduledDurationMinutes: number;
}

export interface TravelTimeData {
  routeId: string;
  /** 해당 조건에서 추정한 소요시간(분). 데이터가 없으면 provider 가 null 을 반환한다. */
  durationMinutes: number;
  factors: PredictionFactor[];
  source: DataSourceInfo;
  /** Historical 데이터라면 사용된 관측 건수 (Mock 은 undefined) */
  sampleSize?: number;
}

export interface TravelTimeDataProvider {
  readonly source: DataSourceInfo;
  getTravelTime(query: TravelTimeQuery): Promise<TravelTimeData | null>;
}

export interface HolidayInfo {
  name: string;
}

export interface HolidayCalendar {
  /**
   * (선택) 이 날짜 계산에 필요한 공휴일 데이터를 미리 불러온다. API 기반 달력용.
   * 실패해도 던지지 않고, 해당 연도를 covers() === false 로 둔다.
   */
  prepare?(date: ISODate): Promise<void>;
  /** 이 날짜의 공휴일 정보를 보유하고 있는가 */
  covers(date: ISODate): boolean;
  getHoliday(date: ISODate): HolidayInfo | null;
}

export type { DayType };

/* ---------- 운행 중 버스 도착 정보 (고속버스도착정보) ---------- */

export type LiveTripStatus = "arrived" | "en-route" | "not-departed";

export interface LiveTrip {
  departureDate: ISODate;
  departureTime: ClockTime;
  status: LiveTripStatus;
  /** arrived: 도착 기록 시각 / en-route: 기준 시각의 도착 예정 / not-departed: null */
  arrival: { date: ISODate; time: ClockTime } | null;
  /** arrival 이 있을 때 출발~도착(예정) 분 */
  durationMinutes: number | null;
  remainingMinutes: number | null;
  grade: string | null;
  operator: string | null;
  location: string | null;
}

export interface LiveSnapshot {
  /** 데이터 기준 시각. 실시간이 아니다(실측상 20~35분 지연) — 화면에 반드시 표시 */
  basedAt: { date: ISODate; time: ClockTime } | null;
  trips: LiveTrip[];
  skipped: number;
}

export interface LiveArrivalProvider {
  readonly source: DataSourceInfo;
  /** 지원하지 않는 노선(시외버스 등)이면 null. 실패 시 ScheduleUnavailableError */
  getLiveSnapshot(routeId: string): Promise<LiveSnapshot | null>;
}
