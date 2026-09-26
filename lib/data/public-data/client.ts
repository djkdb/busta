/**
 * 공공데이터포털(apis.data.go.kr) 공통 클라이언트.
 *
 * 실제 응답에서 확인한 규칙 (2026-09-26, tests/fixtures/data-go-kr)
 *  - 정상: HTTP 200, { response: { header: { resultCode: "00" }, body: {...} } }
 *  - 인증 오류: HTTP 403, { OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg, returnAuthMsg } } }
 *  - 잘못된 파라미터(날짜 형식 등)는 오류 없이 0건으로 온다 → 호출 측에서 입력을 검증해야 한다.
 *
 * 보안: 서비스 키는 URL 쿼리에 들어가므로 에러 메시지·로그에 URL 을 절대 넣지 않는다.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PublicDataApiError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "http" | "auth" | "api" | "parse",
  ) {
    super(message);
    this.name = "PublicDataApiError";
  }
}

export interface PublicDataClientOptions {
  serviceKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  retries?: number;
  timeoutMs?: number;
  /** 테스트에서 재시도 대기를 없애기 위해 주입 */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class PublicDataClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: PublicDataClientOptions) {
    if (!options.serviceKey) throw new Error("공공데이터포털 서비스 키가 비어 있습니다.");
    this.baseUrl = options.baseUrl ?? "https://apis.data.go.kr";
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.retries = options.retries ?? 3;
    // 정상 응답은 1초 안팎. 끊긴 연결을 오래 붙잡지 않고 빨리 재시도하기 위해 짧게 둔다.
    this.timeoutMs = options.timeoutMs ?? 4_000;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * @param path 예) "/1613000/ExpBusInfo/GetStrtpntAlocFndExpbusInfo"
   * @param keyParam 서비스마다 대소문자가 다르다 (TAGO: serviceKey, 특일정보: ServiceKey)
   */
  async getJson(
    path: string,
    params: Record<string, string | number>,
    keyParam: "serviceKey" | "ServiceKey" = "serviceKey",
  ): Promise<unknown> {
    const query = new URLSearchParams({ _type: "json" });
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    query.set(keyParam, this.options.serviceKey);
    const url = `${this.baseUrl}${path}?${query}`;

    let lastError: PublicDataApiError | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.sleep(300 * 3 ** (attempt - 1));
      try {
        return await this.requestOnce(url, path);
      } catch (e) {
        lastError = e as PublicDataApiError;
        // 인증·API 오류는 재시도해도 같은 결과
        if (lastError.kind === "auth" || lastError.kind === "api") throw lastError;
      }
    }
    throw lastError!;
  }

  private async requestOnce(url: string, path: string): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new PublicDataApiError(`${path}: 네트워크 오류`, "network");
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new PublicDataApiError(`${path}: JSON 이 아닌 응답 (HTTP ${res.status})`, res.ok ? "parse" : "http");
    }

    const authHeader = (json as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string } } })
      .OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (authHeader) {
      throw new PublicDataApiError(
        `${path}: ${authHeader.returnAuthMsg ?? authHeader.errMsg ?? "인증 오류"}`,
        "auth",
      );
    }
    if (!res.ok) throw new PublicDataApiError(`${path}: HTTP ${res.status}`, "http");

    const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } }).response?.header;
    if (!header) throw new PublicDataApiError(`${path}: 응답 형식을 알 수 없음`, "parse");
    if (header.resultCode !== "00") {
      throw new PublicDataApiError(`${path}: ${header.resultMsg ?? "API 오류"} (${header.resultCode})`, "api");
    }
    return json;
  }
}

/**
 * 공공데이터포털 응답의 items 를 배열로 정규화한다.
 * 결과가 1건이면 item 이 객체로, 0건이면 "" 또는 { item: [] } 로 오는 경우가 있다.
 */
export function extractItems<T>(json: unknown): T[] {
  const body = (json as { response?: { body?: { items?: unknown } } }).response?.body;
  const items = body?.items;
  if (!items || typeof items !== "object") return [];
  const item = (items as { item?: T | T[] }).item;
  if (item === undefined || item === null) return [];
  return Array.isArray(item) ? item : [item];
}
