# Architecture

## 전체 구조

```
┌────────────────────────── UI (Next.js App Router) ──────────────────────────┐
│ app/page.tsx ─ SearchForm (client)        app/result/page.tsx (server)       │
│                                            ├ EtaSummary / PredictionFactors  │
│                                            ├ DataStatusNotice                │
│                                            ├ HourlyChart (client)            │
│                                            └ DepartureComparison             │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │  PredictionEngine 인터페이스만 사용
┌───────────────▼──────────── lib/prediction ─────────────────────────────────┐
│ ProviderPredictionEngine : 입력 검증 → 노선 조회 → 소요시간 → 도착/지연 계산    │
│   └ MockPredictionEngine (현재)                                              │
│ analytics.ts : getHourlyProfile, compareNearbyDepartures (엔진 무관)          │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │  Provider 인터페이스 (lib/data/types.ts)
┌───────────────▼──────────── lib/data ───────────────────────────────────────┐
│ ScheduleDataProvider   : SampleScheduleDataProvider → (TAGO)                 │
│ TravelTimeDataProvider : MockTravelTimeDataProvider → (Historical/TrafficApi)│
│ HolidayCalendar        : StaticHolidayCalendar → (특일정보 API)               │
└───────────────┬─────────────────────────────────────────────────────────────┘
┌───────────────▼──────────── data/ ──────────────────────────────────────────┐
│ samples/timetable.ts (예시 시간표) · mock/traffic-patterns.ts (가정 규칙)      │
│ calendar/holidays-kr.ts (2026 공휴일)                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

엔진·데이터 선택은 `lib/services.ts` 한 곳에서만 한다 (`BUSTA_PREDICTION_ENGINE`, 기본 `mock`).
구현되지 않은 엔진 이름을 넣으면 **Mock으로 조용히 대체하지 않고 에러**를 낸다 — 실제 데이터를 쓰는 줄 알았는데 Mock이 나가는 사고를 막기 위해서다.

## 폴더 구조

```
app/                 Next.js 라우트 (/, /result)
components/          범용 UI (SiteHeader, DataStatusNotice)
features/
├── search/          검색 폼
├── prediction/      ETA 결과, 예측 근거
└── analytics/       시간대별 차트, 출발편 비교
lib/
├── data/            Provider 인터페이스와 구현체, 데이터 출처 정의
├── prediction/      엔진, 분석 함수
├── utils/time.ts    타임존 안전 날짜·시간 계산
└── services.ts      서버 측 조립 지점
types/domain.ts      도메인 모델
data/                예시/Mock/달력 데이터 (전부 출처 주석 포함)
tests/               Vitest
docs/                기획·설계·AI 활용·트러블슈팅 기록
```

## 도메인 모델 (`types/domain.ts`)

| 모델 | 필드 | 설명 |
|---|---|---|
| `Terminal` | id, name, fullName | 터미널 |
| `Route` | id, originId, destinationId, scheduledDurationMinutes, **direction**, busType | 노선. `direction`(to-metro / from-metro / regional)은 수도권 유입·유출에 따라 정체 패턴이 반대로 나타나는 것을 표현 |
| `BusSchedule` | id, routeId, departureTime, operatingDays | 출발편. 요일별 운행 여부 |
| `TravelTimeObservation` | id, routeId, date, dayOfWeek, departureTime, actualDurationMinutes, source | 실제 운행 기록 1건 (Phase 4에서 채움) |
| `TravelTimePrediction` | routeId, date, dayType, holidayName, departureTime, scheduled/predictedDuration, scheduled/predictedArrival, delayMinutes, **factors**, **source** | 예측 결과. 근거(factors)와 출처(source)가 항상 붙음 |
| `DataSourceInfo` | kind, label, description, **isRealData** | 모든 숫자의 출처. `isRealData=false`면 UI가 경고 |
| `DataStatus` | schedule, travelTime, notes | 결과 화면의 데이터 상태 |

요구사항 초안의 모델에서 바꾼 점:
- `Route.direction` 추가 — 같은 청주↔서울이라도 방향에 따라 패턴이 정반대라서 필요
- `predictedArrival`을 문자열이 아니라 `{date, time, dayOffset}`으로 — 자정을 넘는 운행을 표현하기 위해
- `factors` 추가 — "왜 이 숫자인가"를 설명할 수 없으면 사용자가 믿을 이유가 없다
- `DataSourceInfo.isRealData` — 데이터 신뢰성 UI를 타입 수준에서 강제

## 핵심 설계 결정

### 1. 날짜·시간은 문자열 + 분 정수로만 다룬다
`new Date("2026-10-02")`는 UTC 자정으로 해석되어, 서버(UTC)와 브라우저(KST)에서 요일이 달라질 수 있다.
BUSTA는 날짜를 `"YYYY-MM-DD"`, 시각을 자정 기준 분으로만 다루고 요일/날짜 이동은 UTC 달력 연산으로 계산한다.
테스트를 `TZ=UTC / Asia/Seoul / America/Los_Angeles / Pacific/Kiritimati(UTC+14)` 에서 모두 통과시켜 검증했다.

### 2. Mock은 "랜덤"이 아니라 "이름 붙은 가정 규칙"
`data/mock/traffic-patterns.ts`의 규칙 예:

| 규칙 | 적용 요일 | 시간 | 수도권 방향 | 수도권 출발 | 지역 간 |
|---|---|---|---|---|---|
| 평일 출근 시간대 | 평일·금 | 06:30–09:30 | +22% | +10% | +10% |
| 평일 퇴근 시간대 | 평일·금 | 17:00–20:00 | +18% | +25% | +12% |
| 금요일 저녁 이동 수요 | 금 | 15:00–21:30 | +10% | +20% | +8% |
| 일요일·공휴일 귀가 정체 | 일·공휴일 | 14:00–21:30 | +28% | +6% | +8% |
| 심야 시간대 한산 | 전체 | 22:00–05:00 | -8% | -8% | -8% |
| (그 외 토요일 오전, 주말 오후, 공휴일 오전 규칙) | | | | | |

**이 수치는 측정값이 아닌 가정치다.** 규칙으로 둔 이유는 (1) 결과 화면에서 근거를 보여줄 수 있고 (2) 실제 데이터가 들어왔을 때 어떤 가정이 틀렸는지 규칙 단위로 비교할 수 있기 때문이다.

### 3. 출발 순간이 아니라 "도로 위에 있는 동안"을 본다
17:00 출발 버스는 17:00~18:40 동안 도로 위에 있다. 출발 시각의 혼잡만 보면 16:50 출발(퇴근 규칙 미적용)과 17:00 출발(적용)이 갑자기 튄다.
그래서 시간표 소요시간 동안 5분 간격으로 샘플링해 규칙 효과를 평균하고, 규칙 경계에는 30분 램프를 둔다.
자정을 넘는 운행은 샘플 시점마다 날짜·요일·공휴일을 다시 판정한다.

### 4. 차트는 "시간표 대비 차이"를 0 기준선에서 그린다
소요시간(100분 vs 128분)을 막대로 그리면 0부터 시작해야 해서 차이가 작아 보이고, 축을 잘라내면 과장이 된다.
그래서 **시간표 소요시간 = 0 기준선**, 막대 = 추가/단축 시간으로 그린다. 시간대별 시리즈는 선택 출발편의 "분"을 유지해(17:20 → 06:20…23:20) 강조 막대가 상단 ETA 숫자와 항상 같다.

### 5. 검색은 GET URL
`/result?from=cheongju&to=seoul-gyeongbu&date=2026-10-02&time=17:00` — 결과를 공유·북마크할 수 있고, 서버 컴포넌트에서 계산하므로 향후 API 키가 브라우저에 노출되지 않는다.

## 엔진 교체 시나리오

```ts
// lib/services.ts
case "historical":
  return {
    engine: new ProviderPredictionEngine("historical", {
      schedules: new TagoScheduleDataProvider(apiKey),
      travelTime: new HistoricalTravelTimeDataProvider(db),
      holidays: new KasiHolidayCalendar(apiKey),
    }),
    ...
  };
```
UI, 도착시간 계산, 입력 검증, 시간대 분석 코드는 그대로 재사용된다.
