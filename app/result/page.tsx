import type { Metadata } from "next";
import Link from "next/link";
import { DataStatusNotice } from "@/components/DataStatusNotice";
import { SiteHeader } from "@/components/SiteHeader";
import { DepartureComparison } from "@/features/analytics/DepartureComparison";
import { HourlyChart } from "@/features/analytics/HourlyChart";
import { LiveTrips } from "@/features/live/LiveTrips";
import { EtaSummary } from "@/features/prediction/EtaSummary";
import { PredictionFactors } from "@/features/prediction/PredictionFactors";
import { compareNearbyDepartures, getHourlyProfile } from "@/lib/prediction/analytics";
import { getServices } from "@/lib/services";
import { formatDateKo, todayInKorea } from "@/lib/utils/time";

export const metadata: Metadata = { title: "예상 도착시간 — BUSTA" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ResultPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const input = {
    originId: one(params.from),
    destinationId: one(params.to),
    date: one(params.date),
    departureTime: one(params.time),
  };

  const { engine, schedules, live } = getServices();
  const result = await engine.predict(input);

  if (!result.ok) {
    return (
      <main className="mx-auto w-full max-w-md px-4 pb-16">
        <SiteHeader />
        <section className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-ink-3">예측할 수 없어요</p>
          <p className="mt-1 text-lg font-bold">{result.error.message}</p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white dark:text-[#0b1020]"
          >
            다시 검색하기
          </Link>
        </section>
      </main>
    );
  }

  const { prediction, origin, destination, route, dataStatus, departure } = result;
  const routeDay = { originId: origin.id, destinationId: destination.id, date: prediction.date };
  // 엔진이 방금 같은 시간표를 조회했으므로 캐시에서 온다
  const timetable = await schedules.getTimetable(route.id, prediction.date).catch(() => null);
  // 오늘 날짜일 때만: 실제 운행 중·도착 완료 버스 (실패해도 결과 화면은 그대로 보여준다)
  const liveSnapshot =
    live && prediction.date === todayInKorea()
      ? await live.getLiveSnapshot(route.id).catch((e: unknown) => {
          console.error(`[BUSTA] ${e instanceof Error ? e.message : e}`);
          return null;
        })
      : null;
  const [hourly, nearby] = await Promise.all([
    getHourlyProfile(engine, routeDay, {
      minuteOffset: Number(prediction.departureTime.slice(3)),
    }),
    timetable ? compareNearbyDepartures(engine, input, timetable.departures) : Promise.resolve([]),
  ]);

  const buildHref = (time: string) =>
    `/result?${new URLSearchParams({ from: origin.id, to: destination.id, date: prediction.date, time })}`;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 pb-16">
      <SiteHeader />

      <header>
        <p className="text-2xl font-extrabold tracking-tight">
          {origin.name} <span className="text-ink-3">→</span> {destination.name}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {formatDateKo(prediction.date)}
          {prediction.holidayName && (
            <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
              {prediction.holidayName}
            </span>
          )}{" "}
          · <strong className="text-ink">{prediction.departureTime} 출발</strong>
          {departure?.grade && (
            <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">{departure.grade}</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">
          {origin.fullName} → {destination.fullName} · {route.busType === "express" ? "고속버스" : "시외버스"}
        </p>
      </header>

      <EtaSummary prediction={prediction} />
      <DataStatusNotice status={dataStatus} />
      {liveSnapshot && (
        <LiveTrips
          snapshot={liveSnapshot}
          selectedTime={prediction.departureTime}
          scheduledDurationMinutes={prediction.scheduledDurationMinutes}
          predictedDurationMinutes={prediction.predictedDurationMinutes}
          isMockPrediction={!dataStatus.travelTime.isRealData}
        />
      )}
      <PredictionFactors prediction={prediction} />
      <HourlyChart key={`${prediction.date}-${prediction.departureTime}`} points={hourly} selectedTime={prediction.departureTime} />
      <DepartureComparison
        points={nearby}
        selectedTime={prediction.departureTime}
        buildHref={buildHref}
        isMock={!dataStatus.travelTime.isRealData}
      />

      <Link
        href={`/?${new URLSearchParams({ from: origin.id, to: destination.id, date: prediction.date, time: prediction.departureTime })}`}
        className="block rounded-2xl border border-border bg-surface py-3.5 text-center text-sm font-bold text-ink-2"
      >
        조건 바꿔서 다시 검색
      </Link>
    </main>
  );
}
