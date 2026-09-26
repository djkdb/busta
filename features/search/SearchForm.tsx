"use client";

import Form from "next/form";
import { useMemo, useState } from "react";
import { getDayOfWeek, isValidDate, parseClockTime } from "@/lib/utils/time";
import type { BusSchedule, Route, Terminal } from "@/types/domain";

export interface SearchFormProps {
  terminals: Terminal[];
  routes: Route[];
  schedules: BusSchedule[];
  today: string;
  nowMinutes: number;
  initial?: { from?: string; to?: string; date?: string; time?: string };
}

const fieldClass =
  "w-full appearance-none rounded-xl border border-border bg-surface px-3 py-3 text-base font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function SearchForm({ terminals, routes, schedules, today, nowMinutes, initial }: SearchFormProps) {
  const origins = useMemo(
    () => terminals.filter((t) => routes.some((r) => r.originId === t.id)),
    [terminals, routes],
  );

  const [from, setFrom] = useState(initial?.from ?? origins[0]?.id ?? "");
  const destinations = terminals.filter((t) =>
    routes.some((r) => r.originId === from && r.destinationId === t.id),
  );
  const [toState, setTo] = useState(initial?.to ?? "");
  const to = destinations.some((d) => d.id === toState) ? toState : (destinations[0]?.id ?? "");

  const [date, setDate] = useState(initial?.date && isValidDate(initial.date) ? initial.date : today);

  const route = routes.find((r) => r.originId === from && r.destinationId === to);
  const departures = useMemo(() => {
    if (!route || !isValidDate(date)) return [];
    const dow = getDayOfWeek(date);
    return schedules
      .filter((s) => s.routeId === route.id && s.operatingDays.includes(dow))
      .map((s) => s.departureTime);
  }, [route, date, schedules]);

  // 오늘이면 지금 이후 첫 출발편, 아니면 17시 이후 첫 편을 기본값으로 둔다.
  const suggested = useMemo(() => {
    const after = date === today ? nowMinutes : 17 * 60;
    return departures.find((t) => (parseClockTime(t) ?? 0) >= after) ?? departures[0] ?? "";
  }, [departures, date, today, nowMinutes]);
  const [timeState, setTime] = useState(initial?.time ?? "");
  const time = departures.includes(timeState) ? timeState : suggested;

  const reversible = routes.some((r) => r.originId === to && r.destinationId === from);

  return (
    <Form action="/result" className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">출발</span>
            <select name="from" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass}>
              {origins.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!reversible}
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            aria-label="출발지와 도착지 바꾸기"
            className="mb-1 grid size-10 place-items-center rounded-full border border-border bg-surface-2 text-ink-2 disabled:opacity-40"
          >
            ⇄
          </button>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">도착</span>
            <select name="to" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass}>
              {destinations.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">날짜</span>
            <input
              type="date"
              name="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-3">출발시간</span>
            <select
              name="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldClass}
              disabled={departures.length === 0}
            >
              {departures.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        {departures.length === 0 && (
          <p className="mt-2 text-sm text-ink-3">선택한 날짜에 운행하는 출발편이 없습니다.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!route || !time}
        className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-40 dark:text-[#0b1020]"
      >
        예상 도착시간 보기
      </button>
    </Form>
  );
}
