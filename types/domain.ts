/**
 * BUSTA 도메인 모델.
 *
 * 규칙
 * - 날짜는 항상 한국 현지 날짜 문자열 "YYYY-MM-DD" (ISODate)
 * - 시각은 "HH:MM" 문자열(ClockTime) 또는 자정 기준 분(minute) 정수
 * - 소요시간은 모두 "분" 단위 정수
 * - 모든 데이터에는 출처(DataSourceInfo)가 붙는다. 출처 없는 숫자는 만들지 않는다.
 */

/** "YYYY-MM-DD" (Asia/Seoul 현지 날짜) */
export type ISODate = string;
/** "HH:MM" 24시간제 */
export type ClockTime = string;

/** 0 = 일요일 … 6 = 토요일 (JS Date#getDay 와 동일) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 교통 패턴 관점의 날짜 분류 */
export type DayType = "weekday" | "friday" | "saturday" | "sunday" | "holiday";

/**
 * 노선의 교통 흐름 방향.
 * 수도권 유입/유출 방향에 따라 출퇴근·주말 정체 패턴이 반대로 나타나기 때문에 분리한다.
 */
export type TrafficDirection = "to-metro" | "from-metro" | "regional";

export interface Terminal {
  id: string;
  /** 화면 표시용 짧은 이름 (예: "청주") */
  name: string;
  /** 실제 터미널 명칭 (예: "청주고속버스터미널") */
  fullName: string;
}

export interface Route {
  id: string;
  originId: string;
  destinationId: string;
  /** 시간표에 표기되는 고정 소요시간(분) */
  scheduledDurationMinutes: number;
  direction: TrafficDirection;
  busType: "express" | "intercity";
}

export interface BusSchedule {
  id: string;
  routeId: string;
  departureTime: ClockTime;
  operatingDays: DayOfWeek[];
}

/** 실제 관측된 운행 1건. Phase 3~4(Historical)에서 채워진다. */
export interface TravelTimeObservation {
  id: string;
  routeId: string;
  date: ISODate;
  dayOfWeek: DayOfWeek;
  departureTime: ClockTime;
  actualDurationMinutes: number;
  source: DataSourceKind;
}

export type DataSourceKind =
  | "sample" // 사람이 만든 예시 데이터 (시간표 등)
  | "mock" // 규칙 기반 가정 패턴 (실제 통계 아님)
  | "historical" // 실제 운행/통행 기록 집계
  | "traffic-api" // 실시간·예측 교통 API
  | "model"; // 학습된 예측 모델

export interface DataSourceInfo {
  kind: DataSourceKind;
  /** 짧은 표시명 (예: "시연용 예측 데이터") */
  label: string;
  /** 사용자에게 보여줄 설명 */
  description: string;
  /** 실제 관측/공식 데이터 여부. false 인 데이터는 UI 에서 반드시 경고한다. */
  isRealData: boolean;
}

/** 예측값에 영향을 준 요인. "왜 이 숫자인가"를 설명하기 위해 사용한다. */
export interface PredictionFactor {
  id: string;
  label: string;
  /** 소요시간 변화율 (+0.18 = 18% 증가). 설명 목적이며 합산 결과는 predictedDuration 에 반영됨 */
  effect: number;
}

export interface ArrivalTime {
  date: ISODate;
  time: ClockTime;
  /** 출발일 대비 며칠 뒤 도착인지 (자정 넘김 = 1) */
  dayOffset: number;
}

export interface TravelTimePrediction {
  routeId: string;
  date: ISODate;
  dayOfWeek: DayOfWeek;
  dayType: DayType;
  holidayName: string | null;
  departureTime: ClockTime;
  scheduledDurationMinutes: number;
  predictedDurationMinutes: number;
  scheduledArrival: ArrivalTime;
  predictedArrival: ArrivalTime;
  /** predicted - scheduled (음수면 시간표보다 빠름) */
  delayMinutes: number;
  factors: PredictionFactor[];
  source: DataSourceInfo;
}

/** 결과 화면의 "데이터 상태" */
export interface DataStatus {
  schedule: DataSourceInfo;
  travelTime: DataSourceInfo;
  notes: string[];
}
