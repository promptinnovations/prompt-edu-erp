/**
 * PROMPT EDU ERP — unit tests for services/datetime/ist.ts, added for the
 * "Timing used across the app should be IST" fix. The bug this guards
 * against: production runs on a UTC server, and code that computed "today"
 * via `new Date().toISOString().slice(0, 10)` (or read local Date getters
 * off `new Date()`) silently used the server's UTC calendar day instead of
 * India's. That's wrong for the whole IST morning - from 00:00 IST up to
 * 05:29 IST, UTC is still on the *previous* calendar day. The tests below
 * pin the system clock to exactly that window (and to other UTC-day-
 * boundary-crossing instants) and assert the IST-correct calendar values
 * come out, which a naive UTC-based read would get wrong.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentMonthIST,
  daysAgoIST,
  formatDateIST,
  formatDateTimeIST,
  formatTimeIST,
  istWeekday,
  monthsAgoIST,
  nowISTYear,
  startOfMonthIST,
  startOfWeekIST,
  todayIST,
} from "../../services/datetime/ist";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayIST()", () => {
  it("is one day ahead of the naive UTC date during the IST-morning gap (00:00-05:29 IST)", () => {
    // 2026-09-20T19:00:00Z = 2026-09-21T00:30:00+05:30 - already the next
    // calendar day in IST, but still "2026-09-20" by UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T19:00:00.000Z"));
    expect(todayIST()).toBe("2026-09-21");
    // proves this is exactly the bug being guarded against: the old,
    // naive pattern used throughout the app before this fix.
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-09-20");
  });

  it("matches the UTC date once past the IST/UTC crossover", () => {
    // 2026-09-21T10:00:00Z = 2026-09-21T15:30:00+05:30 - same calendar day both ways.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T10:00:00.000Z"));
    expect(todayIST()).toBe("2026-09-21");
  });

  it("rolls IST over at exactly 18:30 UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T18:29:59.000Z"));
    expect(todayIST()).toBe("2026-09-20");
    vi.setSystemTime(new Date("2026-09-20T18:30:00.000Z"));
    expect(todayIST()).toBe("2026-09-21");
  });
});

describe("currentMonthIST() / nowISTYear() / istWeekday()", () => {
  it("rolls the month over in IST before UTC midnight on the last day of the month", () => {
    // 2026-09-30T19:00:00Z = 2026-10-01T00:30:00+05:30 - already October in IST.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T19:00:00.000Z"));
    expect(currentMonthIST()).toBe("2026-10");
  });

  it("rolls the year over in IST before UTC midnight on Dec 31", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T19:00:00.000Z"));
    expect(nowISTYear()).toBe(2027);
  });

  it("computes weekday from IST wall-clock, not UTC", () => {
    // 2026-09-20 is a Sunday. 2026-09-20T19:00:00Z is already Monday in IST.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T19:00:00.000Z"));
    expect(istWeekday()).toBe(1); // Monday
  });
});

describe("daysAgoIST() / monthsAgoIST()", () => {
  it("counts back from the IST calendar date, not the UTC one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T19:00:00.000Z")); // IST today = 2026-09-21
    expect(daysAgoIST(0)).toBe("2026-09-21");
    expect(daysAgoIST(1)).toBe("2026-09-20");
    expect(daysAgoIST(14)).toBe("2026-09-07");
  });

  it("counts back whole months from the IST calendar month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T19:00:00.000Z")); // IST current month = 2026-10
    expect(monthsAgoIST(0)).toBe("2026-10");
    expect(monthsAgoIST(2)).toBe("2026-08");
  });
});

describe("startOfWeekIST() / startOfMonthIST()", () => {
  it("returns the Monday on/before the IST today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T19:00:00.000Z")); // IST today = Mon 2026-09-21
    expect(startOfWeekIST()).toBe("2026-09-21");
    vi.setSystemTime(new Date("2026-09-23T06:00:00.000Z")); // IST today = Wed 2026-09-23
    expect(startOfWeekIST()).toBe("2026-09-21");
  });

  it("returns the 1st of the IST current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T19:00:00.000Z")); // IST current month = 2026-10
    expect(startOfMonthIST()).toBe("2026-10-01");
  });
});

describe("formatDateIST() / formatDateTimeIST() / formatTimeIST()", () => {
  it("formats a bare date-only string as the same IST calendar date regardless of ambient timezone", () => {
    expect(formatDateIST("2026-09-21")).toBe("21 Sept 2026");
  });

  it("formats a full UTC instant converted to IST wall-clock time", () => {
    // 2026-09-21T18:35:00Z = 2026-09-22T00:05:00+05:30
    const s = formatDateTimeIST("2026-09-21T18:35:00.000Z");
    expect(s).toContain("22 Sept 2026");
    expect(s).toMatch(/12:05\s*am/i);
  });

  it("formats only the time portion in IST", () => {
    expect(formatTimeIST("2026-09-21T12:00:00.000Z")).toMatch(/5:30\s*pm/i);
  });
});
