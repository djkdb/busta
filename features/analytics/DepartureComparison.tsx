import Link from "next/link";
import type { DeparturePoint } from "@/lib/prediction/analytics";
import { formatDelay, formatDuration } from "@/lib/utils/time";

/**
 * 앞뒤 출발편 비교. 근거 데이터가 Mock 인 단계에서는 "최적/가장 빠름" 같은 추천 표현을 쓰지 않고
 * 편별 예상치만 나란히 보여준다.
 */
export function DepartureComparison({
  points,
  selectedTime,
  buildHref,
  isMock,
}: {
  points: DeparturePoint[];
  selectedTime: string;
  buildHref: (time: string) => string;
  isMock: boolean;
}) {
  if (points.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-bold">앞뒤 출발편 비교</h2>
      <ul className="mt-2 divide-y divide-border">
        {points.map((p) => {
          const selected = p.departureTime === selectedTime;
          return (
            <li key={p.departureTime}>
              <Link
                href={buildHref(p.departureTime)}
                aria-current={selected ? "true" : undefined}
                className={`-mx-2 grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 rounded-lg px-2 py-2.5 text-sm ${
                  selected ? "bg-accent-soft" : "hover:bg-surface-2"
                }`}
              >
                <span className="font-bold tabular-nums">{p.departureTime}</span>
                <span className="text-ink-2">
                  예상 {formatDuration(p.predictedDurationMinutes)}{" "}
                  <span className="text-ink-3">({formatDelay(p.delayMinutes)})</span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="text-xs text-ink-3">도착 </span>
                  <span className="font-semibold">
                    {p.predictedArrivalTime}
                    {p.arrivalDayOffset > 0 && <sup className="text-ink-3">+1</sup>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {isMock && (
        <p className="mt-2 text-xs text-ink-3">
          ※ 시연용 가정 패턴에 따른 비교이며, 특정 출발편을 추천하는 것이 아닙니다.
        </p>
      )}
    </section>
  );
}
