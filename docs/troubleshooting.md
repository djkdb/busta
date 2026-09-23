# 트러블슈팅

## 1. 내부 홈 링크 lint 오류

- 문제: 첫 lint에서 `/`로 이동하는 `<a>` 두 곳이 Next.js 규칙을 위반했다.
- 원인: 프레임워크의 내부 탐색용 Link를 쓰지 않았다.
- AI의 초기 분석: 동작 자체와 별개로 Next.js의 라우팅 규칙을 따라야 한다.
- 직접 확인: `npm run lint`의 `@next/next/no-html-link-for-pages` 오류 2개.
- 해결: 로고의 홈 링크를 `next/link`로 변경했다. 페이지 내 앵커 링크는 유지했다.
- 결과: lint 통과.
- 배운 점: 브라우저에서 보이는 동작뿐 아니라 선택한 프레임워크의 규칙도 검증해야 한다.

## 2. CommonJS와 ESM 충돌로 production build 실패

- 문제: 타입 검사와 단위 테스트는 통과했지만 Turbopack build에서 8개의 모듈 형식 충돌이 발생했다.
- 원인: `npm init`이 만든 package.json에 `type: commonjs`가 남아 있었고 실제 코드는 import/export 기반 ESM이었다.
- AI의 초기 분석: 코드 구문을 바꾸기보다 프로젝트 설정을 실제 모듈 방식과 일치시켜야 한다.
- 직접 확인: build의 `Specified module format (CommonJs) ... EcmaScript Modules` 오류와 Vitest 설정 경고.
- 해결: package.json의 type을 module로 수정했다.
- 결과: lint·타입 검사·19개 단위 테스트·production build 통과.
- 배운 점: 테스트 실행기의 변환이 설정 문제를 가릴 수 있다. production build도 완료 조건으로 둔다.

## 3. E2E 에러 메시지 선택자 중복

- 문제: 첫 E2E 4개 중 2개가 `getByRole('alert')` strict-mode 오류로 실패했다.
- 원인: 앱의 입력 에러와 Next.js의 `__next-route-announcer__`가 모두 alert 역할을 가졌다.
- AI의 초기 분석: 애플리케이션의 에러 표시는 정상이며 테스트 대상이 너무 넓었다.
- 직접 확인: Playwright 오류에 실제 입력 에러와 비어 있는 라우트 안내 요소가 각각 표시됐다.
- 해결: alert 선택자를 실제 기대 메시지 `다르게`로 필터링해 입력 검증 결과를 명시적으로 찾도록 했다.
- 결과: 데스크톱 2개, 모바일 Chromium 2개, 총 4개 E2E 통과.
- 배운 점: 프레임워크의 접근성 요소와 앱의 검증 메시지를 구분하면서 사용자 관점의 의미 기반 선택자를 유지한다.
