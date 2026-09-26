"use client";

import { useState } from "react";
import type { DeparturePoint } from "@/lib/prediction/analytics";
import { formatDelay, formatDurationCompact } from "@/lib/utils/time";

const W = 360;
const H = 170;
const PAD = { top: 14, right: 6, bottom: 22, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function niceStep(range: number) {
  for (const s of [5, 10, 15, 20, 30, 60]) if (range / s <= 4) return s;
  return 60;
}

/** 기준선(y0)에 붙은 쪽은 각지게, 데이터 끝은 4px 둥글게 */
function barPath(x: number, w: number, y0: number, y1: number) {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0));
  if (y1 < y0) {
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

/**
 * 시간대별 "시간표 대비 추가 소요" 차트.
 * 0 = 시간표 소요시간. 위로 = 더 오래 걸림, 아래로 = 더 빨리 도착.
 */
export function HourlyChart({
  points,
  selectedTime,
}: {
  points: DeparturePoint[];
  selectedTime: string;
}) {
  const selectedIndex = points.findIndex((p) => p.departureTime === selectedTime);
  const defaultIndex = Math.max(0, selectedIndex);
  const [active, setActive] = useState(defaultIndex);

  if (points.length === 0) return null;

  const delays = points.map((p) => p.delayMinutes);
  const rawMax = Math.max(0, ...delays);
  const rawMin = Math.min(0, ...delays);
  const step = niceStep(Math.max(10, rawMax - rawMin));
  const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
  const yMin = Math.floor(rawMin / step) * step;
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * PLOT_H;
  const band = PLOT_W / points.length;
  const barW = Math.max(4, band * 0.62);

  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(v);

  const maxIndex = delays.indexOf(Math.max(...delays));
  const current = points[active];

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-bold">시간대별 예상 소요시간</h2>
      <p className="mt-0.5 text-xs text-ink-3">
        같은 날 1시간 간격 출발 가정 · 가로선 = 시간표 소요시간(
        {formatDurationCompact(points[0].scheduledDurationMinutes)}) · 막대를 누르면 상세
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full touch-manipulation select-none"
        role="img"
        aria-label="시간대별 시간표 대비 예상 추가 소요시간 막대 차트"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth={t === 0 ? 1.5 : 1}
              strokeDasharray={t === 0 ? undefined : "2 3"}
            />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-3)">
              {t === 0 ? "시간표" : `${t > 0 ? "+" : ""}${t}분`}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const x = PAD.left + i * band + (band - barW) / 2;
          const isActive = i === active;
          const isSelected = i === selectedIndex;
          // 선택 시각 라벨과 겹치는 이웃 눈금 라벨은 생략한다
          const showTick = isSelected || (i % 3 === 0 && Math.abs(i - selectedIndex) > 1);
          const fill = p.delayMinutes >= 0 ? (isActive ? "var(--accent)" : "var(--accent-bar)") : "var(--ink-3)";
          const showLabel = isActive || i === maxIndex;
          return (
            <g key={p.departureTime}>
              {p.delayMinutes !== 0 && (
                <path
                  d={barPath(x, barW, y(0), y(p.delayMinutes))}
                  fill={fill}
                  opacity={p.delayMinutes < 0 && !isActive ? 0.55 : 1}
                />
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={p.delayMinutes >= 0 ? y(p.delayMinutes) - 4 : y(p.delayMinutes) + 11}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={700}
                  fill="var(--ink)"
                >
                  {formatDelay(p.delayMinutes).replace("분", "")}
                </text>
              )}
              {showTick && (
                <text
                  x={x + barW / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isSelected ? 700 : 400}
                  fill={isSelected ? "var(--ink)" : "var(--ink-3)"}
                >
                  {Number(p.departureTime.slice(0, 2))}시
                </text>
              )}
              {/* 막대보다 넓은 터치 영역 */}
              <rect
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={PLOT_H}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${p.departureTime} 출발 예상 ${formatDurationCompact(p.predictedDurationMinutes)}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                onFocus={() => setActive(i)}
                className="cursor-pointer outline-none"
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex items-baseline justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm" aria-live="polite">
        <span className="font-semibold">{current.departureTime} 출발</span>
        <span className="tabular-nums text-ink-2">
          예상 <strong className="text-ink">{formatDurationCompact(current.predictedDurationMinutes)}</strong>
          {" · "}
          {formatDelay(current.delayMinutes)}
          {" · "}
          도착 {current.predictedArrivalTime}
          {current.arrivalDayOffset > 0 && "(+1일)"}
        </span>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-3">표로 보기</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="py-1 font-medium">출발</th>
              <th className="py-1 font-medium">예상 소요</th>
              <th className="py-1 font-medium">시간표 대비</th>
              <th className="py-1 font-medium">예상 도착</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {points.map((p) => (
              <tr key={p.departureTime}>
                <td className="py-1">{p.departureTime}</td>
                <td className="py-1">{formatDurationCompact(p.predictedDurationMinutes)}</td>
                <td className="py-1">{formatDelay(p.delayMinutes)}</td>
                <td className="py-1">
                  {p.predictedArrivalTime}
                  {p.arrivalDayOffset > 0 && " (+1일)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
