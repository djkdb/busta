import { describe, expect, it } from "vitest";
import {
  addDays,
  addMinutesToDateTime,
  formatClockTime,
  formatDateKo,
  formatDelay,
  formatDuration,
  formatDurationCompact,
  getDayOfWeek,
  isValidDate,
  nowMinutesInKorea,
  parseClockTime,
  todayInKorea,
} from "@/lib/utils/time";

describe("isValidDate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDate("2026-10-02")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true); // 윤년
  });

  it("rejects impossible or malformed dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false); // 평년
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-00-10")).toBe(false);
    expect(isValidDate("2026-1-5")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate("not-a-date")).toBe(false);
  });
});

describe("parseClockTime / formatClockTime", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseClockTime("00:00")).toBe(0);
    expect(parseClockTime("17:00")).toBe(1020);
    expect(parseClockTime("23:59")).toBe(1439);
  });

  it("rejects invalid times", () => {
    expect(parseClockTime("24:00")).toBeNull();
    expect(parseClockTime("12:60")).toBeNull();
    expect(parseClockTime("7:00")).toBeNull();
    expect(parseClockTime("abc")).toBeNull();
  });

  it("formats and normalizes minutes past midnight", () => {
    expect(formatClockTime(1148)).toBe("19:08");
    expect(formatClockTime(1440 + 40)).toBe("00:40");
    expect(formatClockTime(-20)).toBe("23:40");
  });
});

describe("getDayOfWeek", () => {
  it("computes weekday independent of the host timezone", () => {
    expect(getDayOfWeek("2026-10-02")).toBe(5); // 금
    expect(getDayOfWeek("2026-10-04")).toBe(0); // 일
    expect(getDayOfWeek("2026-09-28")).toBe(1); // 월
    expect(getDayOfWeek("2028-02-29")).toBe(2); // 화 (윤일)
  });

  it("throws on invalid dates", () => {
    expect(() => getDayOfWeek("2026-02-30")).toThrow(RangeError);
  });
});

describe("addDays", () => {
  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("addMinutesToDateTime (예상 도착시간)", () => {
  it("adds predicted duration to departure: 17:00 + 128분 = 19:08", () => {
    expect(addMinutesToDateTime("2026-10-02", 17 * 60, 128)).toEqual({
      date: "2026-10-02",
      time: "19:08",
      dayOffset: 0,
    });
  });

  it("crosses midnight into the next day", () => {
    expect(addMinutesToDateTime("2026-10-02", 23 * 60, 100)).toEqual({
      date: "2026-10-03",
      time: "00:40",
      dayOffset: 1,
    });
  });

  it("arriving exactly at midnight counts as the next day", () => {
    expect(addMinutesToDateTime("2026-12-31", 22 * 60, 120)).toEqual({
      date: "2027-01-01",
      time: "00:00",
      dayOffset: 1,
    });
  });

  it("rounds fractional durations", () => {
    expect(addMinutesToDateTime("2026-10-02", 600, 99.6).time).toBe("11:40");
  });

  it("rejects negative or non-finite durations", () => {
    expect(() => addMinutesToDateTime("2026-10-02", 600, -1)).toThrow(RangeError);
    expect(() => addMinutesToDateTime("2026-10-02", 600, Number.NaN)).toThrow(RangeError);
  });
});

describe("Korea time helpers", () => {
  it("uses KST (UTC+9) for today, even late in the UTC day", () => {
    // 2026-10-01 16:30 UTC == 2026-10-02 01:30 KST
    const now = new Date(Date.UTC(2026, 9, 1, 16, 30));
    expect(todayInKorea(now)).toBe("2026-10-02");
    expect(nowMinutesInKorea(now)).toBe(90);
  });
});

describe("formatters", () => {
  it("formats durations in Korean", () => {
    expect(formatDuration(100)).toBe("1시간 40분");
    expect(formatDuration(128)).toBe("2시간 8분");
    expect(formatDuration(45)).toBe("45분");
    expect(formatDuration(120)).toBe("2시간");
    expect(formatDurationCompact(128)).toBe("2h 08m");
    expect(formatDurationCompact(45)).toBe("45m");
  });

  it("formats delay with explicit sign", () => {
    expect(formatDelay(28)).toBe("+28분");
    expect(formatDelay(-6)).toBe("-6분");
    expect(formatDelay(0)).toBe("±0분");
    expect(formatDelay(65)).toBe("+1시간 5분");
  });

  it("formats Korean date labels", () => {
    expect(formatDateKo("2026-10-02")).toBe("10월 2일 (금)");
  });
});
