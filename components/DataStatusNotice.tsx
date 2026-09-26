import type { DataStatus } from "@/types/domain";

/**
 * 데이터 신뢰성 표시. 실제 데이터가 아닌 값이 하나라도 섞이면 노란 경고를 띄운다.
 * 실제 데이터로만 계산된 경우에만 초록 표시로 바뀐다.
 */
export function DataStatusNotice({ status }: { status: DataStatus }) {
  const sources = [status.travelTime, status.schedule];
  const allReal = sources.every((s) => s.isRealData);

  if (allReal) {
    return (
      <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
        <p className="font-semibold">🟢 실제 데이터 반영</p>
        <ul className="mt-1 space-y-0.5">
          {sources.map((s) => (
            <li key={s.kind}>{s.label}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      aria-label="데이터 상태"
      className="rounded-2xl border border-warn-border bg-warn-bg p-4 text-sm text-warn-ink"
    >
      <p className="font-semibold">🟡 {status.travelTime.label}</p>
      <p className="mt-1 leading-relaxed">{status.travelTime.description}</p>
      <ul className="mt-2 space-y-1 leading-relaxed">
        {!status.schedule.isRealData && (
          <li>
            · <span className="font-medium">{status.schedule.label}</span>:{" "}
            {status.schedule.description}
          </li>
        )}
        {status.notes.map((note) => (
          <li key={note}>· {note}</li>
        ))}
      </ul>
    </section>
  );
}
