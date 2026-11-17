/**
 * 관측 기록 저장소. 수집기는 로컬 디렉터리에 쓰고, 앱은 디렉터리 또는 URL(예: busta-data 브랜치의
 * raw.githubusercontent.com 주소)에서 읽는다. 파일 구조: observations/YYYY-MM.jsonl
 */
import type { FetchLike } from "@/lib/data/public-data/client";
import { parseJsonl, type ObservationRecord } from "./record";

export interface ObservationStore {
  readonly description: string;
  /** 없는 달은 빈 배열. 읽기 실패는 던진다 */
  loadMonths(months: string[]): Promise<{ records: ObservationRecord[]; skipped: number }>;
}

async function combine(
  months: string[],
  read: (month: string) => Promise<string | null>,
): Promise<{ records: ObservationRecord[]; skipped: number }> {
  const texts = await Promise.all(months.map(read));
  let skipped = 0;
  const records: ObservationRecord[] = [];
  for (const text of texts) {
    if (!text) continue;
    const parsed = parseJsonl(text);
    records.push(...parsed.records);
    skipped += parsed.skipped;
  }
  return { records, skipped };
}

export class FileObservationStore implements ObservationStore {
  constructor(private readonly dir: string) {}
  get description() {
    return `local:${this.dir}`;
  }
  async loadMonths(months: string[]) {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return combine(months, async (m) => {
      try {
        return await readFile(join(this.dir, `${m}.jsonl`), "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    });
  }
}

export class HttpObservationStore implements ObservationStore {
  private readonly fetchImpl: FetchLike;
  constructor(
    private readonly baseUrl: string,
    fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }
  get description() {
    return this.baseUrl;
  }
  async loadMonths(months: string[]) {
    return combine(months, async (m) => {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/${m}.jsonl`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`관측 기록 조회 실패: HTTP ${res.status}`);
      return res.text();
    });
  }
}
