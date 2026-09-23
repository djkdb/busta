# 아키텍처

## 최초 레포지토리 상태

2026-09-23 기준 main의 `a0575dd`에는 제목만 있는 README.md가 있었다. 기존 앱·설정·테스트·AGENTS.md는 없었다.

## 기술 선택

Next.js App Router + TypeScript를 사용한다. 서버 페이지는 한국 기준 오늘 날짜와 초기 예시 결과를 구성하고, 클라이언트는 명시적 검색과 시간 선택을 처리한다. 예측은 프레임워크와 분리된 TypeScript이므로 Vitest에서 빠르게 검증할 수 있다. CSS 토큰과 반응형 미디어 쿼리로 단일 화면을 구현했고 아이콘에는 lucide-react를 사용했다. 저장소와 API 키는 현재 필요하지 않다.

## 흐름

```text
검색 입력 → buildReport → PredictionEngine.predict
                            ↓
                 TravelTimeDataProvider.getContext
                            ↓
              가상 노선 + 기준 시간 + 시간대 계수
                            ↓
           분 단위 소요시간 · 기준 대비 차이 · 도착 날짜/시간
                            ↓
               선택 결과 + 06–23시 시간대 비교 → UI
```

`PredictionEngine`과 `TravelTimeDataProvider`는 비동기 인터페이스다. `MockPredictionEngine`에 제공자를 생성자 주입한다. 엔진 구현 교체는 `lib/prediction/service.ts`에서 한다. 미래 Historical/Traffic/ML 구현은 아직 존재하지 않으며 API를 가정한 빈 구현을 만들지 않았다.

## 데이터 모델

| 모델 | 주요 필드 | 의미 |
| --- | --- | --- |
| BusRoute | id, origin, destination, baselineMinutes, source | 방향별 노선과 출처가 있는 기준 시간 |
| PredictionInput | routeId, date, departureTime | 한국 벽시계 날짜·시간 |
| TravelTimeContext | route, multiplier, reasons, source | 계산 근거를 가진 제공자 응답 |
| PredictionResult | input, route, durationMinutes, differenceMinutes, arrivalDate, arrivalTime, dayOffset, source, reasons | 선택 조건과 출처를 보존한 결과 |
| PredictionReport | selected, hourly | 결과 카드와 동일 엔진으로 산출한 비교 목록 |

## Mock 규칙

모든 노선·분수는 `data/mock/routes.ts`의 예시다. 평일/주말 24시간 계수를 직접 정의하며 평일 출퇴근, 주말 오후 증가와 야간 감소를 가정한다. 시간과 시간 사이 값은 선형 보간한다. 계산은 `round(baselineMinutes × multiplier)`이며 최소 1분이다. 무작위성, 확률, 학습된 모델은 없다. 실제 데이터로 검증된 규칙도 아니다.

## 날짜·경계

입력은 2000–2099년 유효한 ISO 날짜와 HH:mm이다. 날짜를 파싱한 후 원문과 비교해 2월 30일 자동 보정을 거부한다. 한국 벽시계 구성요소를 UTC 필드에 담아 더하므로 실행 기기의 시간대나 DST에 따라 결과가 변하지 않는다. 이는 출발을 UTC로 해석한다는 뜻이 아니다. 실제 교통 API에 보낼 때는 별도 경계 어댑터에서 Asia/Seoul/+09:00 타임스탬프로 변환해야 한다.

## UI 상태 및 접근성

초기 청주→서울 17시 결과를 예시로 표시한다. 폼의 편집 상태와 마지막 검색 결과를 구분하고, 편집하면 갱신 안내를 표시한다. 검색 실패 시 이전 결과는 유지된다. 결과는 live region으로 갱신되고, 키보드 가능한 그래프 버튼·표·명시적 label·에러 alert를 제공한다. 모바일 그래프는 자체 영역에서 가로 스크롤된다.

## 실제 데이터 전환 시 할 일

API는 먼저 공식 문서·이용 조건·노선 매칭·호출 한도·소요시간 정의를 확인한다. 키는 클라이언트 번들에 넣지 않고 서버 경계에서 관리한다. 노선 목록도 제공자 인터페이스로 이전한다. Mock 경고 제거는 실제 출처·갱신 시각·장애 정책·결측 처리·검증이 준비된 뒤 진행한다. 실제 제공자 실패를 숨기고 Mock으로 바꾸지 않는다.
