/**
 * TAGO 고속버스도착정보 (GetExpBusArrPrdtInfo) 파서.
 *
 * 실제 응답에서 확인한 사실 (2026-09-26, tests/fixtures/data-go-kr/arrival-*.json)
 *  - 경로는 신경로 `/1613000/ExpBusArrInfo/...` 만 동작 (…Service 경로는 NO_OPENAPI_SERVICE_ERROR)
 *  - 터미널 코드는 3자리(tmnCd "400") = 고속버스정보의 NAEK 접미사와 같다 (NAEK400 → 400)
 *  - item: { depTm "15:10", arrPrdtTm "2026-09-26 16:36", rmnTm "도착완료" | "00시간 05분",
 *            busGrdNm, corpNm, curLocNm }
 *  - **실시간이 아니다.** 약 15분마다 갱신되고, 조회 시각보다 20~35분 늦은 데이터였다.
 *    기준 시각 = arrPrdtTm − rmnTm (운행 중인 편들에서 공통으로 나온다) → 화면에 반드시 표시
 *  - 아직 출발하지 않은 편은 여러 편이 같은 도착 예정시각을 갖는 등 값이 의미 없다 → 예정시각을 쓰지 않는다
 *  - "도착완료" 편의 arrPrdtTm 은 도착이 기록된 시각으로 보인다 (운행 중 예측보다 늦게 찍히기도 함)
 */
import { addMinutesToDateTime, parseClockTime } from "@/lib/utils/time";
import type { ClockTime, ISODate } from "@/types/domain";
import type { LiveSnapshot, LiveTrip, LiveTripStatus } from "../types";

export interface TagoArrivalItem {
  depTm?: string;
  arrPrdtTm?: string;
  rmnTm?: string;
  busGrdNm?: string;
  corpNm?: string;
  curLocNm?: string;
}

const toAbs = (date: ISODate, time: ClockTime) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 60_000 +
  parseClockTime(time)!;

function fromAbs(abs: number): { date: ISODate; time: ClockTime } {
  const dayStart = Math.floor(abs / 1440) * 1440;
  const d = new Date(dayStart * 60_000);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const arrival = addMinutesToDateTime(date, 0, abs - dayStart);
  return { date: arrival.date, time: arrival.time };
}

function parseDateTime(value: string | undefined): { date: ISODate; time: ClockTime } | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(value?.trim() ?? "");
  if (!m || parseClockTime(m[2]) === null) return null;
  return { date: m[1], time: m[2] };
}

function parseRemaining(value: string | undefined): number | "arrived" | null {
  const v = value?.trim() ?? "";
  if (v === "도착완료") return "arrived";
  const m = /^(\d+)시간\s*(\d+)분$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 가장 많이 나온 값 */
function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  for (const [v, c] of counts) if (best === null || c > counts.get(best)!) best = v;
  return best;
}

export function parseArrivalSnapshot(items: TagoArrivalItem[]): LiveSnapshot {
  type Raw = { item: TagoArrivalItem; arr: { date: ISODate; time: ClockTime }; remaining: number | "arrived" };
  const raws: Raw[] = [];
  let skipped = 0;
  for (const item of items) {
    const arr = parseDateTime(item.arrPrdtTm);
    const remaining = parseRemaining(item.rmnTm);
    if (!arr || remaining === null || parseClockTime(item.depTm ?? "") === null) {
      skipped++;
      continue;
    }
    raws.push({ item, arr, remaining });
  }

  // 기준 시각 = 도착예정 − 남은시간 (운행 중인 편들의 최빈값)
  const baseAbs = mode(
    raws.filter((r) => r.remaining !== "arrived").map((r) => toAbs(r.arr.date, r.arr.time) - (r.remaining as number)),
  );

  const trips: LiveTrip[] = raws.map(({ item, arr, remaining }) => {
    const arrAbs = toAbs(arr.date, arr.time);
    // 출발일: 도착일과 같은 날로 두되, 출발시각이 도착시각보다 늦으면 전날 (자정을 넘는 운행)
    let depAbs = toAbs(arr.date, item.depTm!);
    if (depAbs > arrAbs) depAbs -= 1440;
    const dep = fromAbs(depAbs);

    let status: LiveTripStatus;
    if (remaining === "arrived") status = "arrived";
    else if (baseAbs !== null && depAbs > baseAbs) status = "not-departed";
    else status = "en-route";

    const hasArrival = status !== "not-departed";
    return {
      departureDate: dep.date,
      departureTime: dep.time,
      status,
      arrival: hasArrival ? arr : null,
      durationMinutes: hasArrival ? arrAbs - depAbs : null,
      remainingMinutes: typeof remaining === "number" && hasArrival ? remaining : null,
      grade: item.busGrdNm?.trim() || null,
      operator: item.corpNm?.trim() || null,
      location: item.curLocNm?.trim() || null,
    };
  });
  trips.sort((a, b) => toAbs(a.departureDate, a.departureTime) - toAbs(b.departureDate, b.departureTime));

  return { basedAt: baseAbs === null ? null : fromAbs(baseAbs), trips, skipped };
}
