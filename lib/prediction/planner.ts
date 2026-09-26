/**
 * 목표 도착시각 역산 (Phase 6).
 *
 * "서울에 19:00까지 도착해야 한다" → 그날의 시간표 출발편마다 예상 도착을 계산해
 * 목표 대비 여유(slack)를 비교한다.
 *
 * BUSTA 의 차별점은 "시간표상으로는 제시간이지만 예상으로는 늦는 출발편"(timetableTrap)을
 * 드러내는 것이다. 기존 시간표 서비스에서는 이 편들이 문제없어 보인다.
 *
 * 표현 원칙: 근거 데이터가 Mock 인 동안 "추천/최적"이라 하지 않고 "예상 기준" 비교만 한다.
 * 여유 기준(tightSlackMinutes)은 통계가 아니라 화면 분류를 위한 UI 규칙이다.
 */
import { ScheduleUnavailableError, type ScheduleDataProvider, type Timetable } from "@/lib/data/types";
import { isValidDate, MINUTES_PER_DAY, parseClockTime } from "@/lib/utils/time";
import type {
  ArrivalTime,
  ClockTime,
  DataStatus,
  ISODate,
  Route,
  Terminal,
} from "@/types/domain";
import type { PredictionEngine, PredictionError } from "./types";

export type PlanStatus = "on-time" | "tight" | "late";

export interface PlanInput {
  originId: string;
  destinationId: string;
  /** 출발일. 목표 도착시각도 이 날짜 기준이다. */
  date: ISODate;
  arriveBy: ClockTime;
}

export interface PlanOption {
  departureTime: ClockTime;
  scheduledDurationMinutes: number;
  predictedDurationMinutes: number;
  scheduledArrival: ArrivalTime;
  predictedArrival: ArrivalTime;
  /** 목표 - 예상 도착 (분). 음수면 늦음 */
  slackMinutes: number;
  status: PlanStatus;
  /** 시간표상 도착은 목표 이내인가 */
  timetableOnTime: boolean;
  /** 시간표로는 제시간이지만 예상으로는 늦는 편 */
  timetableTrap: boolean;
}

export interface PlanOptions {
  /** 이 값 미만의 여유는 "여유 적음"으로 분류 (UI 규칙) */
  tightSlackMinutes?: number;
  /** 늦지 않는 마지막 편 이전으로 보여줄 편 수 */
  maxBefore?: number;
  /** 늦지 않는 마지막 편 이후로 보여줄 편 수 */
  maxAfter?: number;
}

export interface PlanSuccess {
  ok: true;
  origin: Terminal;
  destination: Terminal;
  route: Route;
  date: ISODate;
  arriveBy: ClockTime;
  tightSlackMinutes: number;
  /** 화면에 보여줄 구간 (출발시각순) */
  options: PlanOption[];
  /** 예상 기준으로 늦지 않는 마지막 출발편 (on-time 또는 tight) */
  latestOnTime: PlanOption | null;
  /** 여유 기준까지 만족하는 마지막 출발편 */
  latestComfortable: PlanOption | null;
  /** 해당 날짜 전체 출발편 중 timetableTrap 인 편 */
  timetableTraps: PlanOption[];
  totalDepartures: number;
  /** 해당 날짜 운행편이 없으면 null */
  dataStatus: DataStatus | null;
}

export type PlanResult = PlanSuccess | { ok: false; error: PredictionError };

const toAbsoluteMinutes = (a: ArrivalTime) => a.dayOffset * MINUTES_PER_DAY + parseClockTime(a.time)!;

/** 여유시간 → 상태 분류 (순수 함수) */
export function classifySlack(slackMinutes: number, tightSlackMinutes: number): PlanStatus {
  if (slackMinutes < 0) return "late";
  if (slackMinutes < tightSlackMinutes) return "tight";
  return "on-time";
}

/**
 * 보여줄 구간 선택: 늦지 않는 마지막 편을 기준으로 앞 maxBefore 편, 뒤 maxAfter 편.
 * 모두 늦으면 가장 이른 편들을 보여준다.
 */
export function selectWindow<T extends { status: PlanStatus }>(
  all: T[],
  maxBefore: number,
  maxAfter: number,
): T[] {
  let anchor = -1;
  all.forEach((o, i) => {
    if (o.status !== "late") anchor = i;
  });
  if (anchor === -1) return all.slice(0, maxAfter + 1);
  return all.slice(Math.max(0, anchor - maxBefore), anchor + 1 + maxAfter);
}

export async function planByTargetArrival(
  engine: PredictionEngine,
  schedules: ScheduleDataProvider,
  input: PlanInput,
  { tightSlackMinutes = 15, maxBefore = 2, maxAfter = 2 }: PlanOptions = {},
): Promise<PlanResult> {
  const target = parseClockTime(input.arriveBy);
  if (target === null) {
    return { ok: false, error: { code: "INVALID_TIME", message: "도착 희망 시각 형식이 올바르지 않습니다. (예: 19:00)" } };
  }
  if (!isValidDate(input.date)) {
    return { ok: false, error: { code: "INVALID_DATE", message: "날짜 형식이 올바르지 않습니다. (예: 2026-10-02)" } };
  }

  const route = await schedules.findRoute(input.originId, input.destinationId);
  if (!route) {
    // 같은 출발/도착, 알 수 없는 터미널, 노선 없음 판정과 메시지는 엔진의 검증을 그대로 쓴다.
    const probe = await engine.predict({ ...input, departureTime: "12:00" });
    if (!probe.ok) return probe;
    return { ok: false, error: { code: "ROUTE_NOT_FOUND", message: "노선 정보가 없습니다." } };
  }

  const terminals = await schedules.listTerminals();
  const origin = terminals.find((t) => t.id === route.originId)!;
  const destination = terminals.find((t) => t.id === route.destinationId)!;
  let timetable: Timetable;
  try {
    timetable = await schedules.getTimetable(route.id, input.date);
  } catch (e) {
    if (!(e instanceof ScheduleUnavailableError)) throw e;
    console.error(`[BUSTA] ${e.message}`);
    return {
      ok: false,
      error: { code: "SCHEDULE_UNAVAILABLE", message: "시간표 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
    };
  }
  const day = timetable.departures;

  const all: PlanOption[] = [];
  let dataStatus: DataStatus | null = null;
  for (const s of day) {
    const result = await engine.predict({ ...input, departureTime: s.departureTime });
    if (!result.ok) return result;
    const p = result.prediction;
    dataStatus ??= result.dataStatus;

    const slackMinutes = target - toAbsoluteMinutes(p.predictedArrival);
    const status = classifySlack(slackMinutes, tightSlackMinutes);
    const timetableOnTime = toAbsoluteMinutes(p.scheduledArrival) <= target;
    all.push({
      departureTime: p.departureTime,
      scheduledDurationMinutes: p.scheduledDurationMinutes,
      predictedDurationMinutes: p.predictedDurationMinutes,
      scheduledArrival: p.scheduledArrival,
      predictedArrival: p.predictedArrival,
      slackMinutes,
      status,
      timetableOnTime,
      timetableTrap: timetableOnTime && status === "late",
    });
  }

  const lastWhere = (pred: (o: PlanOption) => boolean) =>
    [...all].reverse().find(pred) ?? null;

  return {
    ok: true,
    origin,
    destination,
    route,
    date: input.date,
    arriveBy: input.arriveBy,
    tightSlackMinutes,
    options: selectWindow(all, maxBefore, maxAfter),
    latestOnTime: lastWhere((o) => o.status !== "late"),
    latestComfortable: lastWhere((o) => o.status === "on-time"),
    timetableTraps: all.filter((o) => o.timetableTrap),
    totalDepartures: all.length,
    dataStatus,
  };
}
