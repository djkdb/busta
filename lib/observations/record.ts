/**
 * 실제 운행 기록(관측) — BUSTA 의 정확도를 측정하고 예측을 실측으로 바꾸는 근거.
 *
 * 출처: TAGO 고속버스도착정보의 "도착완료" 편. 이 API 는 도착 후 잠깐만 기록을 보여주므로
 * 수집기(scripts/collect.ts)가 주기적으로 조회해 JSONL 로 쌓는다 (busta-data 브랜치).
 */
import type { LiveSnapshot } from "@/lib/data/types";
import { getDayOfWeek } from "@/lib/utils/time";
import type { ClockTime, ISODate, TravelTimeObservation } from "@/types/domain";

export interface ObservationRecord extends TravelTimeObservation {
  arrivalDate: ISODate;
  arrivalTime: ClockTime;
  grade: string | null;
  /** 수집기가 조회한 시각 (ISO 8601, UTC) */
  observedAt: string;
  /** 원본 데이터의 기준 시각 (실시간이 아님) */
  feedBasedAt: string | null;
  /**
   * 도착 시각이 데이터 기준 시각과 같다 → 실제 도착이 아니라 "도착이 감지된 시점"일 수 있다.
   * 실측(2026-11-17)에서 이런 기록 중 하나가 뒤에 출발한 편보다 18분 늦게 도착한 것으로 나왔다.
   * 저장은 하되 예측 계산에서는 제외한다.
   */
  arrivalAtFeedTime: boolean;
}

/** 스냅샷의 "도착완료" 편 → 관측 기록 */
export function observationsFromSnapshot(
  routeId: string,
  snapshot: LiveSnapshot,
  observedAt: Date,
): ObservationRecord[] {
  return snapshot.trips
    .filter((t) => t.status === "arrived" && t.arrival && t.durationMinutes !== null)
    .map((t) => ({
      arrivalAtFeedTime:
        snapshot.basedAt !== null &&
        snapshot.basedAt.date === t.arrival!.date &&
        snapshot.basedAt.time === t.arrival!.time,
      id: `${routeId}@${t.departureDate}T${t.departureTime}`,
      routeId,
      date: t.departureDate,
      dayOfWeek: getDayOfWeek(t.departureDate),
      departureTime: t.departureTime,
      actualDurationMinutes: t.durationMinutes!,
      source: "historical" as const,
      arrivalDate: t.arrival!.date,
      arrivalTime: t.arrival!.time,
      grade: t.grade,
      observedAt: observedAt.toISOString(),
      feedBasedAt: snapshot.basedAt ? `${snapshot.basedAt.date}T${snapshot.basedAt.time}` : null,
    }));
}

/** 같은 편(id)은 처음 관측된 값을 유지한다. 반환: 합친 목록과 새로 추가된 수 */
export function mergeObservations(
  existing: ObservationRecord[],
  incoming: ObservationRecord[],
): { merged: ObservationRecord[]; added: number } {
  const byId = new Map(existing.map((o) => [o.id, o]));
  let added = 0;
  for (const o of incoming) {
    if (byId.has(o.id)) continue;
    byId.set(o.id, o);
    added++;
  }
  const merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { merged, added };
}

const REQUIRED: (keyof ObservationRecord)[] = ["id", "routeId", "date", "departureTime", "actualDurationMinutes"];

/** JSONL → 기록. 깨진 줄은 버리고 개수를 알려준다 */
export function parseJsonl(text: string): { records: ObservationRecord[]; skipped: number } {
  const records: ObservationRecord[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as ObservationRecord;
      if (!REQUIRED.every((k) => r[k] !== undefined && r[k] !== null) || r.actualDurationMinutes <= 0) {
        skipped++;
        continue;
      }
      // 이 필드가 생기기 전에 수집된 기록: 저장된 값으로 다시 계산한다 (없는 값을 "정상"으로 취급하지 않기 위해)
      if (typeof r.arrivalAtFeedTime !== "boolean") {
        r.arrivalAtFeedTime = r.feedBasedAt != null && r.feedBasedAt === `${r.arrivalDate}T${r.arrivalTime}`;
      }
      records.push(r);
    } catch {
      skipped++;
    }
  }
  return { records, skipped };
}

export function toJsonl(records: ObservationRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}

/** "2026-11-17" → "2026-11" (월별 파일 이름) */
export const monthKey = (date: ISODate) => date.slice(0, 7);

/** 기준 월부터 과거로 n개월 */
export function recentMonths(date: ISODate, count: number): string[] {
  let y = Number(date.slice(0, 4));
  let m = Number(date.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (--m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}
