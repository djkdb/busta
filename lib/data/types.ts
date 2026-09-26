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
  DataSourceInfo,
  DayType,
  ISODate,
  PredictionFactor,
  Route,
  Terminal,
} from "@/types/domain";

export interface ScheduleDataProvider {
  readonly source: DataSourceInfo;
  listTerminals(): Promise<Terminal[]>;
  listRoutes(): Promise<Route[]>;
  findRoute(originId: string, destinationId: string): Promise<Route | null>;
  listSchedules(routeId: string): Promise<BusSchedule[]>;
}

export interface TravelTimeQuery {
  route: Route;
  date: ISODate;
  /** 자정 기준 분 */
  departureMinutes: number;
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
  /** 이 날짜의 공휴일 정보를 보유하고 있는가 */
  covers(date: ISODate): boolean;
  getHoliday(date: ISODate): HolidayInfo | null;
}

export type { DayType };
