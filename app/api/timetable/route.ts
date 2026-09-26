/**
 * 검색 폼용 시간표 조회: GET /api/timetable?from=&to=&date=YYYY-MM-DD
 * 실제 시간표는 날짜마다 다르므로 폼이 날짜·노선을 바꿀 때마다 호출한다.
 * API 키는 서버에서만 쓰이고 응답에 포함되지 않는다.
 */
import type { NextRequest } from "next/server";
import { ScheduleUnavailableError } from "@/lib/data/types";
import { getServices } from "@/lib/services";
import { isValidDate } from "@/lib/utils/time";

export interface TimetableResponse {
  date: string;
  referenceDate: string;
  departures: { time: string; grade: string | null; durationMinutes: number }[];
  notes: string[];
  source: { label: string; isRealData: boolean };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const date = q.get("date") ?? "";
  if (!isValidDate(date)) return Response.json({ error: "잘못된 날짜입니다." }, { status: 400 });

  const { schedules } = getServices();
  const route = await schedules.findRoute(from, to);
  if (!route) return Response.json({ error: "노선 정보가 없습니다." }, { status: 404 });

  try {
    const tt = await schedules.getTimetable(route.id, date);
    const body: TimetableResponse = {
      date: tt.date,
      referenceDate: tt.referenceDate,
      departures: tt.departures.map((d) => ({
        time: d.departureTime,
        grade: d.grade ?? null,
        durationMinutes: d.scheduledDurationMinutes,
      })),
      notes: tt.notes,
      source: { label: tt.source.label, isRealData: tt.source.isRealData },
    };
    return Response.json(body);
  } catch (e) {
    if (!(e instanceof ScheduleUnavailableError)) throw e;
    console.error(`[BUSTA] ${e.message}`);
    return Response.json({ error: "시간표 정보를 불러오지 못했습니다." }, { status: 502 });
  }
}
