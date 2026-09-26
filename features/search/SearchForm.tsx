"use client";

import Form from "next/form";
import { useEffect, useMemo, useState } from "react";
import type { TimetableResponse } from "@/app/api/timetable/route";
import { isValidDate, parseClockTime } from "@/lib/utils/time";
import type { Route, Terminal } from "@/types/domain";

export interface SearchFormProps {
  terminals: Terminal[];
  routes: Route[];
  today: string;
  nowMinutes: number;
  initial?: { from?: string; to?: string; date?: string; time?: string; arriveBy?: string };
}

type Mode = "depart" | "arrive";

const fieldClass =
  "w-full appearance-none rounded-xl border border-border bg-surface px-3 py-3 text-base font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

type TimetableState =
  | { key: string; status: "ok"; data: TimetableResponse }
  | { key: string; status: "error"; message: string };

/**
 * 노선·날짜별 시간표를 서버(/api/timetable)에서 가져온다.
 * 실제 시간표(TAGO)는 날짜마다 다르고 API 키는 서버에만 있으므로 클라이언트가 직접 부르지 않는다.
 */
function useTimetable(from: string, to: string, date: string) {
  const key = from && to && isValidDate(date) ? `${from}|${to}|${date}` : "";
  const [state, setState] = useState<TimetableState | null>(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/timetable?${new URLSearchParams({ from, to, date })}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "시간표를 불러오지 못했습니다.");
        setState({ key, status: "ok", data: body as TimetableResponse });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key, status: "error", message: e instanceof Error ? e.message : "시간표를 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [key, from, to, date]);

  if (!key) return { loading: false, data: null, error: null };
  if (state?.key !== key) return { loading: true, data: null, error: null };
  return state.status === "ok"
    ? { loading: false, data: state.data, error: null }
    : { loading: false, data: null, error: state.message };
}

export function SearchForm({ terminals, routes, today, nowMinutes, initial }: SearchFormProps) {
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
  const timetable = useTimetable(route ? from : "", route ? to : "", date);
  const departureList = useMemo(() => timetable.data?.departures ?? [], [timetable.data]);
  const departures = useMemo(() => departureList.map((d) => d.time), [departureList]);

  // 오늘이면 지금 이후 첫 출발편, 아니면 17시 이후 첫 편을 기본값으로 둔다.
  const suggested = useMemo(() => {
    const after = date === today ? nowMinutes : 17 * 60;
    return departures.find((t) => (parseClockTime(t) ?? 0) >= after) ?? departures[0] ?? "";
  }, [departures, date, today, nowMinutes]);
  const [timeState, setTime] = useState(initial?.time ?? "");
  const time = departures.includes(timeState) ? timeState : suggested;

  const reversible = routes.some((r) => r.originId === to && r.destinationId === from);

  const [mode, setMode] = useState<Mode>(initial?.arriveBy ? "arrive" : "depart");
  const [arriveBy, setArriveBy] = useState(
    initial?.arriveBy && parseClockTime(initial.arriveBy) !== null ? initial.arriveBy : "19:00",
  );
  const canSubmit = !!route && (mode === "depart" ? !!time : parseClockTime(arriveBy) !== null);

  return (
    <Form action={mode === "depart" ? "/result" : "/plan"} className="space-y-4">
      <div role="tablist" aria-label="검색 기준" className="grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
        {(
          [
            ["depart", "출발시간으로"],
            ["arrive", "도착시각으로"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-lg py-2 transition ${
              mode === value ? "bg-surface text-ink shadow-sm" : "text-ink-3"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

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
          {mode === "depart" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-3">출발시간</span>
              <select
                name="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={fieldClass}
                disabled={departures.length === 0}
              >
                {timetable.loading && <option value="">불러오는 중…</option>}
                {departureList.map((d) => (
                  <option key={d.time} value={d.time}>
                    {d.time}
                    {d.grade ? ` · ${d.grade}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-3">이 시각까지 도착</span>
              <input
                type="time"
                name="arriveBy"
                required
                step={300}
                value={arriveBy}
                onChange={(e) => setArriveBy(e.target.value)}
                className={fieldClass}
              />
            </label>
          )}
        </div>
        {timetable.error && <p className="mt-2 text-sm text-ink-3">⚠️ {timetable.error}</p>}
        {mode === "depart" && timetable.data && departures.length === 0 && (
          <p className="mt-2 text-sm text-ink-3">선택한 날짜에 운행하는 출발편이 없습니다.</p>
        )}
        {timetable.data && (
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            {timetable.data.source.isRealData ? "🟢" : "🟡"} 시간표: {timetable.data.source.label}
            {timetable.data.notes.map((n) => (
              <span key={n} className="block">
                · {n}
              </span>
            ))}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-40 dark:text-[#0b1020]"
      >
        {mode === "depart" ? "예상 도착시간 보기" : "가능한 출발편 비교하기"}
      </button>
    </Form>
  );
}
