# 데이터 소스 조사 (Data Sources)

> BUSTA의 가장 큰 리스크는 UI가 아니라 **"실제 버스 소요시간 데이터를 어디서 얻는가"** 입니다.
> 이 문서는 데이터 확보 가능성 조사 결과이며, **사용 가능한 것처럼 보이지만 확인되지 않은 항목은 "미확인"으로 남겨둡니다.**
>
> - 조사 방식: Claude Code 서브에이전트가 WebSearch/WebFetch로 조사 → 사람이 검토 후 이 문서로 정리
> - 조사 환경의 한계: 개발 컨테이너의 네트워크 정책이 data.go.kr 등 공식 사이트 직접 열람을 차단함 → 아래 표의 "확인 상태"를 반드시 함께 볼 것 (`docs/troubleshooting.md` #6 참고)
> - **2026-09-26 업데이트:** 인증키 발급 후 실제 API를 호출해 검증했습니다. **TAGO 고속·시외버스정보(시간표)와 특일정보(공휴일)는 앱에 연결됨.** 예상 소요시간은 여전히 Mock 패턴입니다. 검증 결과는 맨 아래 [6. 실측 검증 결과](#6-실측-검증-결과-2026-09-26)에 있고, 위 조사 내용 중 틀린 부분도 그곳에 정리했습니다.

> 조사일: 2026-09-26 · 대상: 시외/고속버스 실소요시간 추정 서비스(예: 청주→서울)

## 0. 조사 방법과 신뢰도 표기

이 환경의 네트워크 egress 프록시가 data.go.kr, data.ex.co.kr, its.go.kr, tago.go.kr, kobus.co.kr, openapi.sk.com, developers.kakaomobility.com, devtalk.kakao.com, exp.t-money.co.kr 등 **공식 페이지 직접 열람을 차단**했습니다. 그래서 아래 근거는 세 등급으로 나눠 표기합니다.

| 표기 | 의미 |
|---|---|
| **[검색확인]** | 공식 페이지의 검색엔진 색인 내용(WebSearch 결과 요약)으로 확인. 원문을 직접 열지는 못함 |
| **[코드확인]** | GitHub에 공개된 제3자 라이브러리 코드/PR을 직접 열어 확인(실제 호출에 쓰이는 엔드포인트·필드명) |
| **미확인 (확인 필요)** | 근거를 찾지 못했거나 추정에 그침 |

**주의:** 공식 문서를 한 건도 직접 열지 못했습니다. 구현 전에 data.go.kr 상세 페이지의 "상세기능/요청변수/출력결과" 탭과 각 사업자 약관을 반드시 직접 확인하세요.

---

## 1. 요약표

| # | 데이터 | 제공처 | 종류 | API | 비용 | 노선 변환 | 확인 상태 |
|---|---|---|---|---|---|---|---|
| 1 | TAGO 고속버스정보 (`ExpBusInfo`) | 국토교통부 / data.go.kr 15098522 | 계획 시간표 (출발·도착 예정시각) | O (REST) | 무료 | 바로 가능 (터미널 ID 쌍) | 엔드포인트·필드 [코드확인], 설명 [검색확인] |
| 2 | TAGO 시외버스정보 (`SuburbsBusInfo`) | 국토교통부 / data.go.kr 15098541 | 계획 시간표 (당일 배차만) | O | 무료 | 바로 가능 | [코드확인]+[검색확인] |
| 3 | **TAGO 고속버스도착정보** (`ExpBusArrInfoService`) | 국토교통부 / data.go.kr 15098516 | **실시간 운행 버스 위치·도착예정** (GPS 기반 추정) | O | 무료 | 가능 (출/도착 터미널 기준) | 존재·설명 [검색확인], 응답 필드 **미확인** |
| 4 | 티머니 고속버스 통합정보시스템 도착안내 | 티머니 (exp.t-money.co.kr/bis) | 실시간 GPS 도착예정 (웹) | 공개 API 미확인 | - | 가능 | [검색확인] |
| 5 | 영업소간 통행시간 / 톨게이트간 통행시간 / 도시간 소요시간 / 구간 통행시간 | 한국도로공사 (data.ex.co.kr, data.go.kr) | 도로 통행시간 (실측 TCS·VDS 기반, 이력·실시간) | O + 파일 | 무료 (인증키) | 부분 가능 (고속도로 구간만, IC 매핑 필요) | [검색확인], 필드 일부만 |
| 6 | ITS 교통소통정보 / 교통예측정보 / 표준노드링크 | 국토교통부 국가교통정보센터 (its.go.kr) | 도로 통행속도 (실시간 5분, 예측) | O | 무료 (인증키) | 어려움 (링크 단위, 경로 매칭 필요) | [검색확인] |
| 7 | TMAP 타임머신 자동차 길안내 | TMAP모빌리티 / SK open API | 예측 도로 통행시간 (미래 시각 지정) | O | 유료 (무료량 미확인) | 가능 (터미널 좌표 쌍) | 엔드포인트 [검색확인], 과금 **미확인** |
| 8 | 카카오모빌리티 미래 운행 정보 길찾기 | 카카오모빌리티 | 예측 도로 통행시간 (미래 출발시각) | O | 일반 길찾기 일 1만건 무료 (미래 API 무료량 미확인) / 제휴형 월 100만원 | 가능 | [검색확인] |
| 9 | 고속버스통합예매(KOBUS), 버스타고, 티머니 시외버스 | 각 예매사 | 계획 시간표 (웹) | 공개 API 없음 (확인 범위 내) | - | 가능 | API 부재 [검색확인], 약관 스크래핑 조항 **미확인** |
| 10 | DTG 운행기록 | 한국교통안전공단 (eTAS) | 실제 운행 (초 단위 GPS·속도) | X (신청제, 샘플 파일만 공개) | - | 이론상 가능 | 공개 제한 [검색확인] |
| 11 | 특일 정보 (공휴일) | 한국천문연구원 / data.go.kr 15012690 | 달력 | O | 무료 | 해당 없음 | [검색확인] |
| 12 | 고속/시외버스 실제 도착 실적 공개 데이터셋 | - | 실제 운행 | - | - | - | **찾지 못함** (없는 것으로 판단) |
| 13 | ODsay LAB 고속/시외 운행정보 | ODsay (민간) | 계획 시간표 | O | 무료 키 제공 (한도 미확인) | 가능 | [검색확인] |
| 14 | 도로공사 명절 교통예보 (도시간 시간대별 예상 소요시간) | 한국도로공사 로드플러스 | 예측 도로 통행시간 (명절) | API 여부 미확인 | 무료 (웹) | 주요 도시쌍만 | [검색확인] |

---

## 2. 소스별 상세

### 2.1 TAGO 고속버스정보 (국토교통부_(TAGO)_고속버스정보)

- **어떤 데이터인가:** 전국 고속버스의 배차, 등급, 요금 정보. 출발·도착 터미널명, 출발시간, 도착시간, 등급, 노선ID, 요금을 제공합니다. [검색확인]
- **어디서:** https://www.data.go.kr/data/15098522/openapi.do (열람 차단, 검색 색인으로 확인)
- **엔드포인트** [코드확인, 출처: `digitie/python-datagokr-api` `src/datagokr/services/openapi.py`]:
  - `https://apis.data.go.kr/1613000/ExpBusInfo/GetExpBusTrminlList` (터미널 목록)
  - `.../ExpBusInfo/GetCtyCodeList` (도시코드)
  - `.../ExpBusInfo/GetExpBusGradList` (등급)
  - `.../ExpBusInfo/GetStrtpntAlocFndExpbusInfo` (출/도착지 기반 배차 조회)
  - 요청변수: `depTerminalId`, `arrTerminalId`, `depPlandTime`(날짜), `busGradeId`
  - 참고: TAGO 서비스는 2026년에 `...Service` 경로(camelCase 오퍼레이션)에서 새 경로(PascalCase 오퍼레이션)로 바뀐 사례가 있습니다(열차정보 `TrainInfoService`→`TrainInfo`, [코드확인] dhmailing/RailFlow PR #5). 블로그에 나오는 옛 경로 `ExpBusInfoService/getStrtpntAlocFndExpbusInfo`는 폐기되었을 수 있으므로 **최신 경로는 data.go.kr에서 직접 확인이 필요합니다.**
- **응답 필드** [코드확인, `models.py`의 `TagoBusTimetable`]: `routeId`, `depPlaceNm`, `arrPlaceNm`, `depPlandTime`, `arrPlandTime`, `gradeNm`, `charge`. 실제 응답에서 `depPlandTime`/`arrPlandTime`이 숫자(YYYYMMDDHHmm 형태로 추정)로 온다는 PR이 있습니다(digitie PR #19).
  - 터미널 필드: `terminalId`, `terminalNm`, `cityName`. 고속 터미널 목록에는 좌표가 없고, 한 프로젝트에서 좌표 확보율이 452곳 중 14곳에 그쳤다는 이슈가 있습니다(team-offway/core #463). **BUSTA가 도로 API와 연결하려면 터미널 좌표를 따로 구축해야 합니다.**
- **도착시간의 성격:** `arrPlandTime`은 이름 그대로 **계획(예정) 도착시각**입니다. 실제 도착시각이 아닙니다.
- **무료 여부와 사용 조건:** 무료이며 serviceKey가 필요합니다. TAGO 계열은 개발·운영 모두 자동승인이고 개발계정 트래픽 10,000(일)이며, 활용사례를 등록하면 늘릴 수 있습니다. [검색확인, 시외버스정보·도착정보 페이지 기준] 이용허락범위(공공누리 유형)는 **미확인**입니다.
- **조회 가능 기간:** 고속버스가 당일만인지, 미래 날짜도 되는지는 **미확인**입니다.
- **노선 단위 변환:** 바로 가능합니다. (출발터미널, 도착터미널, 등급, 출발시각) 조합이 BUSTA의 기본 키가 됩니다.
- **BUSTA 활용:** **Phase 3 timetable의 핵심 소스.** 계획 소요시간 = arrPlandTime − depPlandTime.

### 2.2 TAGO 시외버스정보 (국토교통부_(TAGO)_시외버스정보)

- **어떤 데이터인가:** 출/도착지 기반 시외버스 운행정보입니다. **현재 당일 배차정보만 제공**합니다. [검색확인]
- **어디서:** https://www.data.go.kr/data/15098541/openapi.do
- **엔드포인트** [코드확인]: `https://apis.data.go.kr/1613000/SuburbsBusInfo/GetSuberbsBusTrminlList`, `GetCtyCodeList`, `GetSuberbsBusGradList`, `GetStrtpntAlocFndSuberbsBusInfo`. `busGradeId`는 지원하지 않고 터미널 조회에 `cityCode`를 씁니다. 응답은 고속버스와 같은 `TagoBusTimetable` 모델입니다.
- **사용 조건:** 자동승인, 개발계정 트래픽 10,000입니다. [검색확인] 시외 터미널 337곳 중 302곳은 좌표가 있다는 이슈가 있습니다(`cityName` 제공, team-offway #463).
- **도착시간의 성격:** 계획 시각입니다. 시외버스는 경유지가 많아 arrPlandTime이 비어 있거나 부정확할 수 있으나, 이는 **미확인**입니다.
- **제약:** 당일만 조회되므로 **매일 수집해 시간표 DB를 쌓아야** 합니다.
- **BUSTA 활용:** Phase 3 timetable. 매일 새벽에 배치로 수집합니다.

### 2.3 TAGO 고속버스도착정보 (국토교통부_(TAGO)_고속버스도착정보) — 가장 중요한 발견

- **어떤 데이터인가:** "출/도착지 고속버스터미널 코드를 기준으로 **현재 운행중인 고속버스의 위치 및 도착시간**을 조회"하는 서비스입니다. 오퍼레이션은 터미널목록 조회, 출발지기준 도착지목록 조회, 고속버스 도착예정정보 조회입니다. [검색확인]
- **어디서:** https://www.data.go.kr/data/15098516/openapi.do
- **엔드포인트:** 서비스 URL `http://apis.data.go.kr/1613000/ExpBusArrInfoService`, 확인된 오퍼레이션은 `getExpBusTmnList`입니다. [검색확인] 도착예정정보 오퍼레이션명과 응답 필드(도착예정시각, 현재위치, 남은거리 등)는 **미확인**입니다. 경로가 PascalCase 신경로로 바뀌었을 수 있습니다(2.1 참고).
- **사용 조건:** 무료, 개발계정 트래픽 10,000입니다. [검색확인]
- **데이터 성격:** 운행 중인 버스의 GPS 기반 **실시간 도착예정**입니다. 원천은 티머니 고속버스 BIS(2.4)로 추정되나 **미확인**입니다.
- **BUSTA에서의 가치:** 공개된 "실제 도착 실적" 데이터셋은 없습니다(2.12). 그래서 이 API를 **주기적으로 폴링해 도착 직전·직후 값을 저장하면 BUSTA 자체의 실제 운행시간 이력을 만들 수 있습니다.** 단, 다음이 모두 **확인 필요**합니다.
  1. 응답에 개별 배차(출발시각이나 차량)를 식별하는 키가 있는지
  2. 도착완료 차량을 얼마 동안 반환하는지 (티머니 웹은 "도착완료 30분 이내"까지 표시)
  3. 시외버스는 대상이 아닌 것으로 보임 (서비스명이 고속버스 한정)
  4. 트래픽 10,000/일 안에서 폴링할 수 있는 노선 수 (예: 5분 간격이면 288회/일/노선이므로 약 30개 노선)
- **BUSTA 활용:** **Phase 4 historical의 핵심 원천(자체 수집).** 실시간 "지금 출발한 버스는 언제 도착?" 기능에도 씁니다.

### 2.4 티머니 고속버스 통합정보시스템 (도착안내)

- **어떤 데이터인가:** "2,700대 이상 고속버스로부터 수집되는 GPS 교통데이터"로 도착안내를 합니다. "도착예정 2시간 이전 혹은 도착완료 30분 이내 차량에 한하여" 지원됩니다. [검색확인]
- **어디서:** https://exp.t-money.co.kr/bis/uat/uia/getTerminalArrivalInfoListD.do (열람 차단)
- **API:** 공개 API는 확인하지 못했습니다. 웹 화면뿐입니다. 스크래핑 허용 여부는 **미확인**이며 권장하지 않습니다. 같은 성격의 데이터는 2.3 공공 API로 받는 것이 정석입니다.
- **BUSTA 활용:** 2.3 필드를 해석할 때 참고하고, 사람이 교차 검증할 때 씁니다.

### 2.5 한국도로공사 고속도로 공공데이터 (data.ex.co.kr / data.go.kr)

- **어떤 데이터인가** [검색확인]:
  - **영업소간 통행시간**: TCS(요금소) 기반 OD 통행시간입니다. 포털 조회는 "민자노선 데이터 처리로 2일 전까지" 제공됩니다. 항목에는 기간, TCS차종유형구분명/코드, TCS차종구분명/코드, 출발·도착영업소코드, 출발도착기준구분코드, 평균속도가 있습니다. → **차종 구분이 있어 대형(버스급) 통행시간을 따로 볼 수 있을 가능성**이 있으나, 버스를 따로 구분하는지는 **미확인**입니다.
  - **한국도로공사_톨게이트간 통행시간 정보** (data.go.kr 15076787, OpenAPI), **실시간 영업소간 통행시간**(OpenAPI)도 있다고 검색됩니다. 필드는 **미확인**입니다.
  - **한국도로공사_도시간 소요시간** (data.go.kr 15076795, OpenAPI): 주요 도시 간 고속도로 소요시간입니다. 항목에는 구분, 특일/기간코드, TCS차종, 교통량, 총통행시간, 평균통행시간이 있습니다. → **특일 코드가 있어 명절·휴일 패턴 분석에 유용**합니다.
  - **구간 통행시간** (파일 15043743), **콘존 및 차로유형별 소통 데이터(1시간 단위)** (파일 15103513), **링크(RSE) 통행시간** (파일 15062123), **통행시간 지수 VDS** (파일 15045652): 이력 파일입니다.
  - **실시간 소통 데이터** (OpenAPI 15076684), **실시간 고속도로 정체상황** (15076685)
- **어디서:** https://data.ex.co.kr/ (OpenAPI 목록: https://data.ex.co.kr/openapi/intro/introduce02 , 인증키: https://data.ex.co.kr/openapi/apikey/requestKey), data.go.kr 미러
- **비용과 조건:** 인증키 발급 방식입니다. 무료로 보이나 트래픽 한도와 라이선스는 **미확인**입니다.
- **데이터 성격:** **도로 통행시간(실측 기반)**입니다. 버스 운행시간이 아닙니다. 휴게소 정차, 터미널 진출입, 시내 구간(예: 청주터미널→청주IC, 서울 요금소→센트럴시티)은 포함되지 않습니다.
- **노선 변환:** 부분적으로 가능합니다. 노선마다 "진입 영업소→진출 영업소" 매핑을 수작업이나 경로 API로 만들고, 시내 구간 시간은 따로 더해야 합니다.
- **BUSTA 활용:** **Phase 3 traffic**(실시간 영업소간/구간 통행시간으로 보정), **Phase 4 historical**(요일·시간대·특일별 고속도로 구간 통행시간 이력 → 버스 소요시간 모델의 설명변수), **holidays**(도시간 소요시간의 특일 코드).

### 2.6 국가교통정보센터 ITS 오픈데이터 (its.go.kr)

- **어떤 데이터인가** [검색확인]: 교통소통정보(고속도로·국도 실시간, **5분 주기**, VDS·영상 검지기 기반 링크 평균속도), **교통예측정보**(고속도로·우회국도의 과거 패턴·요일·시간대·기상·돌발을 반영한 예상 주행속도), 돌발상황, CCTV, VMS, **표준노드링크**(전국 도로망, 조건 없이 무제한 다운로드)
- **어디서:** https://www.its.go.kr/opendata/ , 교통소통: https://www.its.go.kr/opendata/opendataList?service=traffic , data.go.kr 미러 "국토교통부_교통소통정보"(15040463), "국토교통부_교통예측정보"(15040507). 옛 openapi.its.go.kr은 신규 신청이 종료되어 오픈데이터 홈페이지로 신청해야 합니다.
- **비용과 조건:** 무료이며 인증키가 필요합니다. 트래픽 한도와 라이선스는 **미확인**입니다. 요청 파라미터 형식(`type`, `getType` 등)도 **미확인**입니다.
- **데이터 성격:** 도로 링크 속도입니다. 시내 일반도로는 포함되지 않습니다(고속도로·국도 중심).
- **노선 변환:** 어렵습니다. 버스 경로를 표준노드링크 링크열로 매칭해 구간 시간을 합산해야 합니다(맵매칭 필요).
- **BUSTA 활용:** Phase 3 traffic(대안 또는 보조), Phase 4에서 자체 수집한 이력. 도로공사 데이터보다 구현 비용이 큽니다.

### 2.7 TMAP 타임머신 자동차 길 안내 (SK open API / TMAP API)

- **어떤 데이터인가:** 미래 특정 시각 기준 자동차 경로와 예측 소요시간입니다. `POST /tmap/routes/prediction`이며 `predictionType`(`arrival` 지원; `departure`도 있을 것으로 추정되나 **미확인**), `predictionTime`을 씁니다. 응답에는 totalDistance, totalTime, totalFare, departureTime, arrivalTime이 있습니다. [검색확인]
- **어디서:** https://openapi.sk.com/products/detail?linkMenuSeq=43 , https://skopenapi.readme.io/reference/타임머신-자동차-길-안내 (둘 다 열람 차단)
- **비용:** 일반 TMAP 경로안내는 일 1,000건 무료이고 초과 시 건당 10원이라는 검색 요약이 있습니다. [검색확인, 원문 미열람] 타임머신 API의 무료량과 단가는 **미확인**입니다. 한 개발팀 문서에는 TMAP 대중교통 API가 무료 일 10건이라고 되어 있습니다(sunsik17/tyt-be PR #37).
- **차종:** 대형차/버스 차종 파라미터를 지원하는지는 **미확인**입니다.
- **데이터 성격:** 예측 **승용차 도로 통행시간**입니다. 버스는 휴게소 정차(보통 2시간 이상 노선 15분 내외)와 속도 제한 때문에 차이가 납니다.
- **노선 변환:** 가능합니다. 출·도착 터미널 좌표 쌍 + 출발시각으로 조회합니다. 좌표 구축이 필요합니다(2.1).
- **라이선스 주의:** 결과를 저장·재배포(캐시 DB)할 수 있는지는 약관 **확인 필요**입니다.
- **BUSTA 활용:** Phase 3 traffic("이 시각 출발 시 도로 예측"). 호출 수를 아끼려면 노선×시간대 단위로 캐싱합니다.

### 2.8 카카오모빌리티 미래 운행 정보 길찾기

- **어떤 데이터인가:** 지정한 **미래 출발시각** 기준 경로·소요시간입니다(도착시각 기준은 지원하지 않음, tyt-be PR #37). 카카오내비 빅데이터와 교통예측 알고리즘을 씁니다. [검색확인]
- **엔드포인트:** 일반 `/v1/future/directions`, 제휴 `/affiliate/v1/future/directions`. 제휴형은 별도 제휴 계약에 **월 100만원**입니다. [검색확인, devtalk 원문 미열람] 일반형의 사용 범위 제한은 **확인 필요**입니다(devtalk에 관련 질문 글 있음).
- **비용:** 길찾기 API 일 1만건 무료, 초과 시 100만건까지 건당 8원입니다(자동차 길찾기 기준). [검색확인] 미래 운행 정보 API에도 같은 쿼터가 적용되는지는 **미확인**입니다.
- **차종:** 자동차 길찾기에 `car_type`(대형 등)이 있습니다. [검색확인] 미래 API에서도 지원하는지는 **미확인**입니다.
- **데이터 성격:** 예측 도로 통행시간입니다.
- **BUSTA 활용:** Phase 3 traffic 후보. 무료량이 TMAP보다 넉넉할 가능성이 있어 1순위 후보로 두고 검증합니다.
- **URL:** https://developers.kakaomobility.com/product/naviapi.html , https://devtalk.kakao.com/t/future-directions-api-v1-future-directions/151611

### 2.9 고속버스통합예매(KOBUS), 버스타고, 티머니 시외버스(txbus)

- **어떤 데이터인가:** 예매용 시간표, 잔여석, 요금, 소요시간 표시입니다.
- **URL:** https://www.kobus.co.kr/ (약관 https://kobus.co.kr/cmn/SvcUtlzStplAgrm.do), https://www.bustago.or.kr/ , https://txbus.t-money.co.kr/
- **API:** 공개 개발자 API는 찾지 못했습니다. [검색확인: 버스타고·TXBus가 직접 제공하는 API 정보 없음]
- **약관:** KOBUS 약관의 자동수집 금지 조항은 **미확인**입니다(열람 차단). 버스타고는 "이메일무단수집거부" 고지만 확인했습니다. 일반적으로 예매 사이트 스크래핑은 서버 부하와 약관 위반 위험이 있으므로 **BUSTA 설계에서는 배제하고 TAGO 공공 API를 쓰는 것을 권장**합니다.
- **데이터 성격:** 계획 시간표입니다. TAGO와 원천이 같을 가능성이 높으나 **미확인**입니다.

### 2.10 DTG 디지털운행기록계 (한국교통안전공단)

- **어떤 데이터인가:** 사업용 차량(버스 포함) DTG에서 1초 단위로 수집하는 속도, 위치, 방위각, 가속도입니다. [검색확인]
- **공개 여부:** "교통행정기관, 공단 및 운송사업자에게 **교통안전 관리업무에 한정**하여 활용하는 전제하에 제공"됩니다. data.go.kr에는 **샘플 파일만** 있습니다("한국교통안전공단_사업용차량 초단위 운행기록데이터(샘플)", 15050068). 집계 통계("운행기록 분석결과 통계", 15136273)도 있습니다. [검색확인]
- **BUSTA 활용 가능성:** 민간 서비스가 원천 데이터를 받기는 **사실상 어렵습니다**. 운송사와 제휴하면 이론상 가능하지만 장기 과제입니다.
- **URL:** https://main.kotsa.or.kr/portal/contents.do?menuCode=01040400 , https://www.kotsa.or.kr/dps/

### 2.11 한국천문연구원 특일 정보 (공휴일)

- **어디서:** https://www.data.go.kr/data/15012690/openapi.do
- **엔드포인트:** `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?solYear=&solMonth=&ServiceKey=&_type=json` [검색확인]. 오퍼레이션: `getRestDeInfo`(쉬는 날), `getHoliDeInfo`(국경일), `getAnniversaryInfo`, `get24DivisionsInfo`, `getSundryDayInfo`
- **응답:** 날짜, 순번, 분류, 공공기관 휴일 여부(`isHoliday`), 명칭 [검색확인]
- **조건:** 무료, 자동승인, 개발계정 10,000. 활용기간을 연장해야 합니다(예: 한 프로젝트는 2028-02-25까지 연장). [검색확인, hyunbinseo/holidays-kr #23]
- **주의:** 임시공휴일은 지정 발표 이후에야 반영됩니다(추정, **확인 필요**). 명절 연휴 "전날/다음날" 같은 BUSTA 파생 특징은 직접 계산해야 합니다.
- **BUSTA 활용:** holidays(모든 Phase 공통 특징). 연 1회 이상 캐시합니다.

### 2.12 고속/시외버스 실제 도착 실적 공개 데이터셋

- data.go.kr, 국가교통 데이터 오픈마켓(bigdata-transportation.kr), KTDB, 교통카드 빅데이터(stcis.go.kr)를 검색했지만 **노선·배차별 실제 도착시각 이력 데이터셋은 찾지 못했습니다.** 결론은 "없음(공개되지 않음)"이며, 다만 오픈마켓의 유료 상품 목록은 전부 확인하지 못했습니다(**확인 필요**).
- 대안: 2.3 TAGO 고속버스도착정보를 자체 폴링해 이력을 쌓거나, 사용자 제보(크라우드소싱: "방금 도착" 버튼)를 받습니다.

### 2.13 (추가) ODsay LAB

- 민간 대중교통 API로 고속/시외버스 운행정보 검색, 경로검색을 제공하고 DB를 월 2회 갱신합니다. [검색확인] https://lab.odsay.com/
- 무료 한도와 라이선스는 **미확인**입니다. TAGO가 불안정할 때의 백업 시간표 소스로 둡니다.

### 2.14 (추가) 도로공사 명절 교통예보

- 2026 추석부터 "일자별·시간대별 주요 도시 간 소요시간"을 로드플러스 웹과 앱으로 제공합니다. 조건이 비슷한 과거 데이터로 구간 평균속도를 산출합니다. [검색확인, 2026-09-23 보도] API 제공 여부는 **미확인**입니다.
- BUSTA 활용: holidays 단계에서 명절 예측의 벤치마크나 검증용으로 씁니다.

---

## 3. 결론: BUSTA 데이터 확보 전략

**핵심 사실:** 공개된 "버스 실제 운행시간" 이력은 없습니다. 쓸 수 있는 것은 ① 계획 시간표(TAGO), ② 도로 통행시간(도로공사·ITS·TMAP·카카오), ③ **실시간 고속버스 도착예정(TAGO 고속버스도착정보)** 세 가지입니다. ③을 자체적으로 쌓는 것이 BUSTA의 차별화 자산이 됩니다.

### Phase 3 — timetable (즉시)
1. data.go.kr에서 TAGO 고속버스정보, 시외버스정보, 고속버스도착정보, 특일정보를 활용신청합니다(모두 자동승인, 무료).
2. 매일 새벽 배치로 대상 노선(청주↔서울 등)의 배차를 수집해 `(dep_terminal, arr_terminal, grade, dep_time) → planned_duration`을 저장합니다. 시외버스는 당일만 조회되므로 **일일 수집이 필수**입니다.
3. 터미널 좌표 테이블을 직접 구축합니다(고속 터미널은 API에 좌표가 없음).

### Phase 3 — traffic (단기)
1. 카카오 미래 운행 정보(무료량 확인 후)나 TMAP 타임머신으로 "터미널→터미널, 출발시각 T" 예측 승용차 시간을 조회합니다.
2. 버스 보정 = 예측 도로시간 × 대형차 계수 + 휴게소 정차(노선별 상수) + 터미널 진출입 여유. 계수는 Phase 4 데이터로 학습합니다.
3. 대안이나 보조로 도로공사 실시간 영업소간 통행시간을 씁니다(노선별 IC 매핑 필요).
4. 캐싱(노선×15분 버킷)으로 호출량을 제한하고, 결과 저장 가능 여부는 약관으로 확인합니다.

### Phase 4 — historical (중기, 지금 바로 수집 시작 권장)
1. **TAGO 고속버스도착정보 폴러**: 대상 노선의 운행 중 버스를 N분 간격으로 조회해 도착 추정·완료 시점을 기록합니다. 이것이 "실제 소요시간" 라벨이 됩니다. 먼저 응답 필드와 식별 키를 확인하는 스파이크(1일)를 하세요.
2. 도로공사 영업소간 통행시간·구간 통행시간 이력(파일/API)을 요일·시간대·특일 특징으로 결합합니다.
3. 모델: `actual = planned + f(도로혼잡 이력, 요일, 시간대, 특일, 날씨)`. 초기에는 노선별 분위수(P50/P80) 테이블로 시작합니다.
4. 시외버스(도착정보 API 없음)는 사용자 제보 버튼이나 도로 데이터 기반 추정으로 보완합니다.

### Holidays (전 단계 공통)
- 특일정보 `getRestDeInfo`를 월별로 캐시하고, "연휴 D-1/D+1, 명절 귀성·귀경 방향" 파생 특징을 만듭니다.
- 도로공사 도시간 소요시간(특일 코드)과 명절 교통예보를 명절 모델 검증에 씁니다.

### 하지 말 것
- KOBUS, 버스타고, 티머니 웹 스크래핑(약관·부하 위험, 공공 API로 대체할 수 있음)
- DTG 원천 데이터에 의존하는 설계(민간은 받기 어려움)

### 구현 전 확인 체크리스트 (미확인 항목)
- [ ] TAGO 고속버스정보/시외버스정보/도착정보의 **현행 엔드포인트 경로**(PascalCase 신경로 여부)와 이용허락범위
- [ ] 고속버스도착정보 응답 필드, 도착완료 차량 유지시간, 배차 식별 키
- [ ] 고속버스정보가 미래 날짜를 조회할 수 있는지
- [ ] 카카오 미래 운행 정보 일반형의 무료량, car_type 지원, 결과 저장 가능 여부
- [ ] TMAP 타임머신 무료량과 단가
- [ ] data.ex.co.kr 영업소간 통행시간 API의 버스 차종 구분과 트래픽 한도
- [ ] ITS 오픈API 트래픽 한도와 파라미터

---

## 4. 참고 URL

**직접 열람에 성공한 페이지 (GitHub):**
- https://github.com/digitie/python-datagokr-api (README)
- https://raw.githubusercontent.com/digitie/python-datagokr-api/main/src/datagokr/services/openapi.py
- https://raw.githubusercontent.com/digitie/python-datagokr-api/main/src/datagokr/models.py
- https://github.com/digitie/python-datagokr-api/pull/19
- https://github.com/dhmailing/RailFlow/pull/5
- https://github.com/team-offway/core/issues/463
- https://github.com/sunsik17/tyt-be/pull/37
- https://github.com/hyunbinseo/holidays-kr/issues/23
- https://github.com/yoon3660/Capstone_2026/issues/61

**검색 결과로만 확인한 공식 페이지 (직접 열람은 egress 차단):**
- https://www.data.go.kr/data/15098522/openapi.do (TAGO 고속버스정보)
- https://www.data.go.kr/data/15098541/openapi.do (TAGO 시외버스정보)
- https://www.data.go.kr/data/15098516/openapi.do (TAGO 고속버스도착정보)
- https://www.data.go.kr/data/15012690/openapi.do (특일 정보)
- https://www.data.go.kr/data/15076795/openapi.do (도시간 소요시간)
- https://www.data.go.kr/data/15076787/openapi.do (톨게이트간 통행시간)
- https://www.data.go.kr/data/15076684/openapi.do (실시간 소통 데이터)
- https://www.data.go.kr/data/15043743/fileData.do (구간 통행시간)
- https://www.data.go.kr/data/15050068/fileData.do (DTG 샘플)
- https://data.ex.co.kr/ , https://data.ex.co.kr/openapi/intro/introduce02 , https://data.ex.co.kr/portal/time/timeCompare
- https://www.its.go.kr/opendata/ , https://www.its.go.kr/opendata/opendataList?service=traffic
- https://openapi.sk.com/products/detail?linkMenuSeq=43
- https://developers.kakaomobility.com/product/naviapi.html
- https://exp.t-money.co.kr/bis/uat/uia/getTerminalArrivalInfoListD.do
- https://www.kobus.co.kr/ , https://www.bustago.or.kr/ , https://txbus.t-money.co.kr/
- https://main.kotsa.or.kr/portal/contents.do?menuCode=01040400
- https://lab.odsay.com/
- https://www.newspim.com/news/view/20260923000858 (도로공사 추석 교통예보)

---

## 5. BUSTA 코드와의 연결 지점

| 조사 결과 | 연결될 인터페이스 (`lib/data/types.ts`) | 현재 구현 | 다음 구현 |
|---|---|---|---|
| TAGO 고속/시외버스정보 | `ScheduleDataProvider` | `SampleScheduleDataProvider` (예시) | `TagoScheduleDataProvider` + 일일 수집 배치 |
| 특일정보 API | `HolidayCalendar` | `StaticHolidayCalendar` (2026년 수기 목록) | `KasiHolidayCalendar` (월별 캐시) |
| 카카오/TMAP 미래 길찾기, 도로공사 통행시간 | `TravelTimeDataProvider` | `MockTravelTimeDataProvider` (가정 규칙) | `TrafficApiTravelTimeDataProvider` |
| TAGO 고속버스도착정보 폴링 이력 | `TravelTimeDataProvider` + `TravelTimeObservation` | 없음 | `HistoricalTravelTimeDataProvider` |

---

## 6. 실측 검증 결과 (2026-09-26)

인증키 발급 → 네트워크 허용 후 **실제 응답을 먼저 받아보고** 구현했다. 실제 응답은 `tests/fixtures/data-go-kr/`에 그대로 저장(키 미포함)해 테스트에 쓴다.

### 조사(검색 기반) vs 실측

| 항목 | 조사 문서의 내용 | 실측 결과 | 영향 |
|---|---|---|---|
| TAGO 엔드포인트 | 신경로(PascalCase) 여부 미확인 | `/1613000/ExpBusInfo/GetStrtpntAlocFndExpbusInfo`, `/1613000/SuburbsBusInfo/GetStrtpntAlocFndSuberbsBusInfo` **동작 확인** | - |
| 고속 터미널 필드 | `terminalId`, `terminalNm`, `cityName` | **`terminalId`, `terminalNm`만** (cityName 없음). 453개 | 터미널 카탈로그를 직접 구성 |
| 시각 형식 | "YYYYMMDDHHmm 형태로 추정" | 고속 **12자리**, 시외 **14자리(초 포함)** 숫자 | 파서가 둘 다 처리 |
| 자정 출발편 | 언급 없음 | **`202609262400`처럼 전날 24:00으로 표기** | 다음날 00:00으로 정규화 후 해당 날짜 시간표로 이동 |
| 조회 가능 기간 | 고속: 미확인 / 시외: "당일만" | 고속: 어제~모레 정도(모레는 일부만: 76편), 이후 날짜는 **0건 정상 응답** / 시외: **내일도 조회됨** | 공개 전 날짜는 "참고 시간표"로 명시해 표시 |
| 잘못된 날짜 형식 | - | 오류 없이 0건 | 호출 전에 날짜 검증 필수 |
| 잘못된 키 | - | HTTP 403 + `OpenAPI_ServiceResponse` 구조 | 인증 오류로 분류, 재시도 안 함 |
| 소요시간 | 계획 소요 = arr − dep | 맞음. **같은 노선도 편마다 다름** (청주→수원 85/90분) | 소요시간을 노선이 아니라 **출발편 단위**로 저장 |
| 특일정보 | `getRestDeInfo` | 동작 확인. 2026년 22건 | 수기 목록에 **노동절·제헌절 누락** 발견 → 수정 |

### 노선 확인 (청주 기준, 2026-09-26)

| 노선 | 서비스 | 편수/일 | 시간표 소요 |
|---|---|---|---|
| 청주(고속) ↔ 서울경부 | 고속 | 123 / 141(00:00편 포함) | 90분 |
| 청주(고속) ↔ 동서울 | 고속 (`NAEK032`) | 10 / 10 | 100분 |
| 청주(시외) ↔ 동서울 | 시외 | 39 / 39 | 100분 / 90분 |
| 청주(시외) → 수원 | 시외 | 24 | 85·90분 |
| 수원 → 청주 | - | **0** (수원·서수원 → 청주 시외 터미널 5곳 모두) | 편도로만 제공 |
| 청주(시외) ↔ 대전복합 | 시외 | 50 / 42 | 60분 / 66분 |

- 청주 고속버스터미널(`NAEK400`)과 청주 시외버스터미널(`NAI2839701`)은 **다른 곳**이다 → BUSTA에서 "청주(고속)", "청주(시외)"로 구분
- 청주 → 수원·대전은 고속버스 노선이 없다 (시외만)
- 동서울은 고속 ID가 여럿(`NAEK030/031/032/035`)이고 청주행은 `NAEK032`에만 있었다

### 체크리스트 갱신
- [x] TAGO 고속/시외버스정보 현행 엔드포인트
- [x] 고속버스정보 미래 날짜 조회 → 어제~모레 정도만 가능
- [x] 특일정보 동작 및 응답 필드
- [ ] 고속버스도착정보 응답 필드 (Phase 4에서 확인)
- [ ] 모레 날짜가 "일부만" 오는 이유 (예매 오픈 시각 때문인지) — 관찰 필요
- [ ] 카카오/TMAP 미래 길찾기 무료량·약관
