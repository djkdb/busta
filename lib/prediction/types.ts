import type {
  ClockTime,
  DataStatus,
  ISODate,
  Route,
  Terminal,
  TravelTimePrediction,
} from "@/types/domain";

export interface PredictionInput {
  originId: string;
  destinationId: string;
  date: ISODate;
  departureTime: ClockTime;
}

export type PredictionErrorCode =
  | "INVALID_DATE"
  | "INVALID_TIME"
  | "SAME_ORIGIN_DESTINATION"
  | "UNKNOWN_TERMINAL"
  | "ROUTE_NOT_FOUND"
  | "NO_TRAVEL_TIME_DATA";

export interface PredictionError {
  code: PredictionErrorCode;
  message: string;
}

export interface PredictionSuccess {
  ok: true;
  prediction: TravelTimePrediction;
  route: Route;
  origin: Terminal;
  destination: Terminal;
  /** 선택한 시각이 해당 날짜의 시간표에 있는 출발편인지 */
  isScheduledDeparture: boolean;
  dataStatus: DataStatus;
}

export type PredictionResult = PredictionSuccess | { ok: false; error: PredictionError };

/**
 * 예측 엔진. UI 는 이 인터페이스만 사용한다.
 * 구현: MockPredictionEngine → (HistoricalAverage / TrafficApi / ML)PredictionEngine
 */
export interface PredictionEngine {
  readonly id: string;
  predict(input: PredictionInput): Promise<PredictionResult>;
}
