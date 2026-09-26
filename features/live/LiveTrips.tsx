import type { LiveSnapshot, LiveTrip } from "@/lib/data/types";
import { formatDelay, formatDuration } from "@/lib/utils/time";

const MAX_ROWS = 8;

function nearest(trips: LiveTrip[], time: string): LiveTrip[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return [...trips]
    .sort((a, b) => Math.abs(toMin(a.departureTime) - toMin(time)) - Math.abs(toMin(b.departureTime) - toMin(time)))
    .slice(0, MAX_ROWS)
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
}

/**
 * 오늘 이 노선을 실제로 달린 버스들. BUSTA 예측과 별개인 🟢 실제 데이터다.
 * 원본이 실시간이 아니므로(실측상 20~35분 지연) 기준 시각을 항상 함께 보여준다.
 */
export function LiveTrips({
  snapshot,
  selectedTime,
  scheduledDurationMinutes,
  predictedDurationMinutes,
  isMockPrediction,
}: {
  snapshot: LiveSnapshot;
  selectedTime: string;
  scheduledDurationMinutes: number;
  predictedDurationMinutes: number;
  isMockPrediction: boolean;
}) {
  const known = snapshot.trips.filter((t) => t.status !== "not-departed");
  if (known.length === 0) return null;

  const selected = known.find((t) => t.departureTime === selectedTime) ?? null;
  const arrived = known.filter((t) => t.status === "arrived" && t.durationMinutes !== null);
  const avg = arrived.length
    ? Math.round(arrived.reduce((s, t) => s + t.durationMinutes!, 0) / arrived.length)
    : null;

  return (
    <section className="rounded-2xl border border-emerald-300 bg-surface p-4 dark:border-emerald-800">
      <h2 className="text-sm font-bold">🟢 오늘 이 노선 실제 운행</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
        공공데이터포털 TAGO 고속버스도착정보
        {snapshot.basedAt && <> · <strong className="text-ink-2">{snapshot.basedAt.time} 기준</strong> (실시간 아님, 약 15분마다 갱신)</>}
      </p>

      {selected && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-semibold">
            선택한 {selected.departureTime} 버스:{" "}
            {selected.status === "arrived"
              ? `${selected.arrival!.time} 도착 완료 (${formatDuration(selected.durationMinutes!)})`
              : `${selected.location ?? "운행 중"} · ${selected.arrival!.time} 도착 예정`}
          </p>
          {selected.status === "arrived" && (
            <p className="mt-1 text-ink-2">
              시간표 {formatDuration(scheduledDurationMinutes)} · 실제 {formatDuration(selected.durationMinutes!)} ·{" "}
              BUSTA 예상 {formatDuration(predictedDurationMinutes)}
              {isMockPrediction && " (가정 규칙)"}
            </p>
          )}
        </div>
      )}

      {avg !== null && (
        <p className="mt-3 text-sm text-ink-2">
          최근 도착 완료 {arrived.length}편 평균 <strong className="text-ink">{formatDuration(avg)}</strong>
          <span className="text-ink-3"> (시간표 대비 {formatDelay(avg - scheduledDurationMinutes)})</span>
        </p>
      )}

      <ul className="mt-2 divide-y divide-border text-sm">
        {nearest(known, selectedTime).map((t) => (
          <li
            key={`${t.departureDate}-${t.departureTime}`}
            className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 py-2 ${t.departureTime === selectedTime ? "font-semibold" : ""}`}
          >
            <span className="tabular-nums">{t.departureTime}</span>
            <span className="truncate text-ink-2">
              {t.status === "arrived" ? "도착 완료" : t.location ?? "운행 중"}
              {t.grade && <span className="text-ink-3"> · {t.grade}</span>}
            </span>
            <span className="text-right tabular-nums">
              <span className="text-xs text-ink-3">{t.status === "arrived" ? "도착 " : "예정 "}</span>
              {t.arrival!.time}
              <span className="block text-xs text-ink-3">{formatDuration(t.durationMinutes!)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        운행 중 편의 도착 예정은 기준 시각의 위치로 계산된 값이라 실제와 다를 수 있습니다. 출발 전 편은 표시하지 않습니다.
      </p>
    </section>
  );
}
