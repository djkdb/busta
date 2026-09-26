/**
 * 데이터 출처 정의. UI 의 "데이터 상태" 표시는 전부 여기서 온다.
 * 새로운 실제 데이터 소스를 연결하면 isRealData: true 인 항목을 추가한다.
 */
import type { DataSourceInfo } from "@/types/domain";

export const SAMPLE_TIMETABLE_SOURCE: DataSourceInfo = {
  kind: "sample",
  label: "예시 시간표",
  description:
    "노선·배차·시간표 소요시간은 시연을 위한 예시 값이며 실제 운수사 시간표와 다를 수 있습니다.",
  isRealData: false,
};

export const MOCK_PATTERN_SOURCE: DataSourceInfo = {
  kind: "mock",
  label: "시연용 예측 데이터",
  description:
    "현재 실제 교통 데이터를 직접 반영하지 않은 프로토타입 결과입니다. 요일·시간대·방향별 정체에 대한 일반적인 가정을 규칙으로 만들어 계산했습니다.",
  isRealData: false,
};
