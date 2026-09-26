import { SiteHeader } from "@/components/SiteHeader";
import { SearchForm } from "@/features/search/SearchForm";
import { getServices } from "@/lib/services";
import { nowMinutesInKorea, todayInKorea } from "@/lib/utils/time";

// 오늘 날짜/현재 시각 기본값이 빌드 시점에 고정되지 않도록 요청마다 렌더링한다.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { schedules } = getServices();
  const [terminals, routes] = await Promise.all([schedules.listTerminals(), schedules.listRoutes()]);

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16">
      <SiteHeader />

      <section className="pt-6 pb-8">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
          시간표보다 현실적인
          <br />
          버스 도착시간
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          시간표의 고정 소요시간 대신, 출발 날짜·요일·시간대를 반영해
          <br className="hidden sm:block" /> 실제로 몇 시쯤 도착할지 알려드려요.
        </p>
      </section>

      <SearchForm
        terminals={terminals}
        routes={routes}
        today={todayInKorea()}
        nowMinutes={nowMinutesInKorea()}
        initial={{ from: one(params.from), to: one(params.to), date: one(params.date), time: one(params.time), arriveBy: one(params.arriveBy) }}
      />

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-3">
        {schedules.source.isRealData ? "🟢" : "🟡"} 시간표: {schedules.source.label}
        <br />
        🟡 예상 소요시간은 실제 교통 데이터가 아닌 가정 규칙 기반의 <strong>시연용 예측</strong>입니다.
      </p>
    </main>
  );
}
