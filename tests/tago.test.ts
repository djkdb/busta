/**
 * TAGO / 특일정보 연동 테스트.
 * tests/fixtures/data-go-kr 의 JSON 은 2026-09-26 실제 API 응답을 그대로 저장한 것이다 (서비스 키 미포함).
 * 네트워크를 쓰지 않도록 fetch 를 주입한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TAGO_ROUTES, TAGO_TERMINALS } from "@/data/catalog/tago-routes";
import { KasiHolidayCalendar, parseKasiHolidays } from "@/lib/data/kasi-holiday-calendar";
import { MockTravelTimeDataProvider } from "@/lib/data/mock-travel-time-provider";
import { extractItems, PublicDataApiError, PublicDataClient, type FetchLike } from "@/lib/data/public-data/client";
import { parseTagoDateTime, parseTagoSchedules, type TagoScheduleItem } from "@/lib/data/tago/parse";
import { TagoScheduleDataProvider } from "@/lib/data/tago/tago-schedule-provider";
import { parseArrivalSnapshot, type TagoArrivalItem } from "@/lib/data/tago/arrival";
import { TagoLiveArrivalProvider, toArrivalTerminalCode } from "@/lib/data/tago/tago-live-arrival-provider";
import { ScheduleUnavailableError } from "@/lib/data/types";
import { ProviderPredictionEngine } from "@/lib/prediction/engine";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures/data-go-kr", name), "utf8");
const json = (name: string) => JSON.parse(fixture(name));

const EXPRESS_CJ_SEOUL = "express-cheongju-seoulgyeongbu-20260926.json";
const EXPRESS_SEOUL_CJ = "express-seoulgyeongbu-cheongju-20260926.json";
const INTERCITY_CJ_SUWON = "intercity-cheongju-suwon-20260926.json";
const EMPTY = "express-empty.json";

const SECRET = "test-secret-key-0000";
// 2026-09-26 12:00 KST
const NOW = () => new Date(Date.UTC(2026, 8, 26, 3, 0));

/** URL 의 (출발, 도착, 날짜)에 따라 fixture 를 돌려주는 가짜 fetch */
function fakeFetch(table: Record<string, string>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    const q = new URL(url).searchParams;
    const key = `${q.get("depTerminalId")}>${q.get("arrTerminalId")}@${q.get("depPlandTime")}`;
    const name = table[key] ?? EMPTY;
    const status = name === "error-invalid-key.json" ? 403 : 200;
    return new Response(fixture(name), { status });
  };
}

function provider(table: Record<string, string>, calls: string[] = []) {
  const client = new PublicDataClient({ serviceKey: SECRET, fetch: fakeFetch(table, calls), sleep: async () => {} });
  return new TagoScheduleDataProvider(client, TAGO_TERMINALS, TAGO_ROUTES, { now: NOW });
}

describe("parseTagoDateTime", () => {
  it("parses 12-digit express and 14-digit intercity formats", () => {
    expect(parseTagoDateTime(202609260550)).toEqual({ date: "2026-09-26", time: "05:50", minutes: 350 });
    expect(parseTagoDateTime(20260926071600)).toEqual({ date: "2026-09-26", time: "07:16", minutes: 436 });
  });

  it("normalizes 24:00 to 00:00 of the next day (seen in real data)", () => {
    expect(parseTagoDateTime(202609262400)).toEqual({ date: "2026-09-27", time: "00:00", minutes: 0 });
  });

  it("rejects malformed values", () => {
    expect(parseTagoDateTime(undefined)).toBeNull();
    expect(parseTagoDateTime("2026092605")).toBeNull();
    expect(parseTagoDateTime(202609262430)).toBeNull();
    expect(parseTagoDateTime(202609261260)).toBeNull();
    expect(parseTagoDateTime(202602300900)).toBeNull();
  });
});

describe("parseTagoSchedules (real responses)", () => {
  it("parses the Cheongju → Seoul Gyeongbu timetable: 123 departures, 90 minutes each", () => {
    const { departures, skipped } = parseTagoSchedules(extractItems<TagoScheduleItem>(json(EXPRESS_CJ_SEOUL)));
    expect(skipped).toBe(0);
    expect(departures).toHaveLength(123);
    expect(new Set(departures.map((d) => d.durationMinutes))).toEqual(new Set([90]));
    expect(departures[0]).toMatchObject({ departure: { time: "05:50" }, grade: "우등", charge: 13300 });
  });

  it("computes duration across midnight (23:30 → 01:00 = 90분)", () => {
    const { departures } = parseTagoSchedules(extractItems<TagoScheduleItem>(json(EXPRESS_CJ_SEOUL)));
    const last = departures.at(-1)!;
    expect(last.departure.time).toBe("23:30");
    expect(last.durationMinutes).toBe(90);
  });

  it("keeps per-departure durations for intercity (85분 / 90분)", () => {
    const { departures } = parseTagoSchedules(extractItems<TagoScheduleItem>(json(INTERCITY_CJ_SUWON)));
    expect(departures).toHaveLength(24);
    expect(new Set(departures.map((d) => d.durationMinutes))).toEqual(new Set([85, 90]));
  });

  it("skips (and counts) broken items instead of hiding them", () => {
    const { departures, skipped } = parseTagoSchedules([
      { depPlandTime: 202609260550, arrPlandTime: 202609260720 },
      { depPlandTime: 202609260550 },
      { depPlandTime: 202609260800, arrPlandTime: 202609260700 },
    ]);
    expect(departures).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe("extractItems", () => {
  it("normalizes empty, single-object and array item shapes", () => {
    expect(extractItems(json(EMPTY))).toEqual([]);
    expect(extractItems({ response: { body: { items: "" } } })).toEqual([]);
    expect(extractItems({ response: { body: { items: { item: { a: 1 } } } } })).toEqual([{ a: 1 }]);
  });
});

describe("PublicDataClient", () => {
  it("maps the real invalid-key response to an auth error without retrying", async () => {
    const calls: string[] = [];
    const client = new PublicDataClient({
      serviceKey: SECRET,
      fetch: async (url) => {
        calls.push(url);
        return new Response(fixture("error-invalid-key.json"), { status: 403 });
      },
      sleep: async () => {},
    });
    const error = (await client.getJson("/x", {}).catch((e: unknown) => e)) as PublicDataApiError;
    expect(error).toBeInstanceOf(PublicDataApiError);
    expect(error.kind).toBe("auth");
    expect(error.message).toContain("등록되지 않은 서비스키");
    expect(calls).toHaveLength(1);
  });

  it("retries transient network failures, then succeeds", async () => {
    let n = 0;
    const client = new PublicDataClient({
      serviceKey: SECRET,
      fetch: async () => {
        if (n++ < 2) throw new TypeError("socket hang up");
        return new Response(fixture(EMPTY));
      },
      sleep: async () => {},
    });
    await expect(client.getJson("/x", {})).resolves.toBeTruthy();
    expect(n).toBe(3);
  });

  it("never puts the service key in error messages", async () => {
    const client = new PublicDataClient({
      serviceKey: SECRET,
      fetch: async () => {
        throw new TypeError(`fetch failed for https://apis.data.go.kr/x?serviceKey=${SECRET}`);
      },
      sleep: async () => {},
    });
    const error = (await client.getJson("/x", {}).catch((e: unknown) => e)) as PublicDataApiError;
    expect(error.kind).toBe("network");
    expect(String(error.message)).not.toContain(SECRET);
    expect(String(error.stack)).not.toContain(SECRET);
  });

  it("sends the key with the service-specific parameter name", async () => {
    const calls: string[] = [];
    const client = new PublicDataClient({ serviceKey: SECRET, fetch: fakeFetch({}, calls) });
    await client.getJson("/a", {}, "ServiceKey");
    expect(new URL(calls[0]).searchParams.get("ServiceKey")).toBe(SECRET);
    expect(new URL(calls[0]).searchParams.get("_type")).toBe("json");
  });
});

describe("TagoScheduleDataProvider", () => {
  const CJ_SEOUL = "cheongju-express__seoul-gyeongbu";
  const SEOUL_CJ = "seoul-gyeongbu__cheongju-express";

  it("returns the real timetable for a published date", async () => {
    const tt = await provider({ "NAEK400>NAEK010@20260926": EXPRESS_CJ_SEOUL }).getTimetable(CJ_SEOUL, "2026-09-26");
    expect(tt.referenceDate).toBe("2026-09-26");
    expect(tt.departures).toHaveLength(123);
    expect(tt.departures[0]).toMatchObject({ departureTime: "05:50", scheduledDurationMinutes: 90, grade: "우등" });
    expect(tt.source.isRealData).toBe(true);
    expect(tt.notes).toEqual([]);
  });

  it("moves a 24:00 departure into the next day's timetable", async () => {
    const table = { "NAEK010>NAEK400@20260926": EXPRESS_SEOUL_CJ };
    const p = provider(table);
    const sat = await p.getTimetable(SEOUL_CJ, "2026-09-26");
    const sun = await p.getTimetable(SEOUL_CJ, "2026-09-27");
    expect(sat.departures.map((d) => d.departureTime)).not.toContain("00:00");
    expect(sat.departures).toHaveLength(137);
    expect(sun.departures[0]).toMatchObject({ departureTime: "00:00", scheduledDurationMinutes: 90 });
  });

  it("uses a clearly labelled reference timetable for dates not yet published", async () => {
    // 10/2(금)는 0건. 공개된 날 중 오늘(9/26 토)과 내일(9/27 일)만 있다고 가정 → 평일 성격이 같은 날이 없으면 첫 공개일
    const tt = await provider({ "NAEK400>NAEK010@20260926": EXPRESS_CJ_SEOUL }).getTimetable(CJ_SEOUL, "2026-10-02");
    expect(tt.date).toBe("2026-10-02");
    expect(tt.referenceDate).toBe("2026-09-26");
    expect(tt.departures).toHaveLength(123);
    expect(tt.notes.join()).toContain("아직 공개되지 않아");
  });

  it("prefers a reference day with the same weekend/weekday character", async () => {
    const p = provider({
      "NAEK400>NAEK010@20260926": EXPRESS_CJ_SEOUL, // 토
      "NAEK400>NAEK010@20260927": EXPRESS_CJ_SEOUL, // 일
    });
    // 10/4(일) → 주말 성격이 같은 9/26(토)
    expect((await p.getTimetable(CJ_SEOUL, "2026-10-04")).referenceDate).toBe("2026-09-26");
  });

  it("treats an empty result inside the published window as 'no service', not as missing data", async () => {
    const tt = await provider({}).getTimetable(CJ_SEOUL, "2026-09-26");
    expect(tt.departures).toEqual([]);
    expect(tt.referenceDate).toBe("2026-09-26");
    expect(tt.notes).toEqual([]);
  });

  it("caches service-day responses", async () => {
    const calls: string[] = [];
    const p = provider({ "NAEK400>NAEK010@20260926": EXPRESS_CJ_SEOUL }, calls);
    await p.getTimetable(CJ_SEOUL, "2026-09-26");
    const after = calls.length;
    await p.getTimetable(CJ_SEOUL, "2026-09-26");
    expect(calls.length).toBe(after);
  });

  it("wraps API failures in ScheduleUnavailableError", async () => {
    const client = new PublicDataClient({
      serviceKey: SECRET,
      fetch: async () => new Response(fixture("error-invalid-key.json"), { status: 403 }),
      sleep: async () => {},
    });
    const p = new TagoScheduleDataProvider(client, TAGO_TERMINALS, TAGO_ROUTES, { now: NOW });
    await expect(p.getTimetable(CJ_SEOUL, "2026-09-26")).rejects.toBeInstanceOf(ScheduleUnavailableError);
  });

  it("catalog routes are round trips except verified one-way ones, with service-specific IDs", () => {
    const ids = new Set(TAGO_ROUTES.map((r) => r.id));
    const oneWay = TAGO_ROUTES.filter((r) => !ids.has(`${r.destinationId}__${r.originId}`)).map((r) => r.id);
    expect(oneWay).toEqual(["cheongju-intercity__suwon"]); // 수원→청주는 TAGO 에 배차 없음 (실측)
    const dongseoul = TAGO_ROUTES.filter((r) => r.destinationId === "dongseoul").map((r) => r.tago.arrTerminalId);
    expect(dongseoul.sort()).toEqual(["NAEK032", "NAI0511601"]);
  });
});

describe("KasiHolidayCalendar (real response)", () => {
  it("parses holidays including ones the hand-written list originally missed", () => {
    const h = parseKasiHolidays(json("kasi-holidays-2026.json"));
    expect(Object.keys(h)).toHaveLength(22);
    expect(h["2026-05-01"]).toBe("노동절");
    expect(h["2026-07-17"]).toBe("제헌절");
    expect(h["2026-10-09"]).toBe("한글날");
  });

  it("loads a year on prepare() and reports coverage", async () => {
    const fetchSpy = vi.fn<FetchLike>(async () => new Response(fixture("kasi-holidays-2026.json")));
    const cal = new KasiHolidayCalendar(new PublicDataClient({ serviceKey: SECRET, fetch: fetchSpy }));
    expect(cal.covers("2026-10-09")).toBe(false);
    await cal.prepare("2026-10-09");
    await cal.prepare("2026-03-01");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cal.covers("2026-10-09")).toBe(true);
    expect(cal.getHoliday("2026-10-09")?.name).toBe("한글날");
    expect(cal.getHoliday("2026-10-08")).toBeNull();
  });

  it("leaves the year uncovered when the API fails (no silent fallback)", async () => {
    const cal = new KasiHolidayCalendar(
      new PublicDataClient({
        serviceKey: SECRET,
        fetch: async () => new Response(fixture("error-invalid-key.json"), { status: 403 }),
        sleep: async () => {},
      }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await cal.prepare("2026-10-09");
    spy.mockRestore();
    expect(cal.covers("2026-10-09")).toBe(false);
  });
});

describe("engine with real TAGO timetable", () => {
  const holidays = { covers: () => true, getHoliday: () => null };
  const make = (table: Record<string, string>) => {
    const schedules = provider(table);
    return new ProviderPredictionEngine("tago-mock", {
      schedules,
      travelTime: new MockTravelTimeDataProvider(holidays),
      holidays,
    });
  };

  it("uses the departure's own scheduled duration and grade", async () => {
    const engine = make({ "NAI2839701>NAI1658501@20260926": INTERCITY_CJ_SUWON });
    const r = await engine.predict({
      originId: "cheongju-intercity",
      destinationId: "suwon",
      date: "2026-09-26",
      departureTime: "07:16",
    });
    if (!r.ok) throw new Error(r.error.code);
    expect(r.isScheduledDeparture).toBe(true);
    expect(r.departure?.grade).toBe("일반");
    expect(r.prediction.scheduledDurationMinutes).toBe(90);
    expect(r.prediction.scheduledArrival.time).toBe("08:46");
    expect(r.dataStatus.schedule.label).toContain("시외버스");
  });

  it("returns SCHEDULE_UNAVAILABLE when the timetable API fails", async () => {
    const client = new PublicDataClient({
      serviceKey: SECRET,
      fetch: async () => {
        throw new TypeError("offline");
      },
      sleep: async () => {},
    });
    const engine = new ProviderPredictionEngine("x", {
      schedules: new TagoScheduleDataProvider(client, TAGO_TERMINALS, TAGO_ROUTES, { now: NOW }),
      travelTime: new MockTravelTimeDataProvider(holidays),
      holidays,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await engine.predict({
      originId: "cheongju-express",
      destinationId: "seoul-gyeongbu",
      date: "2026-09-26",
      departureTime: "17:00",
    });
    spy.mockRestore();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SCHEDULE_UNAVAILABLE");
  });
});

describe("parseArrivalSnapshot (real 2026-09-26 17:19 KST response)", () => {
  const load = (name: string) => parseArrivalSnapshot(extractItems<TagoArrivalItem>(json(name)));

  it("derives the data's base time (not real time) from arrival − remaining", () => {
    // 조회는 17:19 에 했지만 데이터 기준은 16:44 였다
    expect(load("arrival-cheongju-seoulgyeongbu-20260926T1719.json").basedAt).toEqual({ date: "2026-09-26", time: "16:44" });
  });

  it("reads arrived trips as actual durations", () => {
    const { trips } = load("arrival-cheongju-seoulgyeongbu-20260926T1719.json");
    const arrived = trips.filter((t) => t.status === "arrived");
    expect(arrived.map((t) => [t.departureTime, t.arrival?.time, t.durationMinutes])).toEqual([
      ["15:10", "16:36", 86],
      ["15:20", "16:44", 84],
    ]);
  });

  it("keeps en-route estimates with location and remaining minutes", () => {
    const trip = load("arrival-cheongju-seoulgyeongbu-20260926T1719.json").trips.find((t) => t.departureTime === "15:30")!;
    expect(trip).toMatchObject({ status: "en-route", remainingMinutes: 5, location: "양재IC", durationMinutes: 79, grade: "프리미엄" });
  });

  it("drops meaningless estimates for buses that have not departed yet", () => {
    // 16:50, 17:00 출발편이 모두 '18:02 도착'으로 온 값 → 기준 시각(16:44) 이후 출발이므로 예정시각을 쓰지 않는다
    const { trips } = load("arrival-seoulgyeongbu-cheongju-20260926T1719.json");
    for (const time of ["16:50", "17:00"]) {
      expect(trips.find((t) => t.departureTime === time)).toMatchObject({ status: "not-departed", arrival: null, durationMinutes: null });
    }
  });

  it("handles trips that cross midnight", () => {
    const { trips } = parseArrivalSnapshot([{ depTm: "23:30", arrPrdtTm: "2026-09-27 01:00", rmnTm: "도착완료" }]);
    expect(trips[0]).toMatchObject({ departureDate: "2026-09-26", departureTime: "23:30", durationMinutes: 90 });
  });

  it("counts malformed rows instead of hiding them", () => {
    const snap = parseArrivalSnapshot([{ depTm: "15:10", arrPrdtTm: "2026-09-26 16:36", rmnTm: "곧 도착" }, { depTm: "x" }]);
    expect(snap.skipped).toBe(2);
  });
});

describe("TagoLiveArrivalProvider", () => {
  it("maps NAEK terminal IDs to arrival codes and supports only express routes", async () => {
    expect(toArrivalTerminalCode("NAEK400")).toBe("400");
    expect(toArrivalTerminalCode("NAI2839701")).toBeNull();
    const calls: string[] = [];
    const client = new PublicDataClient({
      serviceKey: SECRET,
      fetch: async (url) => {
        calls.push(url);
        return new Response(fixture("arrival-cheongju-seoulgyeongbu-20260926T1719.json"));
      },
    });
    const live = new TagoLiveArrivalProvider(client, TAGO_ROUTES);
    const snap = await live.getLiveSnapshot("cheongju-express__seoul-gyeongbu");
    expect(snap?.trips.length).toBe(11);
    expect(new URL(calls[0]).searchParams.get("depTmnCd")).toBe("400");
    expect(new URL(calls[0]).searchParams.get("arrTmnCd")).toBe("010");
    expect(await live.getLiveSnapshot("cheongju-intercity__daejeon")).toBeNull();
  });

  it("reports the header-only error shape as an API error", async () => {
    const client = new PublicDataClient({
      serviceKey: SECRET,
      fetch: async () => new Response(fixture("arrival-error-missing-param.json")),
    });
    const error = (await client.getJson("/x", {}).catch((e: unknown) => e)) as PublicDataApiError;
    expect(error.kind).toBe("api");
    expect(error.message).toContain("99");
  });
});
