/**
 * Engine adapter — Vercel/local-dev wrapper around axiom-rules-engine.
 *
 * Two transports for the same wire shape:
 *
 * 1. `AXIOM_ENGINE_URL` set (production / Vercel) → POST {program, request,
 *    overrides?} to the Modal-hosted service. Modal handles both prebuilt
 *    runs and override-driven patch+compile+run; see modal_app.py.
 * 2. Unset (local dev) → spawn the local binary. With overrides, we patch
 *    the rulespec tree on disk via patch-params.ts and compile per request.
 *
 * Callers don't pick a transport; they call `runEngine(slug, request,
 * overrides?)` and the env var selects.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { ExecutionRequest, ExecutionResponse } from "./types";
import type { ParameterOverride } from "./patch-params";

const ROOT = path.resolve(process.cwd());
const BINARY =
  process.env.AXIOM_RULES_ENGINE_BINARY ||
  path.join(ROOT, "engine/axiom-rules-engine/target/release/axiom-rules-engine");
const ARTIFACTS_DIR =
  process.env.AXIOM_ARTIFACTS_DIR || path.join(ROOT, "engine/artifacts");

const ENGINE_URL = process.env.AXIOM_ENGINE_URL?.replace(/\/$/, "");

/** Single entry point. When `overrides` is empty, the prebuilt artifact is
 *  used; otherwise the engine compiles a patched program first. */
export async function runEngine(
  slug: string,
  request: ExecutionRequest,
  overrides: ParameterOverride[] = [],
): Promise<ExecutionResponse> {
  if (ENGINE_URL) return runViaHttp(slug, request, overrides);
  if (overrides.length === 0) return runViaSubprocess(["run-compiled", "--artifact", await artifactPath(slug)], request);
  // Local override path: patch on disk, compile, run.
  const { writePatchedRulespec } = await import("./patch-params");
  const programYaml = await writePatchedRulespec(overrides);
  return runWithProgramLocal(programYaml, request);
}

async function runViaHttp(
  slug: string,
  request: ExecutionRequest,
  overrides: ParameterOverride[],
): Promise<ExecutionResponse> {
  const r = await fetch(`${ENGINE_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ program: slug, request, overrides }),
  });
  if (!r.ok) {
    throw new Error(`axiom-engine ${r.status}: ${(await r.text()).slice(0, 500)}`);
  }
  return (await r.json()) as ExecutionResponse;
}

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
  await ensureBinary();
  const p = path.join(ARTIFACTS_DIR, `${slug}.compiled.json`);
  await fs.access(p, fs.constants.R_OK);
  return p;
}

async function runWithProgramLocal(
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
    return await runViaSubprocess(["run-compiled", "--artifact", tmpArtifact], request);
  } finally {
    await fs.rm(tmpArtifact, { force: true });
  }
}

function runViaSubprocess(
  args: string[],
  request: ExecutionRequest,
): Promise<ExecutionResponse> {
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
