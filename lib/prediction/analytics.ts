/**
 * 시간대별 분석 / 출발시간 비교.
 * 모든 계산은 PredictionEngine 인터페이스만 사용하므로 엔진이 바뀌어도 그대로 동작한다.
 */
import { formatClockTime, getDayOfWeek, parseClockTime } from "@/lib/utils/time";
import type { BusSchedule, ClockTime, ISODate } from "@/types/domain";
import type { PredictionEngine, PredictionInput } from "./types";

export interface DeparturePoint {
  departureTime: ClockTime;
  scheduledDurationMinutes: number;
  predictedDurationMinutes: number;
  delayMinutes: number;
  predictedArrivalTime: ClockTime;
  arrivalDayOffset: number;
}

type RouteDay = { originId: string; destinationId: string; date: ISODate };

async function toPoint(
  engine: PredictionEngine,
  input: PredictionInput,
): Promise<DeparturePoint | null> {
  const result = await engine.predict(input);
  if (!result.ok) return null;
  const p = result.prediction;
  return {
    departureTime: p.departureTime,
    scheduledDurationMinutes: p.scheduledDurationMinutes,
    predictedDurationMinutes: p.predictedDurationMinutes,
    delayMinutes: p.delayMinutes,
    predictedArrivalTime: p.predictedArrival.time,
    arrivalDayOffset: p.predictedArrival.dayOffset,
  };
}

/**
 * 1시간 간격 출발을 가정한 시간대별 예상 소요시간 (기본 06~23시).
 * minuteOffset 을 선택한 출발시각의 "분"으로 주면(17:20 → 20) 시리즈에 선택 출발편이
 * 그대로 포함되어, 차트와 상단 ETA 숫자가 항상 일치한다.
 */
export async function getHourlyProfile(
  engine: PredictionEngine,
  query: RouteDay,
  {
    fromHour = 6,
    toHour = 23,
    minuteOffset = 0,
  }: { fromHour?: number; toHour?: number; minuteOffset?: number } = {},
): Promise<DeparturePoint[]> {
  const points: DeparturePoint[] = [];
  for (let h = fromHour; h <= toHour; h++) {
    const departureTime = formatClockTime(h * 60 + minuteOffset);
    const point = await toPoint(engine, { ...query, departureTime });
    if (point) points.push(point);
  }
  return points;
}

/** 해당 날짜에 운행하는 시간표 출발편만 추린다 */
export function schedulesForDate(schedules: BusSchedule[], date: ISODate): BusSchedule[] {
  const dow = getDayOfWeek(date);
  return schedules.filter((s) => s.operatingDays.includes(dow));
}

/**
 * 선택한 출발편 앞뒤 `span`개의 시간표 출발편 예측을 비교한다.
 * 선택 시각이 시간표에 없으면 가장 가까운 편을 중심으로 삼는다.
 */
export async function compareNearbyDepartures(
  engine: PredictionEngine,
  input: PredictionInput,
  schedules: BusSchedule[],
  span = 2,
): Promise<DeparturePoint[]> {
  const target = parseClockTime(input.departureTime);
  const day = schedulesForDate(schedules, input.date);
  if (target === null || day.length === 0) return [];

  let center = 0;
  day.forEach((s, i) => {
    const diff = Math.abs(parseClockTime(s.departureTime)! - target);
    if (diff < Math.abs(parseClockTime(day[center].departureTime)! - target)) center = i;
  });

  const picked = day.slice(Math.max(0, center - span), center + span + 1);
  const points = await Promise.all(
    picked.map((s) => toPoint(engine, { ...input, departureTime: s.departureTime })),
  );
  return points.filter((p): p is DeparturePoint => p !== null);
}
