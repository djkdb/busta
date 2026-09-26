/**
 * 서버 측 서비스 조립 지점. 어떤 데이터/엔진을 쓸지는 여기서만 결정한다.
 *
 * 환경변수
 *   DATA_GO_KR_SERVICE_KEY   공공데이터포털 일반 인증키(Decoding). API별 키(TAGO_EXPRESS_BUS_SERVICE_KEY 등)가 있으면 우선
 *   BUSTA_SCHEDULE_SOURCE    "tago" | "sample"  (기본: 키가 있으면 tago, 없으면 sample)
 *   BUSTA_HOLIDAY_SOURCE     "kasi" | "static"  (기본: 키가 있으면 kasi, 없으면 static)
 *   BUSTA_PREDICTION_ENGINE  "mock" (현재 유일한 구현)
 *
 * 원칙: 명시적으로 요청한 실제 데이터 소스를 쓸 수 없으면 조용히 샘플로 대체하지 않고 에러를 낸다.
 * 어떤 소스를 쓰든 결과 화면의 "데이터 상태"에 실제 출처가 표시된다.
 */
import "server-only";
import { TAGO_ROUTES, TAGO_TERMINALS } from "@/data/catalog/tago-routes";
import { StaticHolidayCalendar } from "@/lib/data/holiday-calendar";
import { KasiHolidayCalendar } from "@/lib/data/kasi-holiday-calendar";
import { MockTravelTimeDataProvider } from "@/lib/data/mock-travel-time-provider";
import { PublicDataClient } from "@/lib/data/public-data/client";
import { SampleScheduleDataProvider } from "@/lib/data/sample-schedule-provider";
import { TagoLiveArrivalProvider } from "@/lib/data/tago/tago-live-arrival-provider";
import { TagoScheduleDataProvider } from "@/lib/data/tago/tago-schedule-provider";
import type { HolidayCalendar, LiveArrivalProvider, ScheduleDataProvider } from "@/lib/data/types";
import { ProviderPredictionEngine } from "@/lib/prediction/engine";
import type { PredictionEngine } from "@/lib/prediction/types";

export interface BustaServices {
  engine: PredictionEngine;
  schedules: ScheduleDataProvider;
  /** 운행 중 버스 도착 정보. TAGO 시간표를 쓸 때만 있다 */
  live: LiveArrivalProvider | null;
}

let cached: BustaServices | null = null;

function keyFor(specific: string | undefined): string | undefined {
  return specific?.trim() || process.env.DATA_GO_KR_SERVICE_KEY?.trim() || undefined;
}

function choose<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name}="${value}" 는 지원하지 않습니다. 사용 가능: ${allowed.join(", ")}`);
  }
  return value as T;
}

function requireKey(key: string | undefined, what: string): string {
  if (!key) throw new Error(`${what}을(를) 쓰려면 DATA_GO_KR_SERVICE_KEY 환경변수가 필요합니다.`);
  return key;
}

export function getServices(): BustaServices {
  if (cached) return cached;

  const scheduleKey = keyFor(process.env.TAGO_EXPRESS_BUS_SERVICE_KEY);
  const holidayKey = keyFor(process.env.KASI_HOLIDAY_SERVICE_KEY);

  const scheduleSource = choose("BUSTA_SCHEDULE_SOURCE", ["tago", "sample"], scheduleKey ? "tago" : "sample");
  const holidaySource = choose("BUSTA_HOLIDAY_SOURCE", ["kasi", "static"], holidayKey ? "kasi" : "static");
  choose("BUSTA_PREDICTION_ENGINE", ["mock"], "mock");

  const tagoClient =
    scheduleSource === "tago"
      ? new PublicDataClient({ serviceKey: requireKey(scheduleKey, "TAGO 시간표") })
      : null;
  const schedules: ScheduleDataProvider = tagoClient
    ? new TagoScheduleDataProvider(tagoClient, TAGO_TERMINALS, TAGO_ROUTES)
    : new SampleScheduleDataProvider();
  const live = tagoClient ? new TagoLiveArrivalProvider(tagoClient, TAGO_ROUTES) : null;

  const holidays: HolidayCalendar =
    holidaySource === "kasi"
      ? new KasiHolidayCalendar(new PublicDataClient({ serviceKey: requireKey(holidayKey, "특일정보 API") }))
      : new StaticHolidayCalendar();

  cached = {
    schedules,
    live,
    engine: new ProviderPredictionEngine("mock-pattern", {
      schedules,
      travelTime: new MockTravelTimeDataProvider(holidays),
      holidays,
    }),
  };
  return cached;
}
