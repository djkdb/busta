/**
 * BUSTA 실제 운행 기록 수집기.
 *
 *   npx tsx scripts/collect.ts --out <dir>                # 고속버스 도착 완료 기록을 <dir>/observations/YYYY-MM.jsonl 에 추가
 *   npx tsx scripts/collect.ts --out <dir> --timetables   # + 오늘·내일 실제 시간표를 <dir>/timetables/YYYY-MM-DD/<노선>.json 으로 보관
 *
 * GitHub Actions(.github/workflows/collect.yml)가 20분마다 실행해 busta-data 브랜치에 커밋한다.
 * 도착정보 API 는 도착 후 잠깐만 기록을 보여주므로 조회 간격이 길면 기록을 놓친다.
 * 서비스 키: DATA_GO_KR_SERVICE_KEY (출력·로그에 절대 찍지 않음)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TAGO_ROUTES } from "@/data/catalog/tago-routes";
import { PublicDataClient } from "@/lib/data/public-data/client";
import { TagoLiveArrivalProvider } from "@/lib/data/tago/tago-live-arrival-provider";
import { TagoScheduleDataProvider } from "@/lib/data/tago/tago-schedule-provider";
import { TAGO_TERMINALS } from "@/data/catalog/tago-routes";
import {
  mergeObservations,
  monthKey,
  observationsFromSnapshot,
  parseJsonl,
  toJsonl,
  type ObservationRecord,
} from "@/lib/observations/record";
import { addDays, todayInKorea } from "@/lib/utils/time";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw e;
  }
}

async function collectObservations(client: PublicDataClient, outDir: string, now: Date) {
  const live = new TagoLiveArrivalProvider(client, TAGO_ROUTES, 0);
  const incoming: ObservationRecord[] = [];
  const failures: string[] = [];
  for (const route of TAGO_ROUTES.filter((r) => r.tago.service === "express")) {
    try {
      const snapshot = await live.getLiveSnapshot(route.id);
      if (!snapshot) continue;
      const obs = observationsFromSnapshot(route.id, snapshot, now);
      incoming.push(...obs);
      console.log(`  ${route.id}: 기준 ${snapshot.basedAt?.time ?? "-"}, 도착완료 ${obs.length}건, 전체 ${snapshot.trips.length}건`);
    } catch (e) {
      failures.push(route.id);
      console.error(`  ${route.id}: 실패 (${e instanceof Error ? e.message : e})`);
    }
  }

  const dir = join(outDir, "observations");
  await mkdir(dir, { recursive: true });
  let added = 0;
  for (const month of [...new Set(incoming.map((o) => monthKey(o.date)))]) {
    const path = join(dir, `${month}.jsonl`);
    const existing = parseJsonl(await readText(path)).records;
    const result = mergeObservations(existing, incoming.filter((o) => monthKey(o.date) === month));
    if (result.added > 0) await writeFile(path, toJsonl(result.merged));
    added += result.added;
  }
  console.log(`관측 기록: 새로 ${added}건 추가 (조회 ${incoming.length}건, 실패 노선 ${failures.length}개)`);
  return { added, failures };
}

async function archiveTimetables(client: PublicDataClient, outDir: string, now: Date) {
  const provider = new TagoScheduleDataProvider(client, TAGO_TERMINALS, TAGO_ROUTES, { now: () => now });
  const today = todayInKorea(now);
  let saved = 0;
  for (const date of [today, addDays(today, 1)]) {
    for (const route of TAGO_ROUTES) {
      try {
        const tt = await provider.getTimetable(route.id, date);
        // 참고 시간표(다른 날짜)는 보관하지 않는다: 그 날짜의 실제 시간표만 쌓는다
        if (tt.referenceDate !== date || tt.departures.length === 0) continue;
        const dir = join(outDir, "timetables", date);
        await mkdir(dir, { recursive: true });
        const compact = tt.departures.map((d) => ({ t: d.departureTime, m: d.scheduledDurationMinutes, g: d.grade ?? null }));
        await writeFile(join(dir, `${route.id}.json`), JSON.stringify({ routeId: route.id, date, departures: compact }) + "\n");
        saved++;
      } catch (e) {
        console.error(`  시간표 ${route.id} ${date}: 실패 (${e instanceof Error ? e.message : e})`);
      }
    }
  }
  console.log(`시간표 보관: ${saved}개 파일`);
}

async function main() {
  const outDir = arg("--out");
  const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!outDir) throw new Error("--out <dir> 이 필요합니다.");
  if (!key) throw new Error("DATA_GO_KR_SERVICE_KEY 환경변수가 필요합니다.");

  const client = new PublicDataClient({ serviceKey: key });
  const now = new Date();
  console.log(`BUSTA 수집 ${now.toISOString()} (KST ${todayInKorea(now)})`);
  const { failures } = await collectObservations(client, outDir, now);
  if (process.argv.includes("--timetables")) await archiveTimetables(client, outDir, now);

  // 모든 노선이 실패하면 CI 에서 알 수 있게 실패 코드로 끝낸다
  const expressCount = TAGO_ROUTES.filter((r) => r.tago.service === "express").length;
  if (failures.length === expressCount) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
