/**
 * 실제 운행 기록 기반 소요시간 (Phase 4).
 *
 * 같은 노선 · 같은 날짜 유형(평일/금/토/일/공휴일) · 출발시각 ±windowMinutes 안의 실제 기록이
 * minSamples 건 이상이면 그 중앙값을 예측으로 쓴다. 평균 대신 중앙값: 사고 등 극단값에 덜 흔들린다.
 * 기준에 못 미치면 null 과 표본 수를 돌려준다 — 대체(Fallback) 여부는 조립하는 쪽이 정하고 화면에 알린다.
 */
import { recentMonths, type ObservationRecord } from "@/lib/observations/record";
import type { ObservationStore } from "@/lib/observations/store";
import { parseClockTime, todayInKorea } from "@/lib/utils/time";
import type { DataSourceInfo } from "@/types/domain";
import { classifyDay, DAY_TYPE_LABEL } from "./holiday-calendar";
import type {
  HolidayCalendar,
  TravelTimeData,
  TravelTimeDataProvider,
  TravelTimeQuery,
} from "./types";

export interface HistoricalOptions {
  minSamples?: number;
  windowMinutes?: number;
  months?: number;
  cacheTtlMs?: number;
  now?: () => Date;
}

export interface HistoricalLookup {
  sampleSize: number;
  minSamples: number;
  data: TravelTimeData | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export class HistoricalTravelTimeDataProvider implements TravelTimeDataProvider {
  readonly source: DataSourceInfo = {
    kind: "historical",
    label: "실제 운행 기록",
    description: "TAGO 고속버스도착정보로 수집한 실제 도착 기록의 중앙값입니다.",
    isRealData: true,
  };
  private readonly minSamples: number;
  private readonly windowMinutes: number;
  private readonly months: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;
  private cache: { expires: number; value: Promise<ObservationRecord[]> } | null = null;

  constructor(
    private readonly store: ObservationStore,
    private readonly holidays: HolidayCalendar,
    options: HistoricalOptions = {},
  ) {
    this.minSamples = options.minSamples ?? 5;
    this.windowMinutes = options.windowMinutes ?? 60;
    this.months = options.months ?? 3;
    this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60_000;
    this.now = options.now ?? (() => new Date());
  }

  async getTravelTime(query: TravelTimeQuery): Promise<TravelTimeData | null> {
    return (await this.lookup(query)).data;
  }

  async lookup({ route, date, departureMinutes, scheduledDurationMinutes }: TravelTimeQuery): Promise<HistoricalLookup> {
    const records = await this.records();
    const dayType = classifyDay(date, this.holidays);
    const samples = records.filter((r) => {
      // 도착 시각이 감지 시점일 수 있는 기록은 제외 (record.ts 참고)
      if (r.routeId !== route.id || r.arrivalAtFeedTime) return false;
      const t = parseClockTime(r.departureTime);
      if (t === null || Math.abs(t - departureMinutes) > this.windowMinutes) return false;
      return classifyDay(r.date, this.holidays) === dayType;
    });

    const base = { sampleSize: samples.length, minSamples: this.minSamples };
    if (samples.length < this.minSamples) return { ...base, data: null };

    const durations = samples.map((s) => s.actualDurationMinutes);
    const predicted = median(durations);
    const days = new Set(samples.map((s) => s.date)).size;
    return {
      ...base,
      data: {
        routeId: route.id,
        durationMinutes: predicted,
        sampleSize: samples.length,
        factors: [
          {
            id: "historical-median",
            label: `${DAY_TYPE_LABEL[dayType]} ±${this.windowMinutes / 60}시간 실제 운행 ${samples.length}건(${days}일) 중앙값`,
            effect: Math.round((predicted / scheduledDurationMinutes - 1) * 1000) / 1000,
          },
        ],
        source: {
          ...this.source,
          description: `실제 도착 기록 ${samples.length}건(${days}일, ${Math.min(...durations)}~${Math.max(...durations)}분)의 중앙값입니다. 같은 노선·같은 날짜 유형·출발 ±${this.windowMinutes}분 기준.`,
        },
      },
    };
  }

  private records(): Promise<ObservationRecord[]> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.value;
    const months = recentMonths(todayInKorea(this.now()), this.months);
    const value = this.store.loadMonths(months).then(async ({ records }) => {
      // 기록 날짜의 공휴일 판정을 위해 해당 연도를 미리 불러온다
      const years = [...new Set(records.map((r) => r.date.slice(0, 4)))];
      await Promise.all(years.map((y) => this.holidays.prepare?.(`${y}-01-01`)));
      return records;
    });
    this.cache = { expires: Date.now() + this.cacheTtlMs, value };
    value.catch(() => (this.cache = null));
    return value;
  }
}

/**
 * 실측이 충분하면 실측, 아니면 가정 규칙. 대체가 일어나면 notes 로 이유를 남긴다 (조용히 대체하지 않음).
 * 기록 저장소를 읽지 못해도 예측은 계속하되, 그 사실을 알린다.
 */
export class HistoricalFirstTravelTimeDataProvider implements TravelTimeDataProvider {
  constructor(
    private readonly historical: HistoricalTravelTimeDataProvider,
    private readonly fallback: TravelTimeDataProvider,
  ) {}

  get source() {
    return this.historical.source;
  }

  async getTravelTime(query: TravelTimeQuery): Promise<TravelTimeData | null> {
    let lookup: HistoricalLookup;
    try {
      lookup = await this.historical.lookup(query);
    } catch (e) {
      console.error(`[BUSTA] 관측 기록을 읽지 못함: ${e instanceof Error ? e.message : e}`);
      const data = await this.fallback.getTravelTime(query);
      return data && { ...data, notes: [...(data.notes ?? []), "실제 운행 기록을 불러오지 못해 가정 규칙으로 계산했습니다."] };
    }
    if (lookup.data) return lookup.data;
    const data = await this.fallback.getTravelTime(query);
    return (
      data && {
        ...data,
        notes: [
          ...(data.notes ?? []),
          `이 조건(같은 요일 유형·시간대)의 실제 운행 기록이 ${lookup.sampleSize}건으로 기준(${lookup.minSamples}건)에 못 미쳐 가정 규칙으로 계산했습니다.`,
        ],
      }
    );
  }
}
