/**
 * ⚠️ 예시(SAMPLE) 시간표 — 공식 데이터가 아닙니다.
 *
 * 노선·배차·소요시간은 UI/로직 검증을 위해 사람이 만든 예시 값이며, 실제 운수사 시간표와
 * 다를 수 있습니다. Phase 3 에서 공공데이터포털 TAGO 고속/시외버스 API 등 실제 시간표로
 * 교체합니다. (docs/data-sources.md 참고)
 */
import type { BusSchedule, DayOfWeek, Route, Terminal } from "@/types/domain";

export const SAMPLE_TERMINALS: Terminal[] = [
  { id: "cheongju", name: "청주", fullName: "청주고속버스터미널" },
  { id: "seoul-gyeongbu", name: "서울(경부)", fullName: "서울경부고속버스터미널" },
  { id: "dongseoul", name: "동서울", fullName: "동서울종합터미널" },
  { id: "suwon", name: "수원", fullName: "수원종합버스터미널" },
  { id: "daejeon", name: "대전", fullName: "대전복합터미널" },
];

type RouteSeed = Omit<Route, "id">;

const ROUTE_SEEDS: RouteSeed[] = [
  { originId: "cheongju", destinationId: "seoul-gyeongbu", scheduledDurationMinutes: 100, direction: "to-metro", busType: "express" },
  { originId: "seoul-gyeongbu", destinationId: "cheongju", scheduledDurationMinutes: 100, direction: "from-metro", busType: "express" },
  { originId: "cheongju", destinationId: "dongseoul", scheduledDurationMinutes: 110, direction: "to-metro", busType: "intercity" },
  { originId: "dongseoul", destinationId: "cheongju", scheduledDurationMinutes: 110, direction: "from-metro", busType: "intercity" },
  { originId: "cheongju", destinationId: "suwon", scheduledDurationMinutes: 90, direction: "to-metro", busType: "intercity" },
  { originId: "suwon", destinationId: "cheongju", scheduledDurationMinutes: 90, direction: "from-metro", busType: "intercity" },
  { originId: "cheongju", destinationId: "daejeon", scheduledDurationMinutes: 60, direction: "regional", busType: "intercity" },
  { originId: "daejeon", destinationId: "cheongju", scheduledDurationMinutes: 60, direction: "regional", busType: "intercity" },
];

export const SAMPLE_ROUTES: Route[] = ROUTE_SEEDS.map((seed) => ({
  id: `${seed.originId}__${seed.destinationId}`,
  ...seed,
}));

const EVERY_DAY: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
/** 심야 증편 예시: 금·일요일만 운행 */
const FRI_SUN: DayOfWeek[] = [0, 5];

/** start~end 사이를 interval 분 간격으로 채운 출발시각 목록 */
function departures(start: string, end: string, intervalMinutes: number): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += intervalMinutes) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

const SCHEDULE_SEEDS: Record<string, { regular: string[]; lateNight?: string[] }> = {
  "cheongju__seoul-gyeongbu": { regular: departures("06:00", "22:00", 40), lateNight: ["23:00"] },
  "seoul-gyeongbu__cheongju": { regular: departures("06:00", "22:00", 40), lateNight: ["23:10"] },
  "cheongju__dongseoul": { regular: departures("06:30", "21:30", 60) },
  "dongseoul__cheongju": { regular: departures("06:30", "21:30", 60) },
  "cheongju__suwon": { regular: departures("06:20", "20:20", 60) },
  "suwon__cheongju": { regular: departures("06:50", "20:50", 60) },
  "cheongju__daejeon": { regular: departures("06:00", "22:00", 30) },
  "daejeon__cheongju": { regular: departures("06:10", "22:10", 30) },
};

export const SAMPLE_SCHEDULES: BusSchedule[] = Object.entries(SCHEDULE_SEEDS).flatMap(
  ([routeId, { regular, lateNight = [] }]) => [
    ...regular.map((departureTime) => ({ routeId, departureTime, operatingDays: EVERY_DAY })),
    ...lateNight.map((departureTime) => ({ routeId, departureTime, operatingDays: FRI_SUN })),
  ].map((s) => ({ id: `${s.routeId}@${s.departureTime}`, ...s })),
);
