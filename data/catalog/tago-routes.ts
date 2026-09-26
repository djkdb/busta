/**
 * BUSTA 가 실제 시간표(TAGO)로 제공하는 노선 카탈로그.
 *
 * 터미널 ID·노선 존재 여부·소요시간은 2026-09-26 실제 API 응답으로 확인했다.
 *  - 청주 고속버스터미널(NAEK400)과 청주 시외버스터미널(NAI2839701)은 서로 다른 곳이므로
 *    사용자가 엉뚱한 터미널로 가지 않도록 별도 터미널로 둔다.
 *  - 동서울은 고속(NAEK032)·시외(NAI0511601) ID 가 다르지만 같은 터미널이다.
 *  - 청주↔수원, 청주↔대전은 고속버스 노선이 없고 시외버스 노선만 있다.
 *  - 수원→청주 방향은 TAGO 에 배차가 없다 (수원·서수원 → 청주 시외 터미널 5곳 모두 0건). 청주→수원만 제공.
 *
 * scheduledDurationMinutes 는 2026-09-26 시간표의 대표값이며, 실제 계산은 출발편별 값을 쓴다.
 * direction 은 BUSTA 의 교통 패턴 분류(수도권 유입/유출)로, TAGO 데이터가 아니다.
 */
import type { Route, Terminal, TrafficDirection } from "@/types/domain";

export interface TagoRouteRef {
  service: "express" | "intercity";
  depTerminalId: string;
  arrTerminalId: string;
}

export interface TagoRoute extends Route {
  tago: TagoRouteRef;
}

export const TAGO_TERMINALS: Terminal[] = [
  { id: "cheongju-express", name: "청주(고속)", fullName: "청주고속버스터미널" },
  { id: "cheongju-intercity", name: "청주(시외)", fullName: "청주시외버스터미널" },
  { id: "seoul-gyeongbu", name: "서울(경부)", fullName: "서울경부고속버스터미널" },
  { id: "dongseoul", name: "동서울", fullName: "동서울종합터미널" },
  { id: "suwon", name: "수원", fullName: "수원종합버스터미널" },
  { id: "daejeon", name: "대전복합", fullName: "대전복합터미널" },
];

const TAGO_IDS: Record<string, { express?: string; intercity?: string }> = {
  "cheongju-express": { express: "NAEK400" },
  "cheongju-intercity": { intercity: "NAI2839701" },
  "seoul-gyeongbu": { express: "NAEK010" },
  dongseoul: { express: "NAEK032", intercity: "NAI0511601" },
  suwon: { intercity: "NAI1658501" },
  daejeon: { intercity: "NAI3455101" },
};

type Pair = [
  origin: string,
  destination: string,
  service: "express" | "intercity",
  typical: number,
  dir: TrafficDirection,
  oneWay?: "one-way",
];

/** 기본은 왕복 쌍: [A, B, 서비스, 대표 소요(분), A→B 방향, (편도만이면 "one-way")] */
const PAIRS: Pair[] = [
  ["cheongju-express", "seoul-gyeongbu", "express", 90, "to-metro"],
  ["cheongju-express", "dongseoul", "express", 100, "to-metro"],
  ["cheongju-intercity", "dongseoul", "intercity", 100, "to-metro"],
  ["cheongju-intercity", "suwon", "intercity", 90, "to-metro", "one-way"],
  ["cheongju-intercity", "daejeon", "intercity", 60, "regional"],
];

const reverse = (d: TrafficDirection): TrafficDirection =>
  d === "to-metro" ? "from-metro" : d === "from-metro" ? "to-metro" : "regional";

function makeRoute(a: string, b: string, service: "express" | "intercity", typical: number, dir: TrafficDirection): TagoRoute {
  const dep = TAGO_IDS[a][service];
  const arr = TAGO_IDS[b][service];
  if (!dep || !arr) throw new Error(`TAGO ${service} ID 가 없는 터미널: ${a} → ${b}`);
  return {
    id: `${a}__${b}`,
    originId: a,
    destinationId: b,
    scheduledDurationMinutes: typical,
    direction: dir,
    busType: service,
    tago: { service, depTerminalId: dep, arrTerminalId: arr },
  };
}

export const TAGO_ROUTES: TagoRoute[] = PAIRS.flatMap(([a, b, service, typical, dir, oneWay]) => [
  makeRoute(a, b, service, typical, dir),
  ...(oneWay ? [] : [makeRoute(b, a, service, typical, reverse(dir))]),
]);
