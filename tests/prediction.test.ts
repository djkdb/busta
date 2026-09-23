import { describe, expect, it } from "vitest";
import { predictionEngine, buildReport } from "../lib/prediction/service";
import { MockPredictionEngine } from "../lib/prediction/mock-prediction-engine";
import { arrivalAt, validateInput } from "../lib/utils/time";
const input = {
  routeId: "cheongju-seoul",
  date: "2026-09-18",
  departureTime: "17:00",
};
describe("deterministic mock predictions", () => {
  it("compares the sample baseline and computes arrival", async () => {
    const result = await predictionEngine.predict(input);
    expect(result).toMatchObject({
      durationMinutes: 128,
      differenceMinutes: 28,
      arrivalTime: "19:08",
      source: "mock",
      dayOffset: 0,
    });
    expect(await predictionEngine.predict(input)).toEqual(result);
  });
  it("distinguishes weekend and weekday afternoons", async () => {
    const weekday = await predictionEngine.predict({
      ...input,
      departureTime: "14:00",
    });
    const weekend = await predictionEngine.predict({
      ...input,
      date: "2026-09-19",
      departureTime: "14:00",
    });
    expect(weekend.durationMinutes).toBeGreaterThan(weekday.durationMinutes);
  });
  it("interpolates minute-level inputs", async () => {
    expect(
      (await predictionEngine.predict({ ...input, departureTime: "17:30" }))
        .durationMinutes,
    ).toBe(133);
  });
  it("supports faster nighttime results and midnight rollover", async () => {
    const result = await predictionEngine.predict({
      ...input,
      date: "2026-12-31",
      departureTime: "23:30",
    });
    expect(result.differenceMinutes).toBeLessThan(0);
    expect(result).toMatchObject({
      arrivalDate: "2027-01-01",
      arrivalTime: "01:05",
      dayOffset: 1,
    });
  });
  it("rejects unknown routes", async () => {
    await expect(
      predictionEngine.predict({ ...input, routeId: "missing" }),
    ).rejects.toThrow("지원하지 않는");
  });
  it("includes arbitrary selected times without duplicating whole hours", async () => {
    expect((await buildReport(input)).hourly).toHaveLength(18);
    const result = await buildReport({ ...input, departureTime: "03:45" });
    expect(result.hourly).toHaveLength(19);
    expect(result.hourly[0].input.departureTime).toBe("03:45");
  });
  it("accepts an alternative data provider without changing the engine", async () => {
    const engine = new MockPredictionEngine({
      getContext: async () => ({
        route: {
          id: "test",
          origin: "A",
          destination: "B",
          baselineMinutes: 80,
          source: "historical",
        },
        multiplier: 1.5,
        reasons: ["test fixture"],
        source: "historical",
      }),
    });
    expect(await engine.predict(input)).toMatchObject({
      durationMinutes: 120,
      source: "historical",
    });
  });
});
describe("Korean wall-clock validation", () => {
  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "invalid",
    "1999-01-01",
    "2100-01-01",
  ])("rejects invalid date %s", (date) =>
    expect(() => validateInput(date, "17:00")).toThrow(),
  );
  it.each(["24:00", "17:60", "9:00", "", "12:30:00"])(
    "rejects invalid time %s",
    (time) => expect(() => validateInput("2026-09-18", time)).toThrow(),
  );
  it("handles leap-day rollover", () =>
    expect(arrivalAt("2028-02-29", "23:50", 30)).toEqual({
      arrivalDate: "2028-03-01",
      arrivalTime: "00:20",
      dayOffset: 1,
    }));
});
