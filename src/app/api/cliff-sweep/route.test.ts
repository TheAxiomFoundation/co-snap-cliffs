import { beforeEach, describe, expect, it, vi } from "vitest";

import { EngineTimeoutError } from "@/lib/engine/run";

const runCliffSweep = vi.fn();
vi.mock("@/lib/cliffs", () => ({ runCliffSweep: (...args: unknown[]) => runCliffSweep(...args) }));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://test/api/cliff-sweep", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/cliff-sweep", () => {
  beforeEach(() => {
    runCliffSweep.mockReset();
  });

  it("answers 504 when the engine times out, before the platform kills the function", async () => {
    runCliffSweep.mockImplementation(async () => {
      throw new EngineTimeoutError(50_000);
    });
    const r = await post({ program: "ny-snap" });
    expect(r.status).toBe(504);
    expect(await r.json()).toEqual({
      error: "engine timeout",
      detail: "axiom-engine timed out after 50s",
    });
  });

  it("answers 500 for other engine failures", async () => {
    runCliffSweep.mockImplementation(async () => {
      throw new Error("axiom-engine 500: boom");
    });
    const r = await post({ program: "co-snap" });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("compute failed");
  });

  it("answers 400 for an invalid body without calling the engine", async () => {
    const r = await post({ program: "tx-snap" });
    expect(r.status).toBe(400);
    expect(runCliffSweep).not.toHaveBeenCalled();
  });

  it("passes the reform through as overrides", async () => {
    runCliffSweep.mockResolvedValue({ points: [], summary: {}, ms: 1 });
    const r = await post({ program: "ny-snap", parameter_multipliers: { max_allotment_scale: 1.5 } });
    expect(r.status).toBe(200);
    const [opts] = runCliffSweep.mock.calls[0];
    expect(opts.program).toBe("ny-snap");
    expect(opts.parameter_overrides.map((o: { parameter: string }) => o.parameter)).toEqual([
      "snap_maximum_allotment_table",
      "snap_maximum_allotment_additional_member",
    ]);
  });
});
