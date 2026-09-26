import Link from "next/link";
import type { PlanOption, PlanStatus } from "@/lib/prediction/planner";
import { formatDuration } from "@/lib/utils/time";

/** 상태는 색만으로 구분하지 않고 아이콘 + 텍스트를 함께 쓴다 */
const STATUS: Record<PlanStatus, { icon: string; label: string; className: string }> = {
  "on-time": { icon: "✓", label: "도착 가능", className: "text-ink" },
  tight: { icon: "△", label: "여유 적음", className: "text-ink" },
  late: { icon: "✕", label: "늦을 수 있음", className: "text-ink-3" },
};

function slackText(o: PlanOption) {
  return o.slackMinutes >= 0
    ? `여유 ${formatDuration(o.slackMinutes)}`
    : `${formatDuration(-o.slackMinutes)} 늦음`;
}

export function PlanOptionList({
  options,
  latestOnTime,
  buildHref,
  isMock,
  hiddenCount,
}: {
  options: PlanOption[];
  latestOnTime: PlanOption | null;
  buildHref: (departureTime: string) => string;
  isMock: boolean;
  hiddenCount: number;
}) {
  if (options.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-bold">출발편별 예상 도착</h2>
      <ul className="mt-2 divide-y divide-border">
        {options.map((o) => {
          const s = STATUS[o.status];
          const highlight = o === latestOnTime;
          return (
            <li key={o.departureTime}>
              <Link
                href={buildHref(o.departureTime)}
                className={`-mx-2 grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-2 rounded-lg px-2 py-2.5 text-sm ${
                  highlight ? "bg-accent-soft" : "hover:bg-surface-2"
                }`}
              >
                <span className={`font-bold tabular-nums ${s.className}`}>{o.departureTime}</span>
                <span className={s.className}>
                  <span aria-hidden className="mr-1 font-bold">{s.icon}</span>
                  {s.label}
                  <span className="block text-xs text-ink-3">{slackText(o)}</span>
                  {o.timetableTrap && (
                    <span className="block text-xs text-ink-3">⚠ 시간표상 {o.scheduledArrival.time} 도착</span>
                  )}
                </span>
                <span className="text-right tabular-nums">
                  <span className="text-xs text-ink-3">예상 도착 </span>
                  <span className={`font-semibold ${o.status === "late" ? "text-ink-3" : ""}`}>
                    {o.predictedArrival.time}
                    {o.predictedArrival.dayOffset > 0 && <sup className="text-ink-3">+1</sup>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        {hiddenCount > 0 && `목표 시각과 먼 ${hiddenCount}개 출발편은 생략했어요. `}
        출발편을 누르면 상세 예측을 볼 수 있어요.
        {isMock && (
          <>
            <br />※ 시연용 가정 패턴에 따른 비교이며, 특정 출발편을 추천하는 것이 아닙니다.
          </>
        )}
      </p>
    </section>
  );
}
