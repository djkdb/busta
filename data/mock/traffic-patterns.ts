/**
 * ⚠️ MOCK 교통 패턴 규칙 — 실제 통계가 아닙니다.
 *
 * "평일 퇴근시간엔 수도권 유출 방향이 막힌다" 같은 일반적인 통념을 규칙으로 옮긴
 * 가정치(assumption)입니다. 각 effect 값은 측정된 값이 아니라 시연을 위해 정한 값이며,
 * Phase 4 에서 실제 통행시간 이력으로 보정(또는 대체)합니다.
 *
 * 규칙을 코드 속 숫자가 아니라 데이터로 둔 이유:
 *  1) 결과 화면에서 "왜 이 예측이 나왔는지"를 규칙 이름으로 설명할 수 있다.
 *  2) 실제 데이터가 들어왔을 때 어떤 가정이 틀렸는지 규칙 단위로 비교할 수 있다.
 */
import type { DayType, TrafficDirection } from "@/types/domain";

export interface PatternRule {
  id: string;
  label: string;
  dayTypes: DayType[];
  /** ["HH:MM", "HH:MM") — end 가 start 보다 이르면 자정을 넘기는 구간 */
  window: [string, string];
  /** 방향별 소요시간 변화율 (+0.2 = 20% 증가) */
  effect: Record<TrafficDirection, number>;
}

const ALL_DAYS: DayType[] = ["weekday", "friday", "saturday", "sunday", "holiday"];
const uniform = (v: number): Record<TrafficDirection, number> => ({
  "to-metro": v,
  "from-metro": v,
  regional: v,
});

/** 구간 시작/끝에서 효과가 0 → 최대로 서서히 변하는 시간(분). 경계에서 값이 튀는 것을 막는다. */
export const RAMP_MINUTES = 30;

export const MOCK_PATTERN_RULES: PatternRule[] = [
  {
    id: "weekday-morning-peak",
    label: "평일 출근 시간대",
    dayTypes: ["weekday", "friday"],
    window: ["06:30", "09:30"],
    effect: { "to-metro": 0.22, "from-metro": 0.1, regional: 0.1 },
  },
  {
    id: "weekday-evening-peak",
    label: "평일 퇴근 시간대",
    dayTypes: ["weekday", "friday"],
    window: ["17:00", "20:00"],
    effect: { "to-metro": 0.18, "from-metro": 0.25, regional: 0.12 },
  },
  {
    id: "friday-evening",
    label: "금요일 저녁 이동 수요",
    dayTypes: ["friday"],
    window: ["15:00", "21:30"],
    effect: { "to-metro": 0.1, "from-metro": 0.2, regional: 0.08 },
  },
  {
    id: "saturday-outbound",
    label: "토요일 오전 나들이 정체",
    dayTypes: ["saturday"],
    window: ["08:00", "12:30"],
    effect: { "to-metro": 0.05, "from-metro": 0.22, regional: 0.08 },
  },
  {
    id: "holiday-outbound",
    label: "공휴일 오전 출발 정체",
    dayTypes: ["holiday"],
    window: ["08:00", "12:30"],
    effect: { "to-metro": 0.05, "from-metro": 0.22, regional: 0.08 },
  },
  {
    id: "weekend-afternoon",
    label: "주말·공휴일 오후 정체",
    dayTypes: ["saturday", "sunday", "holiday"],
    window: ["12:00", "18:00"],
    effect: uniform(0.1),
  },
  {
    id: "sunday-return",
    label: "일요일·공휴일 귀가 정체",
    dayTypes: ["sunday", "holiday"],
    window: ["14:00", "21:30"],
    effect: { "to-metro": 0.28, "from-metro": 0.06, regional: 0.08 },
  },
  {
    id: "late-night",
    label: "심야 시간대 한산",
    dayTypes: ALL_DAYS,
    window: ["22:00", "05:00"],
    effect: uniform(-0.08),
  },
];
