import { DAY_TYPE_LABEL } from "@/lib/data/holiday-calendar";
import type { TravelTimePrediction } from "@/types/domain";

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

/** "왜 이 예측이 나왔나" — 숫자의 근거를 규칙 단위로 보여준다. */
export function PredictionFactors({ prediction }: { prediction: TravelTimePrediction }) {
  const dayText = prediction.holidayName
    ? `${DAY_TYPE_LABEL[prediction.dayType]} (${prediction.holidayName})`
    : DAY_TYPE_LABEL[prediction.dayType];

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-bold">이렇게 계산했어요</h2>
      <p className="mt-1 text-sm text-ink-2">
        {dayText} · {prediction.departureTime} 출발 · 운행 구간 동안의 시간대 패턴 평균
      </p>
      {prediction.factors.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">이 시간대에 적용된 정체 요인이 없어 시간표 소요시간과 같습니다.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {prediction.factors.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink-2">{f.label}</span>
              <span className="font-semibold tabular-nums text-ink">{pct(f.effect)}</span>
            </li>
          ))}
        </ul>
      )}
      {prediction.source.kind === "mock" && (
        <p className="mt-2 text-xs text-ink-3">
          ※ 위 요인과 비율은 실제 통계가 아닌 <strong>가정 규칙</strong>입니다.
        </p>
      )}
    </section>
  );
}
