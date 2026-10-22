import { describe, expect, it } from "vitest";

import { EngineTimeoutError, postEngine } from "./run";

/** A fetch that never answers but honours its abort signal, like a request
 *  to a container that is still copying trees. */
const hangingFetch: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

describe("postEngine", () => {
  it("turns a hung upstream into EngineTimeoutError", async () => {
    const call = postEngine("/cliff-sweep", {}, {
      baseUrl: "https://engine.test",
      timeoutMs: 20,
      fetchImpl: hangingFetch,
    });
    await expect(call).rejects.toBeInstanceOf(EngineTimeoutError);
    await expect(call).rejects.toThrow("timed out after 0s");
  });

  it("surfaces the upstream status on a non-2xx response", async () => {
    const fetchImpl: typeof fetch = async () => new Response("boom", { status: 500 });
    await expect(
      postEngine("/run", {}, { baseUrl: "https://engine.test", fetchImpl }),
    ).rejects.toThrow("axiom-engine 500: boom");
  });

  it("posts JSON to baseUrl + path and returns the parsed body", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const fetchImpl: typeof fetch = async (url, init) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)) };
      return Response.json({ ok: true });
    };
    const result = await postEngine<{ ok: boolean }>("/run", { a: 1 }, {
      baseUrl: "https://engine.test",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ url: "https://engine.test/run", body: { a: 1 } });
  });
});
