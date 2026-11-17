import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TAGO_ROUTES } from "@/data/catalog/tago-routes";
import {
  HistoricalFirstTravelTimeDataProvider,
  HistoricalTravelTimeDataProvider,
} from "@/lib/data/historical-travel-time-provider";
import { MockTravelTimeDataProvider } from "@/lib/data/mock-travel-time-provider";
import { extractItems } from "@/lib/data/public-data/client";
import { parseArrivalSnapshot, type TagoArrivalItem } from "@/lib/data/tago/arrival";
import type { HolidayCalendar } from "@/lib/data/types";
import {
  mergeObservations,
  observationsFromSnapshot,
  parseJsonl,
  recentMonths,
  toJsonl,
  type ObservationRecord,
} from "@/lib/observations/record";
import { FileObservationStore, HttpObservationStore, type ObservationStore } from "@/lib/observations/store";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures/data-go-kr", name), "utf8"));
const snapshot = parseArrivalSnapshot(
  extractItems<TagoArrivalItem>(fixture("arrival-cheongju-seoulgyeongbu-20260926T1719.json")),
);
const ROUTE_ID = "cheongju-express__seoul-gyeongbu";
const route = TAGO_ROUTES.find((r) => r.id === ROUTE_ID)!;
const noHolidays: HolidayCalendar = { covers: () => true, getHoliday: () => null };
const NOW = () => new Date(Date.UTC(2026, 10, 17, 3));

function obs(date: string, time: string, minutes: number, extra: Partial<ObservationRecord> = {}): ObservationRecord {
  return {
    id: `${ROUTE_ID}@${date}T${time}`,
    routeId: ROUTE_ID,
    date,
    dayOfWeek: 2,
    departureTime: time,
    actualDurationMinutes: minutes,
    source: "historical",
    arrivalDate: date,
    arrivalTime: "00:00",
    grade: null,
    observedAt: "2026-11-17T00:00:00.000Z",
    feedBasedAt: null,
    arrivalAtFeedTime: false,
    ...extra,
  };
}

const memoryStore = (records: ObservationRecord[]): ObservationStore => ({
  description: "memory",
  loadMonths: async () => ({ records, skipped: 0 }),
});

describe("observationsFromSnapshot", () => {
  it("keeps only arrived trips, as real durations", () => {
    const records = observationsFromSnapshot(ROUTE_ID, snapshot, new Date("2026-09-26T08:19:00Z"));
    expect(records.map((r) => [r.departureTime, r.actualDurationMinutes])).toEqual([
      ["15:10", 86],
      ["15:20", 84],
    ]);
    expect(records[0]).toMatchObject({ id: `${ROUTE_ID}@2026-09-26T15:10`, dayOfWeek: 6, feedBasedAt: "2026-09-26T16:44" });
  });

  it("flags arrivals that coincide with the feed's base time (possibly detection time)", () => {
    const records = observationsFromSnapshot(ROUTE_ID, snapshot, new Date());
    // 15:20 편 도착 16:44 == 기준 시각 16:44
    expect(records.find((r) => r.departureTime === "15:20")?.arrivalAtFeedTime).toBe(true);
    expect(records.find((r) => r.departureTime === "15:10")?.arrivalAtFeedTime).toBe(false);
  });
});

describe("mergeObservations / JSONL", () => {
  it("dedupes by trip id and keeps the first observation", () => {
    const a = obs("2026-11-17", "08:00", 90);
    const { merged, added } = mergeObservations([a], [{ ...a, actualDurationMinutes: 99 }, obs("2026-11-17", "09:00", 95)]);
    expect(added).toBe(1);
    expect(merged.find((r) => r.id === a.id)?.actualDurationMinutes).toBe(90);
  });

  it("round-trips JSONL and skips broken lines", () => {
    const text = toJsonl([obs("2026-11-17", "08:00", 90)]) + "{broken\n" + JSON.stringify({ id: "x" }) + "\n";
    const { records, skipped } = parseJsonl(text);
    expect(records).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it("recomputes the feed-time flag for records written before the field existed", () => {
    const legacy = (feedBasedAt: string) => {
      const { arrivalAtFeedTime: _omit, ...rest } = obs("2026-11-17", "20:45", 104, { arrivalTime: "22:29", feedBasedAt });
      void _omit;
      return JSON.stringify(rest);
    };
    const { records } = parseJsonl(`${legacy("2026-11-17T22:29")}\n${legacy("2026-11-17T22:40")}\n`);
    expect(records.map((r) => r.arrivalAtFeedTime)).toEqual([true, false]);
  });

  it("lists recent months across a year boundary", () => {
    expect(recentMonths("2027-01-05", 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
  });
});

describe("observation stores", () => {
  it("reads monthly files from a directory and ignores missing months", async () => {
    const dir = mkdtempSync(join(tmpdir(), "busta-obs-"));
    writeFileSync(join(dir, "2026-11.jsonl"), toJsonl([obs("2026-11-17", "08:00", 90)]));
    const { records } = await new FileObservationStore(dir).loadMonths(["2026-11", "2026-10"]);
    expect(records).toHaveLength(1);
  });

  it("reads monthly files over HTTP, treating 404 as empty", async () => {
    const calls: string[] = [];
    const store = new HttpObservationStore("https://example.test/obs/", async (url) => {
      calls.push(url);
      return url.endsWith("2026-11.jsonl")
        ? new Response(toJsonl([obs("2026-11-17", "08:00", 90)]))
        : new Response("", { status: 404 });
    });
    const { records } = await store.loadMonths(["2026-11", "2026-10"]);
    expect(records).toHaveLength(1);
    expect(calls).toEqual(["https://example.test/obs/2026-11.jsonl", "https://example.test/obs/2026-10.jsonl"]);
  });
});

describe("HistoricalTravelTimeDataProvider", () => {
  // 2026-11-17, 11-10, 11-03 = 화요일 (평일)
  const weekday = [
    obs("2026-11-17", "08:00", 100),
    obs("2026-11-10", "08:10", 104),
    obs("2026-11-03", "07:40", 98),
    obs("2026-11-17", "08:30", 110),
    obs("2026-11-10", "08:50", 102),
  ];
  const query = { route, date: "2026-11-24", departureMinutes: 8 * 60 + 20, scheduledDurationMinutes: 90 };

  it("uses the median of same day-type, ±60 min samples once there are enough", async () => {
    const p = new HistoricalTravelTimeDataProvider(memoryStore(weekday), noHolidays, { now: NOW });
    const r = await p.lookup(query);
    expect(r.sampleSize).toBe(5);
    expect(r.data?.durationMinutes).toBe(102);
    expect(r.data?.source).toMatchObject({ kind: "historical", isRealData: true });
    expect(r.data?.source.description).toContain("5건(3일");
    expect(r.data?.factors[0].label).toContain("평일");
  });

  it("returns no prediction below the sample threshold", async () => {
    const p = new HistoricalTravelTimeDataProvider(memoryStore(weekday.slice(0, 4)), noHolidays, { now: NOW });
    const r = await p.lookup(query);
    expect(r).toMatchObject({ sampleSize: 4, data: null });
  });

  it("ignores other day types, other routes, far departures and feed-time arrivals", async () => {
    const noise = [
      obs("2026-11-15", "08:00", 150), // 일요일
      obs("2026-11-17", "11:00", 150), // 시간대 밖
      { ...obs("2026-11-17", "08:05", 150), routeId: "other", id: "o" },
      obs("2026-11-17", "08:15", 150, { arrivalAtFeedTime: true }),
    ];
    const p = new HistoricalTravelTimeDataProvider(memoryStore([...weekday, ...noise]), noHolidays, { now: NOW });
    expect((await p.lookup(query)).data?.durationMinutes).toBe(102);
  });
});

describe("HistoricalFirstTravelTimeDataProvider", () => {
  const mock = new MockTravelTimeDataProvider(noHolidays);
  const query = { route, date: "2026-11-24", departureMinutes: 8 * 60, scheduledDurationMinutes: 90 };

  it("falls back to the mock rules and says so", async () => {
    const p = new HistoricalFirstTravelTimeDataProvider(
      new HistoricalTravelTimeDataProvider(memoryStore([obs("2026-11-17", "08:00", 100)]), noHolidays, { now: NOW }),
      mock,
    );
    const data = await p.getTravelTime(query);
    expect(data?.source.kind).toBe("mock");
    expect(data?.notes?.join()).toContain("1건으로 기준(5건)에 못 미쳐");
  });

  it("falls back with a note when the store cannot be read", async () => {
    const broken: ObservationStore = { description: "x", loadMonths: async () => Promise.reject(new Error("down")) };
    const p = new HistoricalFirstTravelTimeDataProvider(new HistoricalTravelTimeDataProvider(broken, noHolidays), mock);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const data = await p.getTravelTime(query);
    spy.mockRestore();
    expect(data?.source.kind).toBe("mock");
    expect(data?.notes?.join()).toContain("불러오지 못해");
  });
});
