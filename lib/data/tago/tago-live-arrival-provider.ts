/**
 * TAGO 고속버스도착정보 기반 운행 중 버스 정보. 고속버스 노선만 지원한다 (시외버스는 해당 API 없음).
 * 원본 데이터가 약 15분 주기로 갱신되므로 1분만 캐시한다.
 */
import type { TagoRoute } from "@/data/catalog/tago-routes";
import { extractItems, PublicDataApiError, type PublicDataClient } from "@/lib/data/public-data/client";
import type { DataSourceInfo } from "@/types/domain";
import { ScheduleUnavailableError, type LiveArrivalProvider, type LiveSnapshot } from "../types";
import { parseArrivalSnapshot, type TagoArrivalItem } from "./arrival";

export const TAGO_ARRIVAL_SOURCE: DataSourceInfo = {
  kind: "public-api",
  label: "공공데이터포털 TAGO 고속버스도착정보",
  description:
    "운행 중인 고속버스의 위치 기반 도착 정보입니다. 실시간이 아니며 표시된 기준 시각의 데이터입니다.",
  isRealData: true,
};

const PATH = "/1613000/ExpBusArrInfo/GetExpBusArrPrdtInfo";

/** 고속버스정보 터미널 ID(NAEK400) → 도착정보 터미널 코드(400) */
export const toArrivalTerminalCode = (terminalId: string) =>
  /^NAEK\d{3}$/.test(terminalId) ? terminalId.slice(4) : null;

export class TagoLiveArrivalProvider implements LiveArrivalProvider {
  readonly source = TAGO_ARRIVAL_SOURCE;
  private readonly cache = new Map<string, { expires: number; value: Promise<LiveSnapshot> }>();

  constructor(
    private readonly client: PublicDataClient,
    private readonly routes: TagoRoute[],
    private readonly cacheTtlMs = 60_000,
  ) {}

  async getLiveSnapshot(routeId: string): Promise<LiveSnapshot | null> {
    const route = this.routes.find((r) => r.id === routeId);
    if (!route || route.tago.service !== "express") return null;
    const dep = toArrivalTerminalCode(route.tago.depTerminalId);
    const arr = toArrivalTerminalCode(route.tago.arrTerminalId);
    if (!dep || !arr) return null;

    const key = `${dep}>${arr}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = this.load(dep, arr);
    this.cache.set(key, { expires: Date.now() + this.cacheTtlMs, value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  private async load(depTmnCd: string, arrTmnCd: string): Promise<LiveSnapshot> {
    try {
      const json = await this.client.getJson(PATH, { depTmnCd, arrTmnCd, numOfRows: 200, pageNo: 1 });
      return parseArrivalSnapshot(extractItems<TagoArrivalItem>(json));
    } catch (e) {
      const reason = e instanceof PublicDataApiError ? e.message : "알 수 없는 오류";
      throw new ScheduleUnavailableError(`TAGO 도착정보 조회 실패 (${reason})`, { cause: e });
    }
  }
}
