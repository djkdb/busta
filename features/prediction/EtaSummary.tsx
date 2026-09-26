import { formatDelay, formatDuration } from "@/lib/utils/time";
import type { TravelTimePrediction } from "@/types/domain";

function dayLabel(offset: number) {
  return offset > 0 ? <span className="ml-1 align-top text-sm font-semibold text-ink-3">+{offset}일</span> : null;
}

/**
 * 결과 화면의 핵심: 3초 안에 "몇 시쯤 도착하는지"와 "시간표보다 얼마나 더 걸리는지"를 전달한다.
 * 가장 큰 숫자 = 예상 도착시간, 그 아래에 시간표 vs 예상 소요시간 대비.
 */
export function EtaSummary({ prediction }: { prediction: TravelTimePrediction }) {
  const { delayMinutes: delay } = prediction;
  const delayTone =
    delay > 0 ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2";

  return (
    <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm font-medium text-ink-3">예상 도착</p>
      <p className="mt-0.5 text-6xl leading-none font-black tracking-tight text-ink">
        {prediction.predictedArrival.time}
        {dayLabel(prediction.predictedArrival.dayOffset)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-3 py-1 font-bold whitespace-nowrap ${delayTone}`}>
          {delay === 0 ? "시간표와 동일" : `시간표 대비 ${formatDelay(delay)}`}
        </span>
        <span className="text-ink-3">
          시간표상 도착 {prediction.scheduledArrival.time}
          {prediction.scheduledArrival.dayOffset > 0 && " (+1일)"}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="text-xs font-medium text-ink-3">시간표 소요시간</dt>
          <dd className="mt-1 text-xl font-bold text-ink-2">
            {formatDuration(prediction.scheduledDurationMinutes)}
          </dd>
        </div>
        <div className="rounded-2xl bg-accent-soft p-3">
          <dt className="text-xs font-medium text-accent">예상 실제 소요시간</dt>
          <dd className="mt-1 text-xl font-extrabold text-ink">
            {formatDuration(prediction.predictedDurationMinutes)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
