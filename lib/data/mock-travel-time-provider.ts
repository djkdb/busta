/**
 * ⚠️ Mock 소요시간 제공자 — 실제 데이터가 아닌 규칙 기반 가정 패턴.
 *
 * 계산 방식
 *   1. 시간표 소요시간 동안(출발 ~ 시간표상 도착) 5분 간격으로 샘플 시점을 잡는다.
 *   2. 각 시점의 날짜 분류(평일/금/토/일/공휴일)와 시각에 해당하는 패턴 규칙 효과를 구한다.
 *      → 버스가 "출발하는 순간"이 아니라 "도로 위에 있는 동안"의 혼잡을 반영한다.
 *      → 23:00 출발처럼 자정을 넘기면 샘플 시점의 날짜/요일이 바뀐다.
 *   3. 효과의 평균을 기준 소요시간에 곱한다.
 *
 * 랜덤 값은 쓰지 않는다. 같은 입력이면 항상 같은 결과가 나와야 테스트·설명이 가능하다.
 */
import { MOCK_PATTERN_RULES, RAMP_MINUTES, type PatternRule } from "@/data/mock/traffic-patterns";
import { addMinutesToDateTime, MINUTES_PER_DAY, parseClockTime } from "@/lib/utils/time";
import type { PredictionFactor } from "@/types/domain";
import { classifyDay } from "./holiday-calendar";
import { MOCK_PATTERN_SOURCE } from "./sources";
import type {
  HolidayCalendar,
  TravelTimeData,
  TravelTimeDataProvider,
  TravelTimeQuery,
} from "./types";

const SAMPLE_STEP_MINUTES = 5;
/** 설명 목록에 노출할 최소 효과 (0.5%) */
const MIN_VISIBLE_EFFECT = 0.005;

/** 규칙 구간 안에서의 가중치 0~1 (경계에서 RAMP_MINUTES 동안 선형 증가/감소) */
export function ruleWeightAt(rule: PatternRule, minuteOfDay: number): number {
  const start = parseClockTime(rule.window[0]);
  const rawEnd = parseClockTime(rule.window[1]);
  if (start === null || rawEnd === null) throw new Error(`Invalid window in rule ${rule.id}`);
  const end = rawEnd > start ? rawEnd : rawEnd + MINUTES_PER_DAY;

  const trapezoid = (x: number) =>
    Math.min(1, Math.max(0, Math.min(x - start, end - x) / RAMP_MINUTES));
  // 자정을 넘는 구간(22:00~05:00)은 다음날 새벽 시각을 +24h 로 펼쳐서 판정한다.
  return Math.max(trapezoid(minuteOfDay), trapezoid(minuteOfDay + MINUTES_PER_DAY));
}

export class MockTravelTimeDataProvider implements TravelTimeDataProvider {
  readonly source = MOCK_PATTERN_SOURCE;

  constructor(
    private readonly calendar: HolidayCalendar,
    private readonly rules: PatternRule[] = MOCK_PATTERN_RULES,
  ) {}

  async getTravelTime({
    route,
    date,
    departureMinutes,
    scheduledDurationMinutes: base,
  }: TravelTimeQuery): Promise<TravelTimeData> {
    const sampleCount = Math.max(1, Math.ceil(base / SAMPLE_STEP_MINUTES));
    const totals = new Map<string, number>();

    for (let i = 0; i < sampleCount; i++) {
      const offset = Math.min(base, (i + 0.5) * SAMPLE_STEP_MINUTES);
      const at = addMinutesToDateTime(date, departureMinutes, offset);
      const dayType = classifyDay(at.date, this.calendar);
      const minuteOfDay = parseClockTime(at.time)!;

      for (const rule of this.rules) {
        if (!rule.dayTypes.includes(dayType)) continue;
        const contribution = rule.effect[route.direction] * ruleWeightAt(rule, minuteOfDay);
        if (contribution !== 0) totals.set(rule.id, (totals.get(rule.id) ?? 0) + contribution);
      }
    }

    const factors: PredictionFactor[] = [];
    let multiplier = 1;
    for (const rule of this.rules) {
      const avg = (totals.get(rule.id) ?? 0) / sampleCount;
      multiplier += avg;
      if (Math.abs(avg) >= MIN_VISIBLE_EFFECT) {
        factors.push({ id: rule.id, label: rule.label, effect: Math.round(avg * 1000) / 1000 });
      }
    }
    factors.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

    return {
      routeId: route.id,
      durationMinutes: Math.round(base * multiplier),
      factors,
      source: this.source,
    };
  }
}
