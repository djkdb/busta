import { describe, expect, it } from "vitest";
import { SampleScheduleDataProvider } from "@/lib/data/sample-schedule-provider";
import { MockPredictionEngine } from "@/lib/prediction/engine";
import {
  classifySlack,
  planByTargetArrival,
  selectWindow,
  type PlanInput,
  type PlanStatus,
} from "@/lib/prediction/planner";

const engine = new MockPredictionEngine();
const schedules = new SampleScheduleDataProvider();

// 2026-10-02 = 금요일. 서울(경부) → 청주, 19:00까지 도착
const fridayToCheongju: PlanInput = {
  originId: "seoul-gyeongbu",
  destinationId: "cheongju",
  date: "2026-10-02",
  arriveBy: "19:00",
};

async function planOk(input: PlanInput) {
  const result = await planByTargetArrival(engine, schedules, input);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result;
}

describe("classifySlack", () => {
  it("classifies by slack against the target", () => {
    expect(classifySlack(30, 15)).toBe("on-time");
    expect(classifySlack(15, 15)).toBe("on-time");
    expect(classifySlack(14, 15)).toBe("tight");
    expect(classifySlack(0, 15)).toBe("tight"); // 정각 도착은 늦지 않음
    expect(classifySlack(-1, 15)).toBe("late");
  });
});

describe("selectWindow", () => {
  const mk = (...s: PlanStatus[]) => s.map((status, i) => ({ status, i }));

  it("centers on the latest non-late option", () => {
    const all = mk("on-time", "on-time", "on-time", "tight", "late", "late", "late");
    expect(selectWindow(all, 2, 2).map((o) => o.i)).toEqual([1, 2, 3, 4, 5]);
  });

  it("clips at the start and end of the day", () => {
    expect(selectWindow(mk("tight", "late"), 2, 2).map((o) => o.i)).toEqual([0, 1]);
  });

  it("shows the earliest options when everything is late", () => {
    expect(selectWindow(mk("late", "late", "late", "late"), 2, 2).map((o) => o.i)).toEqual([0, 1, 2]);
  });
});

describe("planByTargetArrival", () => {
  it("computes slack from predicted arrival for every departure", async () => {
    const plan = await planOk(fridayToCheongju);
    for (const o of plan.options) {
      const [h, m] = o.predictedArrival.time.split(":").map(Number);
      const arrival = o.predictedArrival.dayOffset * 1440 + h * 60 + m;
      expect(o.slackMinutes).toBe(19 * 60 - arrival);
    }
  });

  it("finds the latest departure predicted to arrive by the target", async () => {
    const plan = await planOk(fridayToCheongju);
    expect(plan.latestOnTime).not.toBeNull();
    expect(plan.latestOnTime!.slackMinutes).toBeGreaterThanOrEqual(0);
    // 그 이후 출발편은 모두 늦는다
    const later = plan.options.filter((o) => o.departureTime > plan.latestOnTime!.departureTime);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((o) => o.status === "late")).toBe(true);
  });

  it("latestComfortable has at least the tight-slack buffer", async () => {
    const plan = await planOk(fridayToCheongju);
    expect(plan.latestComfortable!.slackMinutes).toBeGreaterThanOrEqual(plan.tightSlackMinutes);
    expect(plan.latestComfortable!.departureTime <= plan.latestOnTime!.departureTime).toBe(true);
  });

  it("flags timetable traps: on time by the timetable, late by prediction", async () => {
    const plan = await planOk(fridayToCheongju);
    // 17:20 출발: 시간표상 19:00 도착(목표 이내)이지만 금요일 저녁 정체로 예상은 늦음
    const trap = plan.timetableTraps.find((o) => o.departureTime === "17:20");
    expect(trap).toBeDefined();
    expect(trap!.scheduledArrival.time).toBe("19:00");
    expect(trap!.timetableOnTime).toBe(true);
    expect(trap!.status).toBe("late");
    for (const t of plan.timetableTraps) {
      expect(t.timetableOnTime && t.status === "late").toBe(true);
    }
  });

  it("treats arrivals after midnight as late for a same-day target", async () => {
    // 금요일 23:00 청주 → 서울: 다음날 00:xx 도착
    const plan = await planOk({
      originId: "cheongju",
      destinationId: "seoul-gyeongbu",
      date: "2026-10-02",
      arriveBy: "23:59",
    });
    const late = plan.options.find((o) => o.departureTime === "23:00");
    expect(late?.predictedArrival.dayOffset).toBe(1);
    expect(late?.status).toBe("late");
    expect(plan.latestOnTime!.departureTime).toBe("22:00");
  });

  it("returns no on-time option when the target is before any arrival", async () => {
    const plan = await planOk({ ...fridayToCheongju, arriveBy: "06:30" });
    expect(plan.latestOnTime).toBeNull();
    expect(plan.latestComfortable).toBeNull();
    expect(plan.options[0].departureTime).toBe("06:00");
    expect(plan.options.every((o) => o.status === "late")).toBe(true);
  });

  it("only uses departures that run on that weekday", async () => {
    const tue = await planOk({ ...fridayToCheongju, date: "2026-10-06", arriveBy: "23:59" });
    const fri = await planOk({ ...fridayToCheongju, arriveBy: "23:59" });
    expect(fri.totalDepartures - tue.totalDepartures).toBe(1); // 금·일 23:10 심야편
  });

  it("exposes mock data status", async () => {
    const plan = await planOk(fridayToCheongju);
    expect(plan.dataStatus?.travelTime.isRealData).toBe(false);
  });

  it.each([
    [{ arriveBy: "24:00" }, "INVALID_TIME"],
    [{ arriveBy: "" }, "INVALID_TIME"],
    [{ date: "2026-02-30" }, "INVALID_DATE"],
    [{ destinationId: "seoul-gyeongbu" }, "SAME_ORIGIN_DESTINATION"],
    [{ originId: "busan" }, "UNKNOWN_TERMINAL"],
    [{ originId: "dongseoul", destinationId: "daejeon" }, "ROUTE_NOT_FOUND"],
  ] as const)("%o → %s", async (patch, code) => {
    const result = await planByTargetArrival(engine, schedules, { ...fridayToCheongju, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });
});
