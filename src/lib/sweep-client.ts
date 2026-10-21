/**
 * Browser-side request discipline for /api/cliff-sweep.
 *
 * - `postWithRetry` retries once on a gateway status (502/503/504). A cold
 *   engine container can blow the first request's time budget; by the retry
 *   it is warm.
 * - `createLatestGate` drops stale responses. Requests are not cancelled, so
 *   without a gate a slow response that lands after a newer one overwrites
 *   it — the chart snapping back to an old household, or a Colorado reform
 *   landing on the New York chart after a state switch.
 */

export const RETRY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function postWithRetry(
  send: () => Promise<Response>,
  { retries = 1, delayMs = 1000, sleep = wait }: {
    retries?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<Response> {
  let response = await send();
  for (let attempt = 0; attempt < retries && RETRY_STATUSES.has(response.status); attempt++) {
    await sleep(delayMs);
    response = await send();
  }
  return response;
}

export interface LatestGate {
  /** Start a request and return its ticket; supersedes every earlier ticket. */
  begin(): number;
  /** Supersede every outstanding ticket without starting a request. */
  invalidate(): void;
  /** True only for the most recently begun ticket, until it is superseded. */
  isCurrent(ticket: number): boolean;
}

export function createLatestGate(): LatestGate {
  let current = 0;
  return {
    begin: () => ++current,
    invalidate: () => {
      current++;
    },
    isCurrent: (ticket) => ticket === current,
  };
}
