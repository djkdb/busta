"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ArrowLeftRight,
  BusFront,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FlaskConical,
  Info,
  MapPin,
  Route,
  Sparkles,
} from "lucide-react";
import { mockRoutes } from "../../data/mock/routes";
import { buildReport } from "../../lib/prediction/service";
import { formatDate, formatDuration } from "../../lib/utils/time";
import type {
  PredictionInput,
  PredictionReport,
  PredictionResult,
} from "../../types/prediction";
const cities = [...new Set(mockRoutes.map((route) => route.origin))];
const delta = (minutes: number) => `${minutes > 0 ? "+" : ""}${minutes}분`;
export function JourneyPlanner({ initial }: { initial: PredictionReport }) {
  const [origin, setOrigin] = useState(initial.selected.route.origin);
  const [destination, setDestination] = useState(
    initial.selected.route.destination,
  );
  const [date, setDate] = useState(initial.selected.input.date);
  const [time, setTime] = useState(initial.selected.input.departureTime);
  const [report, setReport] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLElement>(null);
  const selected = report.selected;
  const route = mockRoutes.find(
    (route) => route.origin === origin && route.destination === destination,
  );
  const isDirty =
    route?.id !== selected.input.routeId ||
    date !== selected.input.date ||
    time !== selected.input.departureTime;
  const best = report.hourly.reduce((best, result) =>
    result.durationMinutes < best.durationMinutes ? result : best,
  );
  const alternatives = report.hourly
    .filter(
      (result) =>
        result.input.departureTime >= "14:00" &&
        result.input.departureTime <= "20:00",
    )
    .sort((a, b) => a.durationMinutes - b.durationMinutes)
    .slice(0, 3);
  async function search(input?: PredictionInput) {
    setError("");
    if (!input && !route) {
      setError("출발지와 도착지를 다르게 선택해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const next = await buildReport(
        input ?? { routeId: route!.id, date, departureTime: time },
      );
      setReport(next);
      setOrigin(next.selected.route.origin);
      setDestination(next.selected.route.destination);
      setDate(next.selected.input.date);
      setTime(next.selected.input.departureTime);
      resultRef.current?.focus({ preventScroll: true });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "계산하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  }
  const choose = (result: PredictionResult) => search(result.input);
  return (
    <>
      <a className="skip-link" href="#planner">
        검색으로 바로가기
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="busta 홈">
            <span className="brand-icon">
              <BusFront size={23} />
            </span>
            busta<span className="brand-dot">.</span>
          </Link>
          <nav aria-label="주 메뉴">
            <a className="active" href="#planner">
              도착시간 찾기
            </a>
            <a href="#how-it-works">
              서비스 소개 <ArrowUpRight size={14} />
            </a>
          </nav>
          <span className="prototype">
            <span />
            MVP PROTOTYPE
          </span>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> LESS GUESSING, BETTER ARRIVING
            </div>
            <h1>
              출발은 정해졌어도,
              <br />
              <span>도착은 다르니까.</span>
            </h1>
            <p>
              시간표에 적힌 시간, 그 너머의 도착시간.
              <br className="mobile-break" /> 언제 출발하면 좋을지 busta와
              비교해 보세요.
            </p>
          </div>
          <div className="journey-art" aria-hidden="true">
            <span className="art-top">YOUR NEXT JOURNEY</span>
            <div className="art-route">
              <span className="art-stop" />
              <span className="art-line" />
              <span className="art-bus">
                <BusFront size={29} />
              </span>
              <span className="art-line" />
              <MapPin size={33} />
            </div>
            <div className="art-labels">
              <span>출발의 순간</span>
              <span>도착의 여유</span>
            </div>
          </div>
        </section>
        <div className="demo-notice">
          <FlaskConical size={18} />
          <p>
            <strong>지금은 예시 데이터로 달리는 중이에요.</strong> 모든
            노선·소요시간은 Mock 데이터이며, 실제 시간표나 교통 상황을 반영하지
            않습니다.
          </p>
          <a href="#how-it-works">
            데이터 안내 <ArrowUpRight size={14} />
          </a>
        </div>
        <section
          id="planner"
          className="search-panel"
          aria-labelledby="search-title"
        >
          <div className="section-kicker">
            <span>01</span>
            <h2 id="search-title">어디로 떠나시나요?</h2>
            <span className="timezone">한국 시간 기준 · KST</span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <fieldset disabled={loading} className="search-fields">
              <label className="field">
                <span>
                  <MapPin size={14} /> 출발지
                </span>
                <div className="select-wrap">
                  <select
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                    aria-label="출발지"
                  >
                    {cities.map((city) => (
                      <option key={city}>{city}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>
              <button
                className="swap-button"
                type="button"
                aria-label="출발지와 도착지 바꾸기"
                onClick={() => {
                  setOrigin(destination);
                  setDestination(origin);
                }}
              >
                <ArrowLeftRight size={17} />
              </button>
              <label className="field">
                <span>
                  <MapPin size={14} /> 도착지
                </span>
                <div className="select-wrap">
                  <select
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    aria-label="도착지"
                  >
                    {cities.map((city) => (
                      <option key={city}>{city}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} />
                </div>
              </label>
              <label className="field date-field">
                <span>
                  <CalendarDays size={14} /> 가는 날
                </span>
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="field time-field">
                <span>
                  <Clock3 size={14} /> 출발시간
                </span>
                <input
                  required
                  type="time"
                  step="60"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
              <button className="search-button" type="submit">
                {loading ? "계산 중…" : "도착시간 확인"}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {isDirty && (
            <p className="dirty-note">
              조건을 바꿨어요. ‘도착시간 확인’을 누르면 아래 결과가 갱신됩니다.
            </p>
          )}
        </section>
        <section
          ref={resultRef}
          tabIndex={-1}
          className="results-section"
          aria-labelledby="result-title"
          aria-busy={loading}
        >
          <div className="results-heading">
            <div>
              <div className="section-kicker">
                <span>02</span>
                <span>나의 여정 미리보기</span>
              </div>
              <h2 id="result-title">
                {selected.route.origin} <ArrowRight size={22} />{" "}
                {selected.route.destination}
                <span className="route-tag">예시 노선</span>
              </h2>
            </div>
            <p>
              {formatDate(selected.input.date)}
              <span className="separator">/</span>
              {selected.input.departureTime} 출발
            </p>
          </div>
          <div className="result-grid" aria-live="polite" aria-atomic="true">
            <article className="arrival-card">
              <div className="card-label">
                <span>
                  <span className="live-dot" /> 시뮬레이션 도착시간
                </span>
                <ArrowUpRight size={22} />
              </div>
              <div className="arrival-time" data-testid="arrival-time">
                {selected.arrivalTime}
                <span>
                  {selected.dayOffset ? `+${selected.dayOffset}일` : "도착"}
                </span>
              </div>
              <p className="arrival-date">{formatDate(selected.arrivalDate)}</p>
              <div className="ticket-line" />
              <div className="trip-line">
                <div>
                  <span>출발</span>
                  <strong>{selected.input.departureTime}</strong>
                </div>
                <div className="trip-track">
                  <span />
                  <BusFront size={17} />
                  <span />
                </div>
                <div>
                  <span>도착 예상</span>
                  <strong>{selected.arrivalTime}</strong>
                </div>
              </div>
              <div className="card-footnote">
                예시 규칙으로 계산한 결과 · 실제 도착 보장 없음
              </div>
            </article>
            <article className="duration-card">
              <div className="card-label">
                <span>예상 소요시간</span>
                <Clock3 size={19} />
              </div>
              <div className="duration-value" data-testid="duration">
                {formatDuration(selected.durationMinutes)}
              </div>
              <span
                className={
                  selected.differenceMinutes > 0
                    ? "difference"
                    : "difference faster"
                }
              >
                {delta(selected.differenceMinutes)}{" "}
                <span>시간표 예시 대비</span>
              </span>
              <div className="baseline-row">
                <span>
                  시간표 소요시간 <small>예시</small>
                </span>
                <strong>
                  {formatDuration(selected.route.baselineMinutes)}
                </strong>
              </div>
              <p>
                실제 운행 기록을 확보하면
                <br />
                공식 시간표와 비교할 수 있어요.
              </p>
            </article>
            <article className="insight-card">
              <div className="insight-icon">
                <Sparkles size={20} />
              </div>
              <span className="mini-label">출발시간을 바꿔보면?</span>
              <h3>
                {best.input.departureTime} 출발은
                <br />
                <em>{formatDuration(best.durationMinutes)}</em> 걸려요.
              </h3>
              <p>
                비교한 시간 중 가장 짧은 예시 결과예요.
                <br />
                선택한 출발보다{" "}
                {selected.durationMinutes - best.durationMinutes}분 짧아요.
              </p>
              <button disabled={loading} onClick={() => void choose(best)}>
                이 시간으로 확인 <ArrowRight size={16} />
              </button>
            </article>
          </div>
        </section>
        <section
          id="comparison"
          className="analysis-panel"
          aria-labelledby="analysis-title"
        >
          <div className="analysis-heading">
            <div>
              <div className="section-kicker">
                <span>03</span>
                <span>조금 다른 시간, 더 여유로운 도착</span>
              </div>
              <h2 id="analysis-title">몇 시에 출발하면 덜 걸릴까요?</h2>
              <p>
                같은 날, 같은 노선의 출발시간별 예시 소요시간을 비교해 보세요.
              </p>
            </div>
            <span className="chart-legend">
              <i /> 선택한 출발시간
            </span>
          </div>
          <div className="chart-scroll">
            <div
              className="bar-chart"
              role="group"
              aria-label="시간대별 예시 소요시간. 막대를 선택하면 해당 시간으로 계산합니다."
            >
              {report.hourly.map((result) => {
                const active =
                  result.input.departureTime === selected.input.departureTime;
                const max = Math.max(
                  ...report.hourly.map((item) => item.durationMinutes),
                );
                return (
                  <button
                    disabled={loading}
                    key={result.input.departureTime}
                    className={`chart-column ${active ? "selected" : ""}`}
                    aria-pressed={active}
                    aria-label={`${result.input.departureTime} 출발, ${formatDuration(result.durationMinutes)}`}
                    title={`${result.input.departureTime} · ${formatDuration(result.durationMinutes)}`}
                    onClick={() => void choose(result)}
                  >
                    <span className="bar-value">
                      {result.durationMinutes}
                      <small>분</small>
                    </span>
                    <span className="bar-track">
                      <span
                        className="bar"
                        style={{
                          height: `${(result.durationMinutes / max) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="bar-time">
                      {result.input.departureTime}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="chart-caption">
            <Info size={14} />
            <span>
              06–23시 매시 정각과 선택한 시간 비교 · 운행 편이 아닌 시간대
              시뮬레이션입니다.
            </span>
          </div>
          <details className="data-table">
            <summary>
              시간별 결과를 표로 보기 <ChevronDown size={16} />
            </summary>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  시간대별 예시 소요시간과 도착시간
                </caption>
                <thead>
                  <tr>
                    <th>출발시간</th>
                    <th>예상 소요시간</th>
                    <th>도착시간</th>
                    <th>기준 대비</th>
                  </tr>
                </thead>
                <tbody>
                  {report.hourly.map((result) => (
                    <tr key={result.input.departureTime}>
                      <td>{result.input.departureTime}</td>
                      <td>{formatDuration(result.durationMinutes)}</td>
                      <td>
                        {result.arrivalTime}
                        {result.dayOffset > 0 && ` (+${result.dayOffset}일)`}
                      </td>
                      <td>{delta(result.differenceMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="alternatives" aria-labelledby="alternatives-title">
          <div>
            <span className="mini-label">AFTERNOON PICKS</span>
            <h2 id="alternatives-title">오후에 떠난다면</h2>
            <p>
              14–20시 예시 중 짧은 순서예요.
              <br />
              실제 버스 배차는 별도로 확인해 주세요.
            </p>
          </div>
          {alternatives.map((result, index) => (
            <button
              disabled={loading}
              key={result.input.departureTime}
              className="alternative"
              onClick={() => void choose(result)}
            >
              <span className="alternative-top">
                {index === 0 ? (
                  <>
                    <Check size={13} /> 가장 짧은 예시
                  </>
                ) : (
                  `${index + 1}번째 선택`
                )}
              </span>
              <strong>
                {result.input.departureTime}
                <ArrowRight size={16} />
                {result.arrivalTime}
              </strong>
              <span>
                {formatDuration(result.durationMinutes)} 소요{" "}
                <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </section>
        <section id="how-it-works" className="about">
          <div>
            <span className="mini-label">A MORE THOUGHTFUL JOURNEY</span>
            <h2>시간표보다 한 걸음 더.</h2>
            <p>
              busta는 ‘몇 시에 출발할까’에서 ‘몇 시에 도착할까’로
              <br />
              질문을 바꾸는 시외버스 ETA 프로젝트입니다.
            </p>
          </div>
          <div className="method">
            <div>
              <Route size={19} />
              <span>
                <strong>시간표 예시</strong>
                <small>6개 방향별 노선의 가상 기준 시간</small>
              </span>
              <ArrowDown size={14} />
            </div>
            <div>
              <CalendarDays size={19} />
              <span>
                <strong>요일 + 출발시간</strong>
                <small>평일·주말 패턴을 가정한 고정 규칙</small>
              </span>
              <ArrowDown size={14} />
            </div>
            <div>
              <Clock3 size={19} />
              <span>
                <strong>예상 도착시간</strong>
                <small>기준 시간 × 시간대 계수, 분 단위 반올림</small>
              </span>
            </div>
          </div>
        </section>
        <div className="limitations">
          <Info size={17} />
          <p>
            현재 예측은 학습된 AI 모델이 아닙니다. 날씨·공휴일·사고·실시간
            정체·경유지·방향별 차이는 반영하지 않으며, 정확도와 도착 확률을
            제공하지 않습니다. 실제 이동 계획에는 운송사의 시간표를 확인해
            주세요.
          </p>
        </div>
      </main>
      <footer>
        <Link className="brand" href="/">
          busta<span className="brand-dot">.</span>
        </Link>
        <span>도착을 생각하는 버스 여행</span>
        <span>CUVIC VIBE CODING PROJECT · 2026</span>
      </footer>
    </>
  );
}
