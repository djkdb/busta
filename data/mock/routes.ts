import type { BusRoute } from "../../types/prediction";

// All durations and route pairs are illustrative fixtures, NOT official timetables.
export const mockRoutes: BusRoute[] = [
  {
    id: "cheongju-seoul",
    origin: "청주",
    destination: "서울",
    baselineMinutes: 100,
    source: "mock",
  },
  {
    id: "seoul-cheongju",
    origin: "서울",
    destination: "청주",
    baselineMinutes: 100,
    source: "mock",
  },
  {
    id: "cheongju-daejeon",
    origin: "청주",
    destination: "대전",
    baselineMinutes: 55,
    source: "mock",
  },
  {
    id: "daejeon-cheongju",
    origin: "대전",
    destination: "청주",
    baselineMinutes: 55,
    source: "mock",
  },
  {
    id: "seoul-daejeon",
    origin: "서울",
    destination: "대전",
    baselineMinutes: 120,
    source: "mock",
  },
  {
    id: "daejeon-seoul",
    origin: "대전",
    destination: "서울",
    baselineMinutes: 120,
    source: "mock",
  },
];
