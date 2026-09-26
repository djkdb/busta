/**
 * 서버 측 서비스 조립 지점. 어떤 데이터/엔진을 쓸지는 여기서만 결정한다.
 *
 * BUSTA_PREDICTION_ENGINE
 *   - "mock" (기본값): 예시 시간표 + 규칙 기반 Mock 패턴
 *   - 그 외 값: 아직 구현되지 않음 → 조용히 Mock 으로 대체하지 않고 에러를 낸다.
 *     (실제 데이터를 쓰는 줄 알았는데 Mock 이 나가는 상황을 막기 위함)
 */
import "server-only";
import { StaticHolidayCalendar } from "@/lib/data/holiday-calendar";
import { SampleScheduleDataProvider } from "@/lib/data/sample-schedule-provider";
import type { ScheduleDataProvider } from "@/lib/data/types";
import { MockPredictionEngine } from "@/lib/prediction/engine";
import type { PredictionEngine } from "@/lib/prediction/types";

export interface BustaServices {
  engine: PredictionEngine;
  schedules: ScheduleDataProvider;
}

let cached: BustaServices | null = null;

export function getServices(): BustaServices {
  if (cached) return cached;
  const engineId = process.env.BUSTA_PREDICTION_ENGINE ?? "mock";
  switch (engineId) {
    case "mock": {
      const holidays = new StaticHolidayCalendar();
      cached = {
        engine: new MockPredictionEngine(holidays),
        schedules: new SampleScheduleDataProvider(),
      };
      return cached;
    }
    default:
      throw new Error(
        `BUSTA_PREDICTION_ENGINE="${engineId}" 는 아직 구현되지 않았습니다. 사용 가능: mock`,
      );
  }
}
