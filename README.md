# BUSTA — 시간표보다 현실적인 버스 도착시간

> **"이번 금요일 17시에 청주에서 서울 가는 버스를 타면, 시간표엔 1시간 40분이라는데 실제로는 몇 시에 도착할까?"**
>
> BUSTA는 시외버스 시간표의 **고정 소요시간** 대신, 출발 **날짜·요일·시간대·교통 패턴**을 반영한 **예상 실제 소요시간과 예상 도착시간**을 보여주는 서비스입니다.
>
> CUVIC 바이브 코딩 대회 개인전 출품작 · 가칭 서비스명

> [!WARNING]
> **현재 버전은 프로토타입입니다.**
> - 🟢 **시간표는 실제 데이터** — 공공데이터포털 TAGO 고속·시외버스정보 (인증키가 있을 때)
> - 🟢 **공휴일은 실제 데이터** — 한국천문연구원 특일정보 API
> - 🟡 **예상 소요시간은 아직 가정 규칙(Mock)** — 실제 교통 데이터는 연결되지 않았으며 화면에 항상 🟡로 표시됩니다. ([현재 한계](#현재-한계))

```
BUSTA · 청주(고속) → 서울(경부) · 9월 27일 (일) 17:00 출발 · 프리미엄

예상 도착        19:00
시간표 대비      +30분      (시간표상 도착 18:30)   ← 🟢 TAGO 실제 시간표
시간표 소요시간   1시간 30분
예상 실제 소요    2시간                           ← 🟡 가정 규칙 (Mock)
```

```
BUSTA · 서울(경부) → 청주 · 10월 2일 (금) · 19:00까지 도착

예상 기준, 19:00까지 도착하는 마지막 출발편   16:40  (예상 도착 18:56, 여유 4분)
여유 있게 가려면                          16:00  (예상 도착 18:06, 여유 54분)
⚠️ 시간표만 보면 놓치는 출발편              17:20  시간표상 19:00 도착 → 예상 19:45
```

---

## 목차
[문제 정의](#문제-정의) · [기존 서비스와의 차이](#기존-서비스와의-차이) · [핵심 기능](#핵심-기능) · [실행 방법](#실행-방법) · [AI 활용](#ai-활용) · [Architecture](#architecture) · [Data Strategy](#data-strategy) · [Prediction Engine](#prediction-engine) · [현재 한계](#현재-한계) · [개발 과정](#개발-과정) · [Troubleshooting](#troubleshooting) · [Roadmap](#roadmap)

## 문제 정의

시외버스 시간표의 소요시간은 항상 같은 값으로 적혀 있지만, 실제 이동시간은 평일 출퇴근, 금요일 저녁, 일요일 오후 귀가, 공휴일, 심야 등에 따라 달라집니다.
사용자가 정말 궁금한 것은 **"시간표에 몇 분이라고 적혀 있나"가 아니라 "이 버스를 타면 실제로 몇 시쯤 도착하나"** 입니다.
→ 자세히: [`docs/problem.md`](docs/problem.md)

### 왜 필요한가
- 18:40 도착을 믿고 19:00 약속을 잡았다가 늦는다
- 주말마다 귀가/복귀하는 사람은 **가장 막히는 시간대에 가장 자주** 탄다
- "몇 시 버스를 타야 늦지 않을까"를 감으로 판단해야 한다

## 기존 서비스와의 차이

| | 예매/시간표 서비스 | 지도 앱 길찾기 | **BUSTA** |
|---|---|---|---|
| 기준 | 고정 소요시간 | 지금 출발하는 승용차·대중교통 | **특정 날짜·특정 출발편** |
| 요일·시간대 반영 | ✗ | 일부 | ✓ |
| 시간표 대비 차이 | ✗ | ✗ | ✓ |
| 시간대별 비교 | 시간표 나열 | ✗ | ✓ |
| 데이터 신뢰도 표시 | - | - | ✓ |

## 핵심 기능

| 기능 | 상태 | 설명 |
|---|---|---|
| **ETA** | ✅ | 출발지 → 도착지 → 날짜 → 출발시간 → 예상 도착·예상 소요·시간표 대비 차이 |
| **데이터 상태 표시** | ✅ | 실제 데이터가 아닌 값이 섞이면 항상 🟡 경고 + 출처 설명 |
| **예측 근거** | ✅ | "금요일 저녁 이동 수요 +10%" 처럼 어떤 규칙이 적용됐는지 표시 |
| **시간대별 분석** | ✅ | 같은 날 1시간 간격 출발 시 시간표 대비 차이를 차트로 (탭하면 상세, 표 보기) |
| **출발편 비교** | ✅ | 앞뒤 시간표 출발편의 예상 소요·도착 비교. Mock 단계에서는 "최적"이라 단정하지 않음 |
| 자정 넘김 / 공휴일 / 요일별 운행 | ✅ | 23:00 출발 → 다음날 도착 `+1일`, 한글날 등 공휴일 반영, 금·일 심야편 |
| **목표 도착시각 역산** | ✅ | "19시까지 도착하려면?" → 예상 기준 늦지 않는 마지막 출발편, 여유 적을 때 대안, 출발편별 도착 가능/여유 적음/늦을 수 있음 |
| **오늘의 실제 운행** | ✅ | 오늘 날짜 조회 시 이 노선의 최근 도착 완료 편(실제 소요시간)과 운행 중 편(위치·도착 예정)을 🟢 실제 데이터로 표시. 원본이 실시간이 아니므로 기준 시각을 함께 표시 |
| **시간표 함정 탐지** | ✅ | 시간표상으로는 제시간이지만 예상으로는 늦는 출발편을 따로 경고 — 기존 시간표 서비스에서는 보이지 않는 위험 |

## 실행 방법

```bash
nvm use            # Node 22
npm install
npm run dev        # http://localhost:3000

npm test           # Vitest (98 tests)
npm run typecheck  # next typegen + tsc
npm run lint
npm run build
```

### 환경변수
`.env.example`을 `.env.local`로 복사하고 공공데이터포털 인증키를 넣으면 실제 시간표·공휴일을 씁니다. 키가 없으면 예시 시간표로 동작합니다.

| 변수 | 설명 |
|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 일반 인증키(Decoding). TAGO 고속버스정보·시외버스정보, 특일정보 활용신청 필요 |
| `BUSTA_SCHEDULE_SOURCE` | `tago` / `sample` (기본: 키 있으면 tago) |
| `BUSTA_HOLIDAY_SOURCE` | `kasi` / `static` (기본: 키 있으면 kasi) |

명시적으로 `tago`를 지정했는데 키가 없으면 샘플로 조용히 대체하지 않고 에러를 냅니다.
프록시를 거쳐야 하는 개발 환경에서는 `NODE_USE_ENV_PROXY=1 npm run dev` (Node 내장 fetch가 `HTTPS_PROXY`를 읽도록).

## AI 활용

| 도구 | 역할 |
|---|---|
| **Claude Code** | 기술 리드/페어 프로그래머 — 저장소 분석, 설계, 구현, 테스트, 브라우저 검증, 문서화 |
| Claude Code 서브에이전트 | 데이터 소스 조사를 메인 구현과 **병렬** 수행, 근거를 신뢰도 3등급으로 표기 |
| Playwright (AI 조작) | AI가 실제 브라우저로 사용자 플로우를 클릭하고 스크린샷을 판독해 UI 결함 발견 |

AI는 코드 생성기가 아니라 **문제 정의 → 설계 → 구현 → 테스트 → 디버깅 → 문서화** 전 과정의 협업자로 사용했습니다.
사람은 문제 정의, 제품 철학("근거 없는 숫자를 만들지 않는다"), 조사 결과 검토, 우선순위를 맡습니다.
→ [`docs/ai-workflow.md`](docs/ai-workflow.md) · [`docs/prompt-log.md`](docs/prompt-log.md)

## Architecture

```
UI (Next.js App Router)
 └─ PredictionEngine 인터페이스      ← UI는 이것만 안다
     └─ ProviderPredictionEngine    입력 검증 · 노선 조회 · 도착/지연 계산
         ├─ ScheduleDataProvider    Sample → TAGO API
         ├─ TravelTimeDataProvider  Mock 규칙 → Traffic API → Historical
         └─ HolidayCalendar         2026 정적 목록 → 특일정보 API
```

- 데이터 소스가 바뀌어도 UI·도착시간 계산·검증·분석 코드는 그대로
- 모든 값에 `DataSourceInfo { kind, label, isRealData }`가 붙어 UI가 자동으로 신뢰도 표시
- 날짜는 `YYYY-MM-DD`, 시각은 분 정수 → 서버/브라우저 타임존과 무관 (4개 타임존에서 테스트)

→ [`docs/architecture.md`](docs/architecture.md)

## Data Strategy

### 현재 실제 교통 데이터와 Mock 데이터의 차이

| | **현재** | **목표** |
|---|---|---|
| 시간표 | 🟢 **TAGO 실제 배차** — 6개 터미널·9개 노선, 출발편별 소요시간·등급 (공개 전 날짜는 "참고 시간표"로 명시) | 매일 수집해 날짜별 이력으로 보관 |
| 소요시간 | 🟡 요일·시간대·방향별 **가정 규칙** (예: 평일 퇴근 수도권 출발 +25%) | 도로 예측 API + 실제 운행 이력 |
| 공휴일 | 🟢 **특일정보 API** (키 없으면 2026 정적 목록) | - |
| 정확도 | **측정 불가 — 표시하지 않음** | 실제 운행 기록 대비 오차(MAE) 측정 후 공개 |
| UI 표시 | 🟡 시연용 예측 데이터 | 🟢 실제 출처 명시 |

### 데이터 조사 결론 ([`docs/data-sources.md`](docs/data-sources.md))
- **공개된 "시외버스 실제 도착 실적" 데이터는 찾지 못했습니다.**
- 사용 가능한 것: ① 계획 시간표(TAGO), ② 도로 통행시간(도로공사·ITS·카카오/TMAP 미래 길찾기), ③ 고속버스 실시간 도착예정(TAGO 고속버스도착정보)
- 전략: ①로 시간표 → ②로 교통 보정 → **③을 직접 수집해 실제 운행 이력을 만든다** (BUSTA만의 데이터 자산)
- 조사 환경에서 공식 사이트 원문 열람이 차단되어, 모든 항목에 `[검색확인] / [코드확인] / 미확인` 등급을 표기했습니다.

## Prediction Engine

현재 `MockPredictionEngine`의 계산 방식:
1. 시간표 소요시간 동안(출발 ~ 시간표상 도착) **5분 간격으로 샘플링** — 출발 순간이 아니라 버스가 도로 위에 있는 동안의 혼잡을 반영
2. 각 시점의 **날짜 유형**(평일/금/토/일/공휴일, 자정을 넘으면 다시 판정)과 시각에 해당하는 **가정 규칙** 효과를 구함 (경계는 30분 램프)
3. 평균 효과를 시간표 소요시간에 곱함 → 예상 소요시간, + 출발시각 → 예상 도착

랜덤 값 없음 · 같은 입력 = 같은 결과 · 근거 규칙과 비율을 화면에 표시.
**규칙의 비율은 측정값이 아닌 가정치**입니다 (`data/mock/traffic-patterns.ts`).

## 현재 한계

- 🟡 **예측값은 실제 교통 데이터가 아닌 가정 규칙 결과**입니다. 첫 검증(추석 연휴 오후, 8편)에서는 시간표보다 크게 틀렸습니다 ([`docs/validation.md`](docs/validation.md)).
- 시간표는 실제 TAGO 데이터지만, API가 **어제~모레 정도만** 제공합니다. 그 이후 날짜는 가까운 날의 시간표를 참고로 보여주며 화면에 명시합니다.
- 노선은 청주 기준 9개만 제공합니다. 수원→청주는 TAGO에 데이터가 없어 편도만 있습니다.
- 휴게소 정차, 사고·기상, 명절 특수 교통량은 반영하지 않습니다.
- 키가 없으면 공휴일은 2026년 정적 목록만 씁니다 (그 외 연도는 요일 기준 계산 + 화면에 안내).
- 정확도를 측정할 실제 운행 데이터가 없어 **정확도·확률을 표시하지 않습니다.**

## 개발 과정

Git 히스토리가 곧 개발 과정입니다 (`git log --oneline`):

```
chore: scaffold Next.js 16 + TypeScript + Tailwind + Vitest
feat: add domain model and timezone-safe date/time utilities
feat: add data provider layer with sample timetable and mock traffic patterns
feat: add prediction engine, hourly analytics and departure comparison
feat: add route search flow with timetable-aware departure picker
feat: add ETA result screen with data reliability notice
feat: add hourly travel time chart and nearby departure comparison
docs: add problem, architecture, data sources, AI workflow, ...
feat: add target-arrival planner that compares departures against an arrive-by time
feat: add arrive-by search mode and departure plan screen
fix: add Labor Day and Constitution Day to the 2026 holiday list
feat: connect real timetables from TAGO and holidays from the KASI API
feat: show today's real trips on the route from TAGO express arrival info
```

## Troubleshooting

발표용 주요 사례 ([`docs/troubleshooting.md`](docs/troubleshooting.md)):
- **첫 실측 검증에서 BUSTA 가정 규칙이 시간표보다 크게 틀렸다** — 추석 연휴 오후 실제 8편: 시간표 오차 약 3분, 가정 규칙 약 23분. 규칙을 8건에 맞춰 고치지 않고 실제 기록을 수집하는 구조로 전환 ([`docs/validation.md`](docs/validation.md))
- **AI가 만든 공휴일 목록에 노동절·제헌절이 빠져 있었다** — 실제 API와 자동 대조해서 발견
- **조사 문서의 추정 ≠ 실제 API 응답** — 24:00 출발편, 14자리 시각, 조회 가능 기간. 추정으로 파서를 먼저 만들지 않고 실제 응답부터 받은 덕분에 모두 테스트로 고정
- **curl은 되는데 서버에서는 403** — Node fetch가 프록시 변수를 읽지 않는 환경 문제
- **테스트는 전부 통과했는데 화면의 숫자가 서로 달랐다** — 17:20 출발 결과 +45분 vs 차트 17시 +41분. AI가 브라우저 스크린샷 검증에서 발견 → 시간대 시리즈를 선택 출발편 기준으로 재구성 + 회귀 테스트
- **npm 내부 오류 뒤에 숨은 의존성 충돌** — 우회 플래그 대신 원인(`@types/node` 버전) 해결
- **공식 데이터 사이트 접근 차단** — AI 조사 결과를 근거 신뢰도 3등급으로 분리
- **차트 축 설계** — 잘린 축의 과장 대신 "시간표 = 0 기준선" 차트
- **타임존 요일 버그** — 설계 단계에서 차단, 4개 타임존 테스트로 검증

## Roadmap

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 핵심 MVP (검색 → ETA) | ✅ |
| 2 | 시간대별 분석, 출발편 비교 | ✅ |
| 3 | 실제 시간표(TAGO) + 공휴일 API | ✅ |
| 3 | 교통 데이터 (도로 예측 API) | ⏭ 다음 |
| 4 | 실제 운행 이력 수집 → Historical 예측, **정확도 측정** | |
| 5 | ML (데이터가 충분할 때만) | |
| 6 | 목표 도착시각 → 출발편 비교, 시간표 함정 탐지 | ✅ (Mock 기반) |

→ [`docs/roadmap.md`](docs/roadmap.md)

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/problem.md`](docs/problem.md) | 문제 정의, 사용자, 요구사항 |
| [`docs/architecture.md`](docs/architecture.md) | 구조, 도메인 모델, 설계 결정 |
| [`docs/data-sources.md`](docs/data-sources.md) | 실제 데이터 확보 가능성 조사 |
| [`docs/ai-workflow.md`](docs/ai-workflow.md) | AI 도구와 역할, 협업 규칙 |
| [`docs/prompt-log.md`](docs/prompt-log.md) | 프롬프트 개선 기록 |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | 문제 해결 기록 |
| [`docs/roadmap.md`](docs/roadmap.md) | 단계별 계획 |
| [`docs/validation.md`](docs/validation.md) | 예측 vs 실제 운행 검증 기록 |
