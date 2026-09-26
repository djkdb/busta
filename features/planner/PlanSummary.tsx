import type { PlanOption, PlanSuccess } from "@/lib/prediction/planner";
import { formatDuration } from "@/lib/utils/time";

function arrivalText(o: PlanOption) {
  return `${o.predictedArrival.time}${o.predictedArrival.dayOffset > 0 ? " (+1일)" : ""}`;
}

/**
 * 핵심 답: "예상 기준으로 목표 시각까지 도착하는 마지막 출발편".
 * Mock 단계에서는 "추천"이 아니라 "예상 기준"이라는 조건을 항상 붙인다.
 */
export function PlanSummary({ plan }: { plan: PlanSuccess }) {
  const { latestOnTime: last, latestComfortable: comfy, arriveBy } = plan;

  if (plan.totalDepartures === 0) {
    return (
      <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-lg font-bold">이 날짜에 운행하는 출발편이 없어요.</p>
      </section>
    );
  }

  if (!last) {
    return (
      <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-sm font-medium text-ink-3">예상 기준</p>
        <p className="mt-1 text-xl font-extrabold leading-snug">
          {arriveBy}까지 도착하는 출발편이 없어요
        </p>
        <p className="mt-2 text-sm text-ink-2">
          가장 이른 편도 예상 도착이 목표보다 늦습니다. 아래에서 가장 이른 출발편들을 확인하세요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm font-medium text-ink-3">예상 기준, {arriveBy}까지 도착하는 마지막 출발편</p>
      <p className="mt-1 text-6xl leading-none font-black tracking-tight">{last.departureTime}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-accent-soft px-3 py-1 font-bold whitespace-nowrap text-accent">
          예상 도착 {arrivalText(last)}
        </span>
        <span className="text-ink-2">
          여유 {formatDuration(last.slackMinutes)} · 예상 소요 {formatDuration(last.predictedDurationMinutes)}
        </span>
      </div>

      {last.status === "tight" && comfy && comfy !== last && (
        <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">
          여유가 {plan.tightSlackMinutes}분 미만이에요. 여유 있게 가려면{" "}
          <strong className="text-ink">{comfy.departureTime} 출발</strong> (예상 도착 {arrivalText(comfy)}, 여유{" "}
          {formatDuration(comfy.slackMinutes)})
        </p>
      )}
      {last.status === "tight" && !comfy && (
        <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">
          여유가 {plan.tightSlackMinutes}분 이상인 출발편은 없어요.
        </p>
      )}
    </section>
  );
}

/** 시간표로는 제시간이지만 예상으로는 늦는 출발편 — 기존 시간표 서비스에서는 보이지 않는 위험 */
export function TimetableTrapNotice({ plan }: { plan: PlanSuccess }) {
  if (plan.timetableTraps.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-bold">⚠️ 시간표만 보면 놓치는 출발편</h2>
      <p className="mt-1 text-sm text-ink-2">
        시간표상으로는 {plan.arriveBy}까지 도착하지만, 예상으로는 늦을 수 있어요.
      </p>
      <ul className="mt-3 space-y-2">
        {plan.timetableTraps.map((o) => (
          <li
            key={o.departureTime}
            className="grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-xl bg-surface-2 px-3 py-2 text-sm tabular-nums"
          >
            <span className="font-bold">{o.departureTime} 출발</span>
            <span>
              <span className="block text-ink-3">시간표상 {o.scheduledArrival.time} 도착</span>
              <span className="block font-semibold">
                예상 {arrivalText(o)} · {formatDuration(-o.slackMinutes)} 늦음
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
