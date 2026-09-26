import type { DataSourceInfo, DataStatus } from "@/types/domain";

function SourceRow({ title, source }: { title: string; source: DataSourceInfo }) {
  return (
    <li className="leading-relaxed">
      <span className="font-semibold">
        {source.isRealData ? "🟢" : "🟡"} {title}: {source.label}
      </span>
      <span className="block opacity-90">{source.description}</span>
    </li>
  );
}

/**
 * 데이터 신뢰성 표시. 출처마다 실제 데이터 여부를 따로 보여준다.
 * 실제 데이터가 아닌 값이 하나라도 섞이면 전체를 노란 경고 톤으로 표시한다.
 */
export function DataStatusNotice({ status }: { status: DataStatus }) {
  const allReal = status.schedule.isRealData && status.travelTime.isRealData;
  const tone = allReal
    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
    : "border-warn-border bg-warn-bg text-warn-ink";

  return (
    <section aria-label="데이터 상태" className={`rounded-2xl border p-4 text-sm ${tone}`}>
      <p className="font-bold">{allReal ? "🟢 실제 데이터 기반 결과" : "🟡 시연용 예측이 포함된 결과"}</p>
      <ul className="mt-2 space-y-2">
        <SourceRow title="예상 소요시간" source={status.travelTime} />
        <SourceRow title="시간표" source={status.schedule} />
      </ul>
      {status.notes.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-current/15 pt-2 leading-relaxed">
          {status.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
