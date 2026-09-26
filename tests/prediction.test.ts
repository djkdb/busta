import { describe, expect, it } from "vitest";
import { MOCK_PATTERN_RULES } from "@/data/mock/traffic-patterns";
import { classifyDay, StaticHolidayCalendar } from "@/lib/data/holiday-calendar";
import { MockTravelTimeDataProvider, ruleWeightAt } from "@/lib/data/mock-travel-time-provider";
import { compareNearbyDepartures, getHourlyProfile } from "@/lib/prediction/analytics";
import { MockPredictionEngine, ProviderPredictionEngine } from "@/lib/prediction/engine";
import { SampleScheduleDataProvider } from "@/lib/data/sample-schedule-provider";
import type { PredictionInput } from "@/lib/prediction/types";
import type { TravelTimeDataProvider } from "@/lib/data/types";

const engine = new MockPredictionEngine();
const calendar = new StaticHolidayCalendar();

// 2026-10-02 = 금요일, 2026-10-06 = 화요일, 2026-10-04 = 일요일, 2026-10-09 = 한글날(금)
const base: PredictionInput = {
  originId: "cheongju",
  destinationId: "seoul-gyeongbu",
  date: "2026-10-02",
  departureTime: "17:00",
};

async function predictOk(input: PredictionInput) {
  const result = await engine.predict(input);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result;
}

describe("classifyDay (요일 계산)", () => {
  it("classifies by weekday and holiday", () => {
    expect(classifyDay("2026-10-06", calendar)).toBe("weekday");
    expect(classifyDay("2026-10-02", calendar)).toBe("friday");
    expect(classifyDay("2026-10-10", calendar)).toBe("saturday");
    expect(classifyDay("2026-10-04", calendar)).toBe("sunday");
  });

  it("holiday overrides weekday (한글날이 금요일이어도 공휴일)", () => {
    expect(classifyDay("2026-10-09", calendar)).toBe("holiday");
  });

  it("reports whether a year is covered by holiday data", () => {
    expect(calendar.covers("2026-05-01")).toBe(true);
    expect(calendar.covers("2031-05-01")).toBe(false);
  });
});

describe("ruleWeightAt", () => {
  const evening = MOCK_PATTERN_RULES.find((r) => r.id === "weekday-evening-peak")!;
  const night = MOCK_PATTERN_RULES.find((r) => r.id === "late-night")!;

  it("ramps in and out at window edges instead of jumping", () => {
    expect(ruleWeightAt(evening, 16 * 60 + 59)).toBe(0);
    expect(ruleWeightAt(evening, 17 * 60 + 15)).toBeCloseTo(0.5);
    expect(ruleWeightAt(evening, 18 * 60)).toBe(1);
    expect(ruleWeightAt(evening, 20 * 60)).toBe(0);
  });

  it("handles windows that wrap past midnight", () => {
    expect(ruleWeightAt(night, 0)).toBe(1);
    expect(ruleWeightAt(night, 23 * 60 + 30)).toBe(1);
    expect(ruleWeightAt(night, 3 * 60)).toBe(1);
    expect(ruleWeightAt(night, 12 * 60)).toBe(0);
  });
});

describe("MockPredictionEngine — ETA", () => {
  it("computes predicted duration, arrival and delay consistently", async () => {
    const { prediction } = await predictOk(base);
    expect(prediction.scheduledDurationMinutes).toBe(100);
    expect(prediction.delayMinutes).toBe(
      prediction.predictedDurationMinutes - prediction.scheduledDurationMinutes,
    );
    const arrival = 17 * 60 + prediction.predictedDurationMinutes;
    expect(prediction.predictedArrival.time).toBe(
      `${String(Math.floor(arrival / 60)).padStart(2, "0")}:${String(arrival % 60).padStart(2, "0")}`,
    );
    expect(prediction.scheduledArrival.time).toBe("18:40");
  });

  it("Friday evening toward Seoul takes longer than the timetable", async () => {
    const { prediction } = await predictOk(base);
    expect(prediction.dayType).toBe("friday");
    expect(prediction.delayMinutes).toBeGreaterThan(15);
    expect(prediction.factors.map((f) => f.id)).toContain("friday-evening");
  });

  it("late night trips are shorter than the timetable", async () => {
    const { prediction } = await predictOk({ ...base, departureTime: "23:00" });
    expect(prediction.delayMinutes).toBeLessThan(0);
  });

  it("weekday evening: leaving Seoul is heavier than heading into Seoul", async () => {
    const toSeoul = await predictOk({ ...base, date: "2026-10-06", departureTime: "18:00" });
    const fromSeoul = await predictOk({
      ...base,
      originId: "seoul-gyeongbu",
      destinationId: "cheongju",
      date: "2026-10-06",
      departureTime: "18:00",
    });
    expect(fromSeoul.prediction.delayMinutes).toBeGreaterThan(toSeoul.prediction.delayMinutes);
  });

  it("Sunday afternoon return toward Seoul is heavier than on a weekday", async () => {
    const sunday = await predictOk({ ...base, date: "2026-10-04", departureTime: "16:00" });
    const tuesday = await predictOk({ ...base, date: "2026-10-06", departureTime: "16:00" });
    expect(sunday.prediction.predictedDurationMinutes).toBeGreaterThan(
      tuesday.prediction.predictedDurationMinutes,
    );
  });

  it("is deterministic (no randomness)", async () => {
    const a = await predictOk(base);
    const b = await predictOk(base);
    expect(a.prediction).toEqual(b.prediction);
  });

  it("crosses midnight: Friday 23:00 departure arrives on Saturday", async () => {
    const { prediction, isScheduledDeparture } = await predictOk({
      ...base,
      departureTime: "23:00",
    });
    expect(isScheduledDeparture).toBe(true); // 금·일 심야편
    expect(prediction.predictedArrival.date).toBe("2026-10-03");
    expect(prediction.predictedArrival.dayOffset).toBe(1);
  });

  it("labels holiday and exposes mock data status", async () => {
    const result = await predictOk({ ...base, date: "2026-10-09" });
    expect(result.prediction.dayType).toBe("holiday");
    expect(result.prediction.holidayName).toBe("한글날");
    expect(result.dataStatus.travelTime.kind).toBe("mock");
    expect(result.dataStatus.travelTime.isRealData).toBe(false);
    expect(result.dataStatus.schedule.isRealData).toBe(false);
  });

  it("notes when holiday data does not cover the date", async () => {
    const result = await predictOk({ ...base, date: "2031-10-03" });
    expect(result.dataStatus.notes.join()).toContain("공휴일 정보가 없어");
  });

  it("flags departures that are not in the timetable", async () => {
    const off = await predictOk({ ...base, departureTime: "17:05" });
    expect(off.isScheduledDeparture).toBe(false);
    // 23:00 심야편은 화요일엔 운행하지 않는다
    const tueLate = await predictOk({ ...base, date: "2026-10-06", departureTime: "23:00" });
    expect(tueLate.isScheduledDeparture).toBe(false);
  });
});

describe("MockPredictionEngine — invalid input", () => {
  it.each([
    [{ date: "2026-02-30" }, "INVALID_DATE"],
    [{ date: "" }, "INVALID_DATE"],
    [{ departureTime: "25:00" }, "INVALID_TIME"],
    [{ departureTime: "" }, "INVALID_TIME"],
    [{ destinationId: "cheongju" }, "SAME_ORIGIN_DESTINATION"],
    [{ originId: "busan" }, "UNKNOWN_TERMINAL"],
    [{ originId: "dongseoul", destinationId: "daejeon" }, "ROUTE_NOT_FOUND"],
  ] as const)("%o → %s", async (patch, code) => {
    const result = await engine.predict({ ...base, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("returns NO_TRAVEL_TIME_DATA when the provider has nothing", async () => {
    const empty: TravelTimeDataProvider = {
      source: { kind: "historical", label: "t", description: "t", isRealData: true },
      getTravelTime: async () => null,
    };
    const e = new ProviderPredictionEngine("empty", {
      schedules: new SampleScheduleDataProvider(),
      travelTime: empty,
      holidays: calendar,
    });
    const result = await e.predict(base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_TRAVEL_TIME_DATA");
  });
});

describe("MockTravelTimeDataProvider", () => {
  it("factor effects add up to the applied multiplier (explanation matches number)", async () => {
    const provider = new MockTravelTimeDataProvider(calendar);
    const route = (await new SampleScheduleDataProvider().findRoute("cheongju", "seoul-gyeongbu"))!;
    const data = await provider.getTravelTime({
      route,
      date: "2026-10-02",
      departureMinutes: 1020,
      scheduledDurationMinutes: route.scheduledDurationMinutes,
    });
    const sum = data.factors.reduce((acc, f) => acc + f.effect, 0);
    expect(Math.abs(route.scheduledDurationMinutes * (1 + sum) - data.durationMinutes)).toBeLessThan(1);
  });
});

describe("analytics", () => {
  it("hourly profile covers each hour and peaks in the evening on Friday", async () => {
    const hourly = await getHourlyProfile(engine, base);
    expect(hourly).toHaveLength(18); // 06~23시
    expect(hourly[0].departureTime).toBe("06:00");
    const at = (t: string) => hourly.find((p) => p.departureTime === t)!.predictedDurationMinutes;
    expect(at("17:00")).toBeGreaterThan(at("13:00"));
    expect(at("23:00")).toBeLessThan(at("13:00"));
  });

  it("hourly profile is empty for an invalid route", async () => {
    const hourly = await getHourlyProfile(engine, { ...base, originId: "dongseoul", destinationId: "daejeon" });
    expect(hourly).toEqual([]);
  });

  it("sample timetable filters departures by operating day", async () => {
    const provider = new SampleScheduleDataProvider();
    const times = async (date: string) =>
      (await provider.getTimetable("cheongju__seoul-gyeongbu", date)).departures.map((s) => s.departureTime);
    const fri = await times("2026-10-02");
    const tue = await times("2026-10-06");
    expect(fri).toContain("23:00");
    expect(tue).not.toContain("23:00");
  });

  it("compares nearby scheduled departures around the selected one", async () => {
    const { departures } = await new SampleScheduleDataProvider().getTimetable("cheongju__seoul-gyeongbu", base.date);
    const nearby = await compareNearbyDepartures(engine, { ...base, departureTime: "17:20" }, departures);
    // 40분 배차: 16:00 16:40 [17:20] 18:00 18:40
    expect(nearby.map((p) => p.departureTime)).toEqual(["16:00", "16:40", "17:20", "18:00", "18:40"]);
  });

  it("centers on the closest departure when the time is off-schedule", async () => {
    const { departures } = await new SampleScheduleDataProvider().getTimetable("cheongju__seoul-gyeongbu", base.date);
    const nearby = await compareNearbyDepartures(engine, { ...base, departureTime: "06:05" }, departures);
    expect(nearby[0].departureTime).toBe("06:00");
    expect(nearby).toHaveLength(3);
  });
});

describe("hourly profile ↔ ETA consistency", () => {
  it("includes the selected off-hour departure with the same numbers as the ETA", async () => {
    const input = { ...base, departureTime: "17:20" };
    const { prediction } = await predictOk(input);
    const hourly = await getHourlyProfile(engine, input, { minuteOffset: 20 });
    const point = hourly.find((p) => p.departureTime === "17:20");
    expect(point?.predictedDurationMinutes).toBe(prediction.predictedDurationMinutes);
    expect(point?.predictedArrivalTime).toBe(prediction.predictedArrival.time);
  });
});
