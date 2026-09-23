# busta · 시외버스 ETA

**시간표의 고정 소요시간을 넘어, 내가 출발하는 시간의 도착시간을 비교하는 서비스.**
CUVIC 바이브 코딩 대회 개인 출품용 MVP입니다.

> 현재는 **Mock 시뮬레이션**입니다. 모든 노선·기준 소요시간·혼잡 계수는 예시이며 공식 시간표, 실시간 교통, 실제 통계 또는 학습된 AI 예측이 아닙니다. 배차 조회·예매는 지원하지 않습니다.

## 실행

Node.js 24 LTS와 npm을 권장합니다. 로컬 검증: Node 24.18.0.

```sh
npm ci
npm run dev
```

브라우저에서 http://127.0.0.1:3000 을 엽니다. API 키나 환경변수는 필요하지 않습니다.

```sh
npm run check                 # lint + TypeScript + 단위 테스트 + production build
npx playwright install chromium
npm run test:e2e              # production 서버 자동 실행, 데스크톱·모바일 Chromium
npm run start                # build 이후 production 실행
```

## MVP 기능

- 청주·서울·대전 사이 6개 방향별 예시 노선 선택 / 출발·도착 교환
- 한국 날짜·시간 기준 검색, 입력 검증, 검색 조건 변경 안내
- 기준 소요시간(예시), 예상 소요시간, 차이, 도착시간, 다음 날 도착 표시
- 평일·주말 시간대 규칙 및 분 단위 보간으로 재현 가능한 Mock 예측
- 06–23시 정각 + 선택한 시간 비교 그래프, 클릭으로 시간 변경, 접근 가능한 결과 표
- 오후 시간대 비교, 짧은 소요시간 제안, 모바일 반응형 화면

예: `청주 → 서울 / 2026-09-18 / 17:00` → 기준 100분 × 예시 계수 1.28 = **128분 / 19:08 도착 / +28분**. 이 수치는 실제 교통 사실을 의미하지 않습니다.

## 구조

```text
app/                    Next.js App Router 진입점·전역 스타일
features/search/        검색, 결과, 시간대 비교 UI
lib/data/               TravelTimeDataProvider 구현
lib/prediction/         PredictionEngine 구현 및 보고서 서비스
lib/utils/              한국 벽시계 날짜·시간 계산과 검증
data/mock/              실제 데이터와 분리된 예시 노선
types/                  엔진·데이터 제공자 계약
tests/                  도메인 단위 테스트 및 브라우저 E2E
docs/                   문제 정의·설계·AI 협업·프롬프트·문제 해결 기록
```

Next.js 16 / React 19 / TypeScript / CSS / Vitest / Playwright. 정확한 버전은 `package-lock.json`을 기준으로 합니다. 이번 단일 화면에는 추가 스타일 프레임워크 대신 CSS 토큰·미디어 쿼리를 사용했습니다. [Next.js 공식 설치 문서](https://nextjs.org/docs/app/getting-started/installation)를 확인해 App Router 구성을 선택했습니다.

## 데이터와 예측의 한계

- `MockTravelTimeDataProvider`는 가상의 기준 시간과 24시간 계수를 제공합니다.
- `MockPredictionEngine`는 제공받은 값으로 분 단위 소요시간과 도착시간을 계산합니다.
- 실제 API 연동 시 제공자와 엔진을 교체할 수 있습니다. UI의 노선 목록도 실제 노선 제공자로 전환해야 합니다.
- 금요일 별도 효과, 공휴일, 날씨, 사고, 경유지, 방향별 정체 차이는 반영하지 않습니다.
- 비교 시간은 실제 출발 편이 아닙니다. 소요시간이 가장 짧은 예시가 사용자의 일정에 가장 좋은 선택이라는 뜻은 아닙니다.
- 확률·정확도·신뢰구간을 제시하지 않습니다. 실측 기록을 확보하고 평가하기 전에는 이를 주장할 수 없습니다.

## 개발 기록

- [문제 정의와 MVP 범위](docs/problem.md)
- [아키텍처·데이터 모델](docs/architecture.md)
- [AI 협업 방식](docs/ai-workflow.md)
- [프롬프트 기록](docs/prompt-log.md)
- [트러블슈팅](docs/troubleshooting.md)
- [로드맵](docs/roadmap.md)
- [검증 및 시연 가이드](docs/validation.md)

원본 초기 요구사항은 `docs/initial-brief.txt`에 보존했습니다. `prompt-log.md`는 작업 요약이며 원본 AI Chat Log 전체를 대체하지 않습니다. 대회 제출 시 대화 원본을 별도로 내보내 보관하세요.
