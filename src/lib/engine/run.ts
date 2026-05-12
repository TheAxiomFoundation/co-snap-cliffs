/**
 * Engine adapter — TypeScript wrapper around the axiom-rules-engine Rust binary.
 *
 * Two run modes:
 *   - `runCompiled(slug, request)` — runs the prebuilt artifact at
 *     `engine/artifacts/<slug>.compiled.json`. Used for the baseline (no
 *     parameter overrides) so we avoid the recompile cost.
 *   - `runWithProgram(programYamlPath, request)` — runs the full
 *     execute path with a freshly compiled (in-memory) program. Used when the
 *     caller has patched RuleSpec YAMLs to apply parameter overrides.
 *
 * Both transports fall back to local subprocess when AXIOM_ENGINE_URL is unset.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { ExecutionRequest, ExecutionResponse } from "./types";

const ROOT = path.resolve(process.cwd());
const BINARY =
  process.env.AXIOM_RULES_ENGINE_BINARY ||
  path.join(ROOT, "engine/axiom-rules-engine/target/release/axiom-rules-engine");
const ARTIFACTS_DIR =
  process.env.AXIOM_ARTIFACTS_DIR || path.join(ROOT, "engine/artifacts");

const ENGINE_URL = process.env.AXIOM_ENGINE_URL?.replace(/\/$/, "");

let cachedBinaryOk: boolean | null = null;
async function ensureBinary(): Promise<void> {
  if (cachedBinaryOk) return;
  try {
    await fs.access(BINARY, fs.constants.X_OK);
    cachedBinaryOk = true;
  } catch {
    throw new Error(
      `axiom-rules-engine binary not found at ${BINARY}. Run \`bun run engine:setup\` (or set AXIOM_RULES_ENGINE_BINARY).`,
    );
  }
}

async function artifactPath(slug: string): Promise<string> {
  const p = path.join(ARTIFACTS_DIR, `${slug}.compiled.json`);
  await fs.access(p, fs.constants.R_OK);
  return p;
}

/** Run a precompiled artifact. */
export async function runCompiled(
  slug: string,
  request: ExecutionRequest,
): Promise<ExecutionResponse> {
  if (ENGINE_URL) {
    const r = await fetch(`${ENGINE_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program: slug, request }),
    });
    if (!r.ok) throw new Error(`axiom-engine ${r.status}: ${(await r.text()).slice(0, 500)}`);
    return (await r.json()) as ExecutionResponse;
  }
  await ensureBinary();
  const artifact = await artifactPath(slug);
  return spawnEngine(["run-compiled", "--artifact", artifact], request);
}

/** Run a freshly compiled program against the engine's execute path.
 *
 *  Internally invokes `axiom-rules-engine compile` to produce a scratch
 *  artifact, then `run-compiled` against it. This is the path used when
 *  parameters have been overridden — see lib/engine/patch-params.ts.
 *
 *  The temp artifact lives under engine/artifacts/.tmp-<token>.json and is
 *  cleaned up after the run.
 */
export async function runWithProgram(
  programYamlPath: string,
  request: ExecutionRequest,
): Promise<ExecutionResponse> {
  await ensureBinary();
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const token = Math.random().toString(36).slice(2, 10);
  const tmpArtifact = path.join(ARTIFACTS_DIR, `.tmp-${token}.compiled.json`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        BINARY,
        ["compile", "--program", programYamlPath, "--output", tmpArtifact],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (b) => (stderr += b.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) reject(new Error(`compile failed (${code}): ${stderr.trim()}`));
        else resolve();
      });
    });
    return await spawnEngine(["run-compiled", "--artifact", tmpArtifact], request);
  } finally {
    await fs.rm(tmpArtifact, { force: true });
  }
}

function spawnEngine(args: string[], request: ExecutionRequest): Promise<ExecutionResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(BINARY, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`axiom-rules-engine exited ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`could not parse engine output: ${(err as Error).message}`));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
