import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { createLatestGate, postWithRetry, RETRY_STATUSES } from "./sweep-client";

const STATUSES = [200, 400, 500, 502, 503, 504];
const respond = (status: number) => new Response(null, { status });
const noSleep = () => Promise.resolve();

describe("postWithRetry", () => {
  it("resends only on gateway statuses, at most `retries` times", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.array(fc.constantFrom(...STATUSES), { minLength: 4, maxLength: 4 }),
        async (retries, statuses) => {
          let sends = 0;
          const response = await postWithRetry(async () => respond(statuses[sends++]), {
            retries,
            sleep: noSleep,
          });
          // Model: keep sending while the last status is retryable and
          // retries remain.
          let expected = 1;
          while (expected - 1 < retries && RETRY_STATUSES.has(statuses[expected - 1])) expected++;
          expect(sends).toBe(expected);
          expect(response.status).toBe(statuses[expected - 1]);
        },
      ),
    );
  });

  it("waits between attempts", async () => {
    const sleep = vi.fn(noSleep);
    const statuses = [504, 200];
    await postWithRetry(async () => respond(statuses.shift()!), { delayMs: 1234, sleep });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1234);
  });

  it("does not retry client errors or engine failures", async () => {
    for (const status of [400, 500]) {
      const send = vi.fn(async () => respond(status));
      expect((await postWithRetry(send, { sleep: noSleep })).status).toBe(status);
      expect(send).toHaveBeenCalledOnce();
    }
  });
});

describe("createLatestGate", () => {
  it("lets exactly the newest request apply, whatever order responses land in", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          fc.tuple(fc.constant(n), fc.shuffledSubarray([...Array(n).keys()], { minLength: n })),
        ),
        ([n, landingOrder]) => {
          const gate = createLatestGate();
          const tickets = Array.from({ length: n }, () => gate.begin());
          const applied = landingOrder.filter((i) => gate.isCurrent(tickets[i]));
          expect(applied).toEqual([n - 1]);
        },
      ),
    );
  });

  it("drops everything in flight once invalidated", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (n) => {
        const gate = createLatestGate();
        const tickets = Array.from({ length: n }, () => gate.begin());
        gate.invalidate();
        expect(tickets.some((t) => gate.isCurrent(t))).toBe(false);
        expect(gate.isCurrent(gate.begin())).toBe(true);
      }),
    );
  });

  it("matches a model under any sequence of begins, invalidations and checks", () => {
    type Op = { kind: "begin" } | { kind: "invalidate" } | { kind: "check"; pick: number };
    const op: fc.Arbitrary<Op> = fc.oneof(
      fc.constant({ kind: "begin" as const }),
      fc.constant({ kind: "invalidate" as const }),
      fc.record({ kind: fc.constant("check" as const), pick: fc.nat() }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        const gate = createLatestGate();
        const tickets: number[] = [];
        let live: number | null = null; // model: the one ticket allowed to apply
        for (const o of ops) {
          if (o.kind === "begin") {
            live = gate.begin();
            tickets.push(live);
          } else if (o.kind === "invalidate") {
            gate.invalidate();
            live = null;
          } else if (tickets.length) {
            const t = tickets[o.pick % tickets.length];
            expect(gate.isCurrent(t)).toBe(t === live);
          }
        }
      }),
    );
  });
});
